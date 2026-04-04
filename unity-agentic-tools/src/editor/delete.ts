import { existsSync } from 'fs';
import type {
    RemoveComponentOptions, RemoveComponentResult,
    DeleteGameObjectOptions, DeleteGameObjectResult,
    DeletePrefabInstanceOptions, DeletePrefabInstanceResult,
    BatchRemoveComponentOptions, BatchRemoveComponentResult,
} from '../types';
import { validate_file_path } from '../utils';
import { UnityDocument } from './unity-document';
import { UnityBlock } from './unity-block';
import { get_class_id } from '../class-ids';
import { resolveScriptGuid } from './shared';
import { walk_project_files } from '../project-search';

// ========== Helpers ==========

/**
 * Find a component block by type name within a document.
 * Searches by built-in class ID or MonoBehaviour m_Script GUID.
 * Optionally scoped to a specific GameObject.
 */
function find_component_by_type(
  doc: UnityDocument,
  type_name: string,
  game_object?: string,
  project_path?: string,
): UnityBlock | { error: string } {
  // Determine search scope
  let scope_blocks: UnityBlock[];
  if (game_object) {
    const goResult = doc.require_unique_game_object(game_object);
    if ('error' in goResult) return goResult;
    const comp_ids: string[] = [];
    const matches = goResult.raw.matchAll(/component:[ \t]*\{fileID:[ \t]*(-?\d+)\}/g);
    for (const m of matches) comp_ids.push(m[1]);
    scope_blocks = comp_ids
      .map(id => doc.find_by_file_id(id))
      .filter((b): b is UnityBlock => b !== null);
  } else {
    scope_blocks = doc.blocks.filter(b => b.class_id !== 1 && b.class_id !== 4 && b.class_id !== 224);
  }

  const candidates: UnityBlock[] = [];

  // Try built-in class ID match
  const class_id = get_class_id(type_name);
  if (class_id !== null) {
    for (const block of scope_blocks) {
      if (block.class_id === class_id) candidates.push(block);
    }
  } else {
    // Try MonoBehaviour script GUID match
    let resolved: { guid: string } | null = null;
    try {
      resolved = resolveScriptGuid(type_name, project_path);
    } catch { /* ambiguity errors already thrown */ }

    if (resolved) {
      for (const block of scope_blocks) {
        if (block.class_id !== 114) continue;
        const scriptMatch = block.raw.match(/m_Script:[ \t]*\{[^}]*guid:[ \t]*([a-f0-9]+)/);
        if (scriptMatch && scriptMatch[1] === resolved.guid) {
          candidates.push(block);
        }
      }
    } else {
      // Fallback: match MonoBehaviour blocks by type_name in raw YAML (for unknown scripts)
      // This handles cases where type registry is unavailable
      return { error: `Component type "${type_name}" not found. For MonoBehaviour scripts, ensure "unity-agentic-tools setup" has been run.` };
    }
  }

  if (candidates.length === 0) {
    return { error: `No "${type_name}" component found${game_object ? ` on "${game_object}"` : ''} in ${doc.file_path}` };
  }
  if (candidates.length > 1) {
    const ids = candidates.map(b => b.file_id).join(', ');
    return { error: `Multiple "${type_name}" components found (fileIDs: ${ids}). Use a numeric fileID to specify which one${game_object ? '' : ', or use --on <gameobject> to scope the search'}.` };
  }
  return candidates[0];
}

// ========== Exported Functions ==========

/**
 * Remove a component from a Unity YAML file by fileID or type name.
 */
