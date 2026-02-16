import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import type {
    DuplicateGameObjectOptions, DuplicateGameObjectResult,
    UnpackPrefabOptions, UnpackPrefabResult,
} from '../types';
import { find_unity_project_root } from '../utils';
import { getNativeBuildGuidCache } from '../scanner';
import { UnityDocument } from './unity-document';
import type { UnityBlock } from './unity-block';

// ========== Private Helpers ==========

/**
 * Find a PrefabInstance by the display name from m_Modifications (m_Name override).
 * Returns the PrefabInstance fileID if found.
 */
function findPrefabInstanceByName(doc: UnityDocument, name: string): { id: number } | null {
  const piBlocks = doc.find_by_class_id(1001);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`propertyPath:\\s*m_Name\\s+value:\\s*${escapedName}\\s`);

  for (const block of piBlocks) {
    if (namePattern.test(block.raw)) {
      return { id: parseInt(block.file_id, 10) };
    }
  }
  return null;
}

// ========== Exported Functions ==========

/**
 * Duplicate a GameObject (and its entire hierarchy) within the same file.
 */
export function duplicateGameObject(options: DuplicateGameObjectOptions): DuplicateGameObjectResult {
  const { file_path, object_name, new_name } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const goResult = doc.require_unique_game_object(object_name);
  if ('error' in goResult) {
    // Check if the name matches a PrefabInstance (via m_Modifications m_Name override)
    const piMatch = findPrefabInstanceByName(doc, object_name);
    if (piMatch) {
      return { success: false, file_path, error: `"${object_name}" is a PrefabInstance (fileID: ${piMatch.id}). Cloning PrefabInstances is not yet supported. Consider unpacking it first with \`update prefab\`.` };
    }
    return { success: false, file_path, error: goResult.error };
  }
  const goBlock = goResult;
  const goFileId = goBlock.file_id;

  // Collect all component fileIDs
  const componentIds: string[] = [];
  const compMatches = goBlock.raw.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.push(cm[1]);
  }

  // Find the Transform (first component)
  let transformId: string | null = null;
  let fatherId = '0';

  for (const compId of componentIds) {
    const compBlock = doc.find_by_file_id(compId);
    if (compBlock && compBlock.class_id === 4) {
      transformId = compId;
      const fatherMatch = compBlock.raw.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
      if (fatherMatch) {
        fatherId = fatherMatch[1];
      }
      break;
    }
  }

  // Build full set of IDs to duplicate
  const allOldIds = new Set<string>([goFileId, ...componentIds]);
  if (transformId !== null) {
    const descendants = doc.collect_hierarchy(transformId);
    for (const id of descendants) {
      allOldIds.add(id);
    }
  }

  // Generate new IDs for each old ID (manually track to avoid collisions)
  const existing = doc.all_file_ids();
  const idMap = new Map<string, string>();
  for (const oldId of allOldIds) {
    let newId: string;
    do {
      newId = String(Math.floor(Math.random() * 9000000000) + 1000000000);
    } while (existing.has(newId) || newId === '0');
    existing.add(newId);
    idMap.set(oldId, newId);
  }

  // Calculate m_RootOrder BEFORE appending blocks
  const rootOrder = transformId !== null ? doc.calculate_root_order(fatherId) : 0;

  // Clone all blocks and remap IDs
  for (const block of doc.blocks) {
    if (allOldIds.has(block.file_id)) {
      const cloned = block.clone();
      for (const [oldId, newId] of idMap) {
        cloned.remap_file_id(oldId, newId);
      }
      doc.append_block(cloned);
    }
  }

  // Set m_Name on the cloned root GO
  const actualName = goBlock.get_property('m_Name') || object_name;
  const finalName = new_name || `${actualName} (1)`;
  const clonedGoBlock = doc.find_by_file_id(idMap.get(goFileId)!);
  if (clonedGoBlock) {
    clonedGoBlock.set_property('m_Name', finalName);
  }

  // Set m_RootOrder on the cloned root Transform
  if (transformId !== null) {
    const clonedTransformBlock = doc.find_by_file_id(idMap.get(transformId)!);
    if (clonedTransformBlock) {
      // Check if m_RootOrder exists, if not, insert it after m_Father
      let raw = clonedTransformBlock.raw;
      if (/m_RootOrder:\s*\d+/.test(raw)) {
        raw = raw.replace(/m_RootOrder:\s*\d+/, `m_RootOrder: ${rootOrder}`);
      } else {
        // Insert after m_Father line
        raw = raw.replace(
          /(m_Father:\s*\{fileID:\s*\d+\})/,
          `$1\n  m_RootOrder: ${rootOrder}`
        );
      }
      clonedTransformBlock.replace_raw(raw);
    }
  }

  // Collect cloned GameObject names and fileIDs for caller reference
  const clonedObjects: Array<{ name: string; file_id: number }> = [];
  for (const oldId of allOldIds) {
    const originalBlock = doc.find_by_file_id(oldId);
    if (originalBlock && originalBlock.class_id === 1) {
      const newId = idMap.get(oldId);
      if (newId) {
        const clonedBlock = doc.find_by_file_id(newId);
        if (clonedBlock) {
          const name = clonedBlock.get_property('m_Name') || '';
          clonedObjects.push({ name, file_id: parseInt(newId, 10) });
        }
      }
    }
  }

  // If source had a parent, add cloned Transform to parent's m_Children
  const newTransformId = transformId !== null ? idMap.get(transformId)! : null;
  if (fatherId !== '0' && newTransformId !== null) {
    doc.add_child_to_parent(fatherId, newTransformId);
  }

  // Detect duplicate names among cloned children vs all scene GOs
  const warnings: string[] = [];
  const allGoBlocks = doc.find_by_class_id(1);
  const sceneNameCounts = new Map<string, number>();
  for (const block of allGoBlocks) {
    const n = block.get_property('m_Name') || '';
    sceneNameCounts.set(n, (sceneNameCounts.get(n) || 0) + 1);
  }
  for (const cloned of clonedObjects) {
    const count = sceneNameCounts.get(cloned.name) || 0;
    if (count >= 2) {
      warnings.push(`Duplicate name "${cloned.name}" now appears ${count} times in scene. Use fileID ${cloned.file_id} to target this clone.`);
    }
  }

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after duplicating GameObject' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    game_object_id: idMap.get(goFileId) ? parseInt(idMap.get(goFileId)!, 10) : undefined,
    transform_id: newTransformId ? parseInt(newTransformId, 10) : undefined,
    total_duplicated: allOldIds.size,
    cloned_objects: clonedObjects,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Unpack a PrefabInstance in a scene file, converting it to standalone GameObjects.
 */
