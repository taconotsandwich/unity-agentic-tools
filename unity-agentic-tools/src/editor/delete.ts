import { existsSync } from 'fs';
import type {
    RemoveComponentOptions, RemoveComponentResult,
    DeleteGameObjectOptions, DeleteGameObjectResult,
    DeletePrefabInstanceOptions, DeletePrefabInstanceResult,
} from '../types';
import { validate_file_path } from '../utils';
import { UnityDocument } from './unity-document';
import { UnityBlock } from './unity-block';

// ========== Exported Functions ==========

/**
 * Remove a component from a Unity YAML file by its fileID.
 */
export function removeComponent(options: RemoveComponentOptions): RemoveComponentResult {
  const { file_path, file_id } = options;

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

  // Use string-based lookup to avoid precision loss on large fileIDs
  const found = doc.find_by_file_id(file_id);
  if (!found) {
    return { success: false, file_path, error: `Component with file ID ${file_id} not found` };
  }

  // Reject if it's a GameObject (1) or Transform (4)
  if (found.class_id === 1) {
    return { success: false, file_path, error: 'Cannot remove a GameObject with remove-component. Use delete instead.' };
  }
  if (found.class_id === 4) {
    return { success: false, file_path, error: 'Cannot remove a Transform with remove-component. Use delete to remove the entire GameObject.' };
  }

  // Extract m_GameObject from the component block and remove the component reference
  const goMatch = found.raw.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
  if (goMatch) {
    const parentGoId = goMatch[1];
    const goBlock = doc.find_by_file_id(parentGoId);
    if (goBlock) {
      // Remove the component line using the original string fileID for regex matching
      const compLinePattern = new RegExp(`\\s*- component: \\{fileID: ${file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\n?`);
      const modifiedRaw = goBlock.raw.replace(compLinePattern, '');
      goBlock.replace_raw(modifiedRaw);
    }
  }

  doc.remove_block(file_id);

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
    removed_file_id: file_id,
    removed_class_id: found.class_id
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
  const compMatches = goBlock.raw.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
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
      const fatherMatch = block.raw.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
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
  const piRefPattern = new RegExp(`m_PrefabInstance:\\s*\\{fileID:\\s*${piId}\\}`);
  for (const block of doc.blocks) {
    if (block.is_stripped && piRefPattern.test(block.raw)) {
      allToRemove.add(block.file_id);
    }
  }

  // Collect all AddedGameObjects and AddedComponents blocks
  // Parse m_AddedGameObjects from PI block
  const addedGOPattern = /m_AddedGameObjects:\s*\n((?:\s*- \{fileID: \d+\}\n)*)/m;
  const addedGOMatch = piBlock.raw.match(addedGOPattern);
  if (addedGOMatch) {
    const addedGOSection = addedGOMatch[1];
    const goMatches = addedGOSection.matchAll(/fileID:\s*(\d+)/g);
    for (const match of goMatches) {
      const goId = match[1];
      allToRemove.add(goId);

      // For each added GO, collect its hierarchy too
      const goBlock = doc.find_by_file_id(goId);
      if (goBlock) {
        // Find transform
        const compMatch = goBlock.raw.match(/component:\s*\{fileID:\s*(\d+)\}/);
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
  }

  // Parse m_AddedComponents from PI block
  const addedCompPattern = /m_AddedComponents:\s*\n((?:\s*- \{fileID: \d+\}\n)*)/m;
  const addedCompMatch = piBlock.raw.match(addedCompPattern);
  if (addedCompMatch) {
    const addedCompSection = addedCompMatch[1];
    const compMatches = addedCompSection.matchAll(/fileID:\s*(\d+)/g);
    for (const match of compMatches) {
      allToRemove.add(match[1]);
    }
  }

  // Find parent transform (m_TransformParent from PI block)
  const parentMatch = piBlock.raw.match(/m_TransformParent:\s*\{fileID:\s*(\d+)\}/);
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