export function removeComponent(options: RemoveComponentOptions): RemoveComponentResult {
  const { file_path, file_id, game_object, project_path } = options;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  let found: UnityBlock | null;

  // Detect: numeric = fileID, otherwise = type name
  if (/^-?\d+$/.test(file_id)) {
    found = doc.find_by_file_id(file_id);
    if (!found) {
      return { success: false, file_path, error: `Component with file ID ${file_id} not found` };
    }
  } else {
    const result = find_component_by_type(doc, file_id, game_object, project_path);
    if ('error' in result) {
      return { success: false, file_path, error: result.error };
    }
    found = result;
  }

  // Reject if it's a GameObject (1) or Transform (4)
  if (found.class_id === 1) {
    return { success: false, file_path, error: 'Cannot remove a GameObject with remove-component. Use delete instead.' };
  }
  if (found.class_id === 4) {
    return { success: false, file_path, error: 'Cannot remove a Transform with remove-component. Use delete to remove the entire GameObject.' };
  }

  const resolved_file_id = found.file_id;
  let removed_added_component_overrides = 0;

  // Extract m_GameObject from the component block and remove the component reference
  const goMatch = found.raw.match(/m_GameObject:[ \t]*\{fileID:[ \t]*(-?\d+)\}/);
  if (goMatch) {
    const parentGoId = goMatch[1];
    const goBlock = doc.find_by_file_id(parentGoId);
    if (goBlock) {
      const escaped = resolved_file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const compLinePattern = new RegExp(`^[ \\t]*- component: \\{fileID: ${escaped}\\}[ \\t]*\\n`, 'm');
      const modifiedRaw = goBlock.raw.replace(compLinePattern, '');
      if (modifiedRaw === goBlock.raw) {
        // Component reference line not found in parent GO -- warn but proceed
      }
      goBlock.replace_raw(modifiedRaw);

      if (goBlock.is_stripped) {
        const piMatch = goBlock.raw.match(/m_PrefabInstance:[ \t]*\{fileID:[ \t]*(-?\d+)\}/);
        if (piMatch) {
          const piBlock = doc.find_by_file_id(piMatch[1]);
          if (piBlock && piBlock.class_id === 1001) {
            const updated = removeAddedComponentOverrideEntries(piBlock.raw, resolved_file_id);
            if (updated.removed_count > 0) {
              piBlock.replace_raw(updated.updated_raw);
              removed_added_component_overrides += updated.removed_count;
            }
          }
        }
      }
    }
  }

  // Check for dangling PPtr references to the deleted component
  const dangling: string[] = [];
  for (const block of doc.blocks) {
    if (block.file_id === resolved_file_id) continue;
    if (block.raw.includes(`{fileID: ${resolved_file_id}}`)) {
      dangling.push(block.file_id);
    }
  }

  doc.remove_block(resolved_file_id);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after removing component' };
  }

  const writeResult = doc.save();
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    removed_file_id: resolved_file_id,
    removed_class_id: found.class_id,
    warning: dangling.length > 0
      ? `Dangling references to deleted component found in blocks: ${dangling.join(', ')}${removed_added_component_overrides > 0 ? ` (removed ${removed_added_component_overrides} m_AddedComponents override entr${removed_added_component_overrides === 1 ? 'y' : 'ies'})` : ''}`
      : undefined,
  };
}

/**
 * Remove a component by type name from all scenes and prefabs in a project.
 */
export function removeComponentBatch(options: BatchRemoveComponentOptions): BatchRemoveComponentResult {
  const { project_path, component_type, game_object } = options;
  const files = walk_project_files(project_path, ['.unity', '.prefab']);
  const removals: BatchRemoveComponentResult['removals'] = [];
  const errors: BatchRemoveComponentResult['errors'] = [];
  let skipped = 0;

  for (const file of files) {
    const result = removeComponent({
      file_path: file,
      file_id: component_type,
      game_object,
      project_path,
    });

    if (result.success && result.removed_file_id) {
      removals.push({
        file,
        file_id: result.removed_file_id,
        class_id: result.removed_class_id ?? 0,
      });
    } else if (result.error?.includes('not found') || result.error?.startsWith('No "')) {
      skipped++;
    } else if (result.error) {
      errors.push({ file, error: result.error });
    }
  }

  return {
    success: errors.length === 0,
    project_path,
    component: component_type,
    files_scanned: files.length,
    files_modified: removals.length,
    removals,
    skipped,
    errors,
  };
}

/**
 * Delete a GameObject and its entire hierarchy from a Unity YAML file.
 */