export function unpackPrefab(options: UnpackPrefabOptions): UnpackPrefabResult {
  const { file_path, prefab_instance, project_path } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let sceneDoc: UnityDocument;
  try {
    sceneDoc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find the PrefabInstance block - try by fileID first, then by name in modifications
  let prefabInstanceBlock: UnityBlock | null = null;

  // Try as fileID
  const asNumber = parseInt(prefab_instance, 10);
  if (!isNaN(asNumber)) {
    const block = sceneDoc.find_by_file_id(String(asNumber));
    if (block && block.class_id === 1001) {
      prefabInstanceBlock = block;
    }
  }

  // Try by name in m_Modifications (look for m_Name modification)
  if (!prefabInstanceBlock) {
    const piBlocks = sceneDoc.find_by_class_id(1001);
    const escapedName = prefab_instance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameModPattern = new RegExp(`propertyPath: m_Name\\s*\\n\\s*value: ${escapedName}\\s*$`, 'm');
    for (const block of piBlocks) {
      if (nameModPattern.test(block.raw)) {
        prefabInstanceBlock = block;
        break;
      }
    }
  }

  if (!prefabInstanceBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  const prefabInstanceId = prefabInstanceBlock.file_id;

  // Extract m_SourcePrefab guid (handle potential multi-line YAML)
  const sourcePrefabMatch = prefabInstanceBlock.raw.match(/m_SourcePrefab:[\s\S]*?guid:\s*([a-f0-9]+)/);
  if (!sourcePrefabMatch) {
    return { success: false, file_path, error: `Could not find m_SourcePrefab GUID in PrefabInstance block (fileID: ${prefabInstanceId})` };
  }
  const sourcePrefabGuid = sourcePrefabMatch[1];

  // Resolve the source prefab file path via GUID cache or .meta search
  let sourcePrefabPath: string | null = null;

  if (project_path) {
    const cachePath = path.join(project_path, '.unity-agentic', 'guid-cache.json');
    if (existsSync(cachePath)) {
      try {
        const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
        if (cache[sourcePrefabGuid]) {
          const cachedPath = cache[sourcePrefabGuid];
          sourcePrefabPath = path.isAbsolute(cachedPath)
            ? cachedPath
            : path.join(project_path, cachedPath);
        }
      } catch { /* ignore */ }
    }
  }

  // Fallback: build fresh GUID cache via native module
  if (!sourcePrefabPath || !existsSync(sourcePrefabPath)) {
    const inferredProject = project_path || find_unity_project_root(path.dirname(file_path));
    if (inferredProject) {
      const nativeBuild = getNativeBuildGuidCache();
      if (nativeBuild) {
        try {
          const freshCache = nativeBuild(inferredProject) as Record<string, string>;
          if (freshCache[sourcePrefabGuid]) {
            sourcePrefabPath = path.join(inferredProject, freshCache[sourcePrefabGuid]);
          }
        } catch { /* ignore native cache errors */ }
      }
    }
  }

  if (!sourcePrefabPath || !existsSync(sourcePrefabPath)) {
    const searchedPaths: string[] = [];
    if (project_path) searchedPaths.push(`GUID cache: ${path.join(project_path, '.unity-agentic', 'guid-cache.json')}`);
    const inferredProject = project_path || find_unity_project_root(path.dirname(file_path));
    if (inferredProject) searchedPaths.push(`Native GUID rebuild from: ${inferredProject}`);
    const searchInfo = searchedPaths.length > 0 ? ` Searched: ${searchedPaths.join('; ')}` : '';
    return { success: false, file_path, error: `Could not resolve source prefab with GUID ${sourcePrefabGuid}.${searchInfo} Provide --project path or run 'unity-agentic-tools setup'.` };
  }

  // Read source prefab
  let prefabDoc: UnityDocument;
  try {
    prefabDoc = UnityDocument.from_file(sourcePrefabPath);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Collect all block fileIDs from the prefab
  const prefabIds = prefabDoc.all_file_ids();

  // Generate new fileIDs for each prefab block (manually track to avoid collisions)
  const existing = sceneDoc.all_file_ids();
  const idMap = new Map<string, string>();
  for (const oldId of prefabIds) {
    let newId: string;
    do {
      newId = String(Math.floor(Math.random() * 9000000000) + 1000000000);
    } while (existing.has(newId) || newId === '0');
    existing.add(newId);
    idMap.set(oldId, newId);
  }

  // Parse m_RemovedComponents
  const removedComponents = new Set<string>();
  const removedSection = prefabInstanceBlock.raw.match(/m_RemovedComponents:\s*\n((?:\s*-\s*\{[^}]+\}\s*\n)*)/);
  if (removedSection) {
    const removedMatches = removedSection[1].matchAll(/fileID:\s*(\d+)/g);
    for (const rm of removedMatches) {
      removedComponents.add(rm[1]);
    }
  }

  // Clone all prefab blocks (skipping removed components)
  const clonedBlocks: UnityBlock[] = [];
  for (const block of prefabDoc.blocks) {
    if (removedComponents.has(block.file_id)) continue;

    const cloned = block.clone();
    for (const [oldId, newId] of idMap) {
      cloned.remap_file_id(oldId, newId);
    }

    // Remove prefab-related fields from cloned blocks
    let raw = cloned.raw;
    raw = raw.replace(/\s*m_CorrespondingSourceObject:\s*\{[^}]+\}\n?/, '\n  m_CorrespondingSourceObject: {fileID: 0}\n');
    raw = raw.replace(/\s*m_PrefabInstance:\s*\{[^}]+\}\n?/, '\n  m_PrefabInstance: {fileID: 0}\n');
    raw = raw.replace(/\s*m_PrefabAsset:\s*\{[^}]+\}\n?/, '\n  m_PrefabAsset: {fileID: 0}\n');
    cloned.replace_raw(raw);

    clonedBlocks.push(cloned);
  }

  // Parse and apply m_Modifications
  const modificationsSection = prefabInstanceBlock.raw.match(/m_Modifications:\s*\n((?:\s*-\s*target:[\s\S]*?(?=\s*m_RemovedComponents:|\s*m_RemovedGameObjects:|\s*m_AddedGameObjects:|\s*m_AddedComponents:|\s*m_SourcePrefab:))?)/);
  if (modificationsSection) {
    const modEntries = modificationsSection[1].split(/\n\s*-\s*target:/).filter(s => s.trim());

    for (const entry of modEntries) {
      const targetIdMatch = entry.match(/\{fileID:\s*(\d+)/);
      const propPathMatch = entry.match(/propertyPath:\s*(.+)/);
      const valueMatch = entry.match(/value:\s*(.*)/);
      const objRefMatch = entry.match(/objectReference:\s*(\{[^}]*\})/);

      if (targetIdMatch && propPathMatch) {
        const targetOldId = targetIdMatch[1];
        const targetNewId = idMap.get(targetOldId);
        if (targetNewId === undefined) continue;

        const propertyPath = propPathMatch[1].trim();
        const value = valueMatch ? valueMatch[1].trim() : '';
        const objectReference = objRefMatch ? objRefMatch[1].trim() : '{fileID: 0}';

        // Remap objectReference fileIDs
        let remappedObjRef = objectReference;
        if (objectReference !== '{fileID: 0}') {
          remappedObjRef = objectReference.replace(/(\{fileID:\s*)(\d+)/g, (match, prefix, oldId) => {
            if (oldId === '0') return match;
            return idMap.has(oldId) ? `${prefix}${idMap.get(oldId)}` : match;
          });
        }

        // Find and modify the cloned block
        for (const clonedBlock of clonedBlocks) {
          if (clonedBlock.file_id === targetNewId) {
            clonedBlock.set_property(propertyPath, value, remappedObjRef);
            break;
          }
        }
      }
    }
  }

  // Handle m_TransformParent
  const transformParentMatch = prefabInstanceBlock.raw.match(/m_TransformParent:\s*\{fileID:\s*(\d+)\}/);
  const transformParentId = transformParentMatch ? transformParentMatch[1] : '0';

  // Find the root Transform in cloned blocks and set m_Father
  const rootInfo = prefabDoc.find_prefab_root();
  if (rootInfo && idMap.has(rootInfo.transform.file_id)) {
    const newRootTransformId = idMap.get(rootInfo.transform.file_id)!;
    for (const clonedBlock of clonedBlocks) {
      if (clonedBlock.file_id === newRootTransformId && clonedBlock.class_id === 4) {
        clonedBlock.set_property('m_Father', `{fileID: ${transformParentId}}`);
        break;
      }
    }
  }

  // Find and remove all stripped blocks referencing this PrefabInstance
  const strippedBlockIds = new Set<string>();
  for (const block of sceneDoc.blocks) {
    if (block.is_stripped && block.raw.includes(`m_PrefabInstance: {fileID: ${prefabInstanceId}}`)) {
      strippedBlockIds.add(block.file_id);
    }
  }

  // Build set of blocks to remove: PrefabInstance + stripped blocks
  const blocksToRemove = new Set<string>([prefabInstanceId, ...strippedBlockIds]);
  sceneDoc.remove_blocks(blocksToRemove);

  // Append cloned blocks
  for (const clonedBlock of clonedBlocks) {
    sceneDoc.append_block(clonedBlock);
  }

  // If parent transform exists, add root Transform as child
  if (transformParentId !== '0' && rootInfo && idMap.has(rootInfo.transform.file_id)) {
    sceneDoc.add_child_to_parent(transformParentId, idMap.get(rootInfo.transform.file_id)!);
  }

  if (!sceneDoc.validate()) {
    return { success: false, file_path, error: 'Validation failed after unpacking prefab' };
  }

  const saveResult = sceneDoc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  const newRootGoId = rootInfo ? idMap.get(rootInfo.game_object.file_id) : undefined;

  return {
    success: true,
    file_path,
    unpacked_count: clonedBlocks.length,
    root_game_object_id: newRootGoId ? parseInt(newRootGoId, 10) : undefined
  };
}