export function deleteGameObject(options: DeleteGameObjectOptions): DeleteGameObjectResult {
  const { file_path, object_name } = options;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Support fileID or name lookup using require_unique_game_object
  const goResult = doc.require_unique_game_object(object_name);
  if ('error' in goResult) {
    return { success: false, file_path, error: goResult.error };
  }

  const goBlock = goResult;
  const goId = goBlock.file_id;

  // Collect all component fileIDs from the GO
  const componentIds = new Set<string>();
  const compMatches = goBlock.raw.matchAll(/component:[ \t]*\{fileID:[ \t]*(-?\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.add(cm[1]);
  }

  // Find the Transform among the components
  let transformId: string | null = null;
  let fatherId = '0';

  for (const compId of componentIds) {
    const block = doc.find_by_file_id(compId);
    if (block && block.class_id === 4) {
      transformId = compId;
      const fatherMatch = block.raw.match(/m_Father:[ \t]*\{fileID:[ \t]*(-?\d+)\}/);
      if (fatherMatch) {
        fatherId = fatherMatch[1];
      }
      break;
    }
  }

  // Collect all descendants
  const allIds = new Set<string>([goId]);
  for (const id of componentIds) {
    allIds.add(id);
  }

  if (transformId !== null) {
    const descendants = doc.collect_hierarchy(transformId);
    for (const id of descendants) {
      allIds.add(id);
    }
  }

  // Detach from parent if parented
  if (fatherId !== '0' && transformId !== null) {
    doc.remove_child_from_parent(fatherId, transformId);
  }

  doc.remove_blocks(allIds);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after deleting GameObject' };
  }

  const writeResult = doc.save();
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    deleted_count: allIds.size
  };
}

// ========== Wave 3 Functions ==========

/**
 * Helper to find PrefabInstance block by fileID or name.
 */
function findPrefabInstanceBlock(doc: UnityDocument, identifier: string): UnityBlock | null {
  // Try as fileID
  const asId = doc.find_by_file_id(identifier);
  if (asId && asId.class_id === 1001) return asId;

  // Try as name (search m_Modifications for m_Name)
  const piBlocks = doc.find_by_class_id(1001);
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`propertyPath:\\s*m_Name\\s+value:\\s*${escaped}\\s`);
  for (const block of piBlocks) {
    if (namePattern.test(block.raw)) return block;
  }
  return null;
}

function splitPrefabArraySection(rawText: string, key: string): {
  lines: string[];
  key_index: number;
  section_end: number;
} | null {
  const lines = rawText.split('\n');
  const keyPattern = new RegExp(`^[ \t]*${key}:[ \t]*(.*)$`);

  let keyIndex = -1;
  let keyIndentLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(keyPattern);
    if (match) {
      keyIndex = i;
      keyIndentLen = (lines[i].match(/^[ \t]*/) || [''])[0].length;
      break;
    }
  }

  if (keyIndex === -1) {
    return null;
  }

  let sectionEnd = keyIndex + 1;
  for (let i = keyIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      sectionEnd = i + 1;
      continue;
    }

    const indentLen = (line.match(/^[ \t]*/) || [''])[0].length;
    if (indentLen < keyIndentLen) {
      break;
    }
    if (
      indentLen === keyIndentLen &&
      !trimmed.startsWith('-') &&
      /^[A-Za-z_][A-Za-z0-9_]*:/.test(trimmed)
    ) {
      break;
    }

    sectionEnd = i + 1;
  }

  return {
    lines,
    key_index: keyIndex,
    section_end: sectionEnd,
  };
}

function collectAddedObjectFileIdsFromArray(rawText: string, key: 'm_AddedGameObjects' | 'm_AddedComponents'): string[] {
  const section = splitPrefabArraySection(rawText, key);
  if (!section) return [];

  const keyLine = section.lines[section.key_index].trim();
  if (new RegExp(`^${key}:[ \t]*\[\]$`).test(keyLine)) {
    return [];
  }

  const sectionText = section.lines.slice(section.key_index, section.section_end).join('\n');
  const fileIds = new Set<string>();
  const addedObjectPattern = /addedObject:[ \t]*\{[^}]*fileID:[ \t]*(-?\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = addedObjectPattern.exec(sectionText)) !== null) {
    fileIds.add(match[1]);
  }

  // Backward-compatibility: older malformed/legacy shape may use inline refs like:
  //   m_AddedComponents:
  //   - {fileID: 123}
  if (fileIds.size === 0) {
    const inlineEntryPattern = /^[ \t]*-[ \t]*\{[^}]*fileID:[ \t]*(-?\d+)/gm;
    while ((match = inlineEntryPattern.exec(sectionText)) !== null) {
      fileIds.add(match[1]);
    }
  }

  return [...fileIds];
}

function removeAddedComponentOverrideEntries(
  rawText: string,
  componentId: string,
): { updated_raw: string; removed_count: number } {
  const section = splitPrefabArraySection(rawText, 'm_AddedComponents');
  if (!section) return { updated_raw: rawText, removed_count: 0 };

  const keyLine = section.lines[section.key_index].trim();
  if (/^m_AddedComponents:[ \t]*\[\]$/.test(keyLine)) {
    return { updated_raw: rawText, removed_count: 0 };
  }

  const bodyLines = section.lines.slice(section.key_index + 1, section.section_end);
  const keptEntries: string[][] = [];
  let removed = 0;

  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('-')) {
      i++;
      continue;
    }

    const entryIndent = (line.match(/^[ \t]*/) || [''])[0].length;
    const entryLines: string[] = [line];
    i++;

    while (i < bodyLines.length) {
      const nextLine = bodyLines[i];
      const nextTrimmed = nextLine.trim();
      const nextIndent = (nextLine.match(/^[ \t]*/) || [''])[0].length;

      if (nextTrimmed.length > 0 && nextIndent === entryIndent && nextTrimmed.startsWith('-')) {
        break;
      }

      entryLines.push(nextLine);
      i++;
    }

    const entryText = entryLines.join('\n');
    const addedObjectMatch = entryText.match(/addedObject:[ \t]*\{[^}]*fileID:[ \t]*(-?\d+)/);
    if (addedObjectMatch && addedObjectMatch[1] === componentId) {
      removed++;
      continue;
    }

    keptEntries.push(entryLines);
  }

  if (removed === 0) {
    return { updated_raw: rawText, removed_count: 0 };
  }

  const keyIndent = (section.lines[section.key_index].match(/^[ \t]*/) || [''])[0];
  const replacement: string[] =
    keptEntries.length === 0
      ? [`${keyIndent}m_AddedComponents: []`]
      : [`${keyIndent}m_AddedComponents:`, ...keptEntries.flat()];

  const updatedLines = [
    ...section.lines.slice(0, section.key_index),
    ...replacement,
    ...section.lines.slice(section.section_end),
  ];

  return { updated_raw: updatedLines.join('\n'), removed_count: removed };
}

/**
 * Delete a PrefabInstance and all its associated blocks.
 */
export function deletePrefabInstance(options: DeletePrefabInstanceOptions): DeletePrefabInstanceResult {
  const { file_path, prefab_instance } = options;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PrefabInstance block (try as fileID first, then as name)
  const piBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!piBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  const piId = piBlock.file_id;

  // Collect all blocks to remove
  const allToRemove = new Set<string>([piId]);

  // Collect ALL stripped blocks referencing this PI (any class_id)
  const piRefPattern = new RegExp(`m_PrefabInstance:[ \\t]*\\{fileID:[ \\t]*${piId}\\}`);
  for (const block of doc.blocks) {
    if (block.is_stripped && piRefPattern.test(block.raw)) {
      allToRemove.add(block.file_id);
    }
  }

  // Collect all AddedGameObjects and AddedComponents blocks
  for (const goId of collectAddedObjectFileIdsFromArray(piBlock.raw, 'm_AddedGameObjects')) {
    allToRemove.add(goId);

    // For each added GO, collect its hierarchy too
    const goBlock = doc.find_by_file_id(goId);
    if (goBlock) {
      // Find transform
      const compMatch = goBlock.raw.match(/component:[ \t]*\{fileID:[ \t]*(\d+)\}/);
      if (compMatch) {
        const transformId = compMatch[1];
        allToRemove.add(transformId);

        // Collect hierarchy
        const descendants = doc.collect_hierarchy(transformId);
        for (const id of descendants) {
          allToRemove.add(id);
        }
      }
    }
  }

  for (const componentId of collectAddedObjectFileIdsFromArray(piBlock.raw, 'm_AddedComponents')) {
    allToRemove.add(componentId);
  }

  // Find parent transform (m_TransformParent from PI block)
  const parentMatch = piBlock.raw.match(/m_TransformParent:[ \t]*\{fileID:[ \t]*(\d+)\}/);
  const parentTransformId = parentMatch ? parentMatch[1] : '0';

  // Find stripped root transform (first stripped block referencing this PI)
  let strippedRootTransformId: string | null = null;
  for (const id of allToRemove) {
    const block = doc.find_by_file_id(id);
    if (block && block.class_id === 4 && block.is_stripped) {
      strippedRootTransformId = id;
      break;
    }
  }

  // If parent exists, remove stripped root transform from parent's m_Children
  if (parentTransformId !== '0' && strippedRootTransformId !== null) {
    doc.remove_child_from_parent(parentTransformId, strippedRootTransformId);
  }

  // Remove all blocks
  doc.remove_blocks(allToRemove);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after deleting PrefabInstance' };
  }

  const writeResult = doc.save();
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    deleted_count: allToRemove.size
  };
}
