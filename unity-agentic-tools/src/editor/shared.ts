import { readFileSync, existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { load_guid_cache, load_guid_cache_for_file } from '../guid-cache';
import { normalize_property_path, find_unity_project_root } from '../utils';
import type { UnityDocument } from './unity-document';
import type { UnityBlock } from './unity-block';

/**
 * Extract all existing file IDs from a Unity YAML file.
 */
export function extractExistingFileIds(content: string): Set<number> {
  const ids = new Set<number>();
  const matches = content.matchAll(/--- !u!\d+ &(-?\d+)/g);
  for (const match of matches) {
    ids.add(parseInt(match[1], 10));
  }
  return ids;
}

/**
 * Generate a unique file ID that doesn't conflict with existing IDs.
 * Uses random approach similar to modern Unity.
 */
export function generateFileId(existingIds: Set<number>): number {
  let id: number;
  do {
    // Generate a random ID in a range similar to Unity's (large positive integers)
    // Using 10-digit range to match observed Unity patterns
    id = Math.floor(Math.random() * 9000000000) + 1000000000;
  } while (existingIds.has(id) || id === 0);
  return id;
}

/**
 * Calculate the next m_RootOrder for a new child under a given parent.
 * For root-level (parentTransformId === 0): count transforms with m_Father: {fileID: 0}
 * For children: count entries in the parent's m_Children array
 */
export function calculate_root_order(content: string, parentTransformId: number): number {
    if (parentTransformId === 0) {
        const matches = content.match(/m_Father:\s*\{fileID:\s*0\}/g);
        return matches ? matches.length : 0;
    }
    // Count entries in parent's m_Children
    const blocks = content.split(/(?=--- !u!)/);
    const parentPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);
    for (const block of blocks) {
        if (parentPattern.test(block)) {
            const childMatches = block.match(/m_Children:[\s\S]*?(?=\s*m_Father:)/);
            if (childMatches) {
                const entries = childMatches[0].match(/\{fileID:\s*\d+\}/g);
                return entries ? entries.length : 0;
            }
            return 0;
        }
    }
    return 0;
}

/**
 * Update or insert m_RootOrder in a Transform block string.
 */
export function update_root_order_in_block(block: string, rootOrder: number): string {
    if (/m_RootOrder:\s*\d+/.test(block)) {
        return block.replace(/m_RootOrder:\s*\d+/, `m_RootOrder: ${rootOrder}`);
    }
    // Insert after m_Father line
    return block.replace(
        /(m_Father:\s*\{fileID:\s*\d+\})/,
        `$1\n  m_RootOrder: ${rootOrder}`
    );
}

/**
 * Add a child Transform to a parent's m_Children array.
 */
export function addChildToParent(content: string, parentTransformId: number, childTransformId: number): string {
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      // Update m_Children array
      blocks[i] = blocks[i].replace(
        /m_Children:\s*\[(.*?)\]/,
        (match, children) => {
          const trimmed = children.trim();
          if (trimmed === '') {
            return `m_Children:\n  - {fileID: ${childTransformId}}`;
          } else {
            // Existing children - add to the array
            return match.replace(']', '') + `\n  - {fileID: ${childTransformId}}]`;
          }
        }
      );

      // Handle multiline m_Children format
      if (blocks[i].includes('m_Children:') && !blocks[i].includes(`fileID: ${childTransformId}`)) {
        blocks[i] = blocks[i].replace(
          /(m_Children:\s*\n(?:\s*-\s*\{fileID:\s*\d+\}\s*\n)*)/,
          `$1  - {fileID: ${childTransformId}}\n`
        );
      }

      break;
    }
  }

  return blocks.join('');
}

/**
 * Remove a child from a parent Transform's m_Children.
 */
export function removeChildFromParent(content: string, parentTransformId: number, childTransformId: number): string {
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      // Remove the child line from multiline m_Children
      // Anchor to \n and only match spaces/tabs for indent (not newlines)
      // to avoid merging m_Children: with the next line when last child is removed
      const childLinePattern = new RegExp(`\\n[ \\t]*- \\{fileID: ${childTransformId}\\}`);
      blocks[i] = blocks[i].replace(childLinePattern, '');

      // Check if m_Children is now empty (no more - {fileID: lines after it)
      if (/m_Children:\s*\n\s*m_Father:/.test(blocks[i]) || /m_Children:\s*\n\s*m_RootOrder:/.test(blocks[i])) {
        blocks[i] = blocks[i].replace(/m_Children:\s*\n/, 'm_Children: []\n');
      }

      break;
    }
  }

  return blocks.join('');
}

/**
 * Find a YAML block by its fileID.
 */
export function findBlockByFileId(content: string, fileId: number): { block: string; classId: number; index: number } | null {
  const blocks = content.split(/(?=--- !u!)/);
  const pattern = new RegExp(`^--- !u!(\\d+) &${fileId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    const match = blocks[i].match(pattern);
    if (match) {
      return { block: blocks[i], classId: parseInt(match[1], 10), index: i };
    }
  }

  return null;
}

/**
 * Find a YAML block by its fileID as a string (avoids parseInt precision loss for large IDs).
 */
export function findBlockByFileIdStr(content: string, fileId: string): { block: string; classId: number; index: number } | null {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedId = fileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^--- !u!(\\d+) &${escapedId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    const match = blocks[i].match(pattern);
    if (match) {
      return { block: blocks[i], classId: parseInt(match[1], 10), index: i };
    }
  }

  return null;
}

/**
 * Remove blocks whose fileIDs are in the given set.
 * Always keeps the first block (YAML header).
 */
export function removeBlocks(content: string, fileIdsToRemove: Set<number>): string {
  const blocks = content.split(/(?=--- !u!)/);
  const kept: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    // Always keep the header block (first block, no --- !u! prefix)
    if (i === 0 && !blocks[i].startsWith('--- !u!')) {
      kept.push(blocks[i]);
      continue;
    }

    const idMatch = blocks[i].match(/^--- !u!\d+ &(-?\d+)/);
    if (idMatch) {
      const blockId = parseInt(idMatch[1], 10);
      if (fileIdsToRemove.has(blockId)) {
        continue; // skip this block
      }
    }

    kept.push(blocks[i]);
  }

  return kept.join('');
}

/**
 * Remove blocks whose fileIDs (as strings) are in the given set.
 * Safe for large fileIDs that exceed Number.MAX_SAFE_INTEGER.
 */
export function removeBlocksByStr(content: string, fileIdsToRemove: Set<string>): string {
  const blocks = content.split(/(?=--- !u!)/);
  const kept: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    if (i === 0 && !blocks[i].startsWith('--- !u!')) {
      kept.push(blocks[i]);
      continue;
    }

    const idMatch = blocks[i].match(/^--- !u!\d+ &(-?\d+)/);
    if (idMatch && fileIdsToRemove.has(idMatch[1])) {
      continue;
    }

    kept.push(blocks[i]);
  }

  return kept.join('');
}

/**
 * Recursively collect all fileIDs in a Transform hierarchy (not including the starting Transform itself).
 */
export function collectHierarchy(content: string, transformFileId: number): Set<number> {
  const result = new Set<number>();
  const blocks = content.split(/(?=--- !u!)/);

  // Find the Transform block
  const transformPattern = new RegExp(`^--- !u!4 &${transformFileId}\\b`);
  let transformBlock = '';

  for (const block of blocks) {
    if (transformPattern.test(block)) {
      transformBlock = block;
      break;
    }
  }

  if (!transformBlock) return result;

  // Extract children
  const childMatches = transformBlock.matchAll(/m_Children:[\s\S]*?(?=\s*m_Father:)/g);
  const childrenSection = childMatches.next().value;
  if (!childrenSection) return result;

  const childIds: number[] = [];
  const childIdMatches = childrenSection[0].matchAll(/\{fileID:\s*(-?\d+)\}/g);
  for (const m of childIdMatches) {
    const childId = parseInt(m[1], 10);
    if (childId !== 0) childIds.push(childId);
  }

  // For each child Transform, find its GO and all components, then recurse
  for (const childTransformId of childIds) {
    result.add(childTransformId);

    // Find the child Transform block to get its m_GameObject
    const childTransformPattern = new RegExp(`^--- !u!4 &${childTransformId}\\b`);
    for (const block of blocks) {
      if (childTransformPattern.test(block)) {
        const goMatch = block.match(/m_GameObject:\s*\{fileID:\s*(-?\d+)\}/);
        if (goMatch) {
          const goId = parseInt(goMatch[1], 10);
          result.add(goId);

          // Find GO block and collect all component fileIDs
          const goPattern = new RegExp(`^--- !u!1 &${goId}\\b`);
          for (const goBlock of blocks) {
            if (goPattern.test(goBlock)) {
              const compMatches = goBlock.matchAll(/component:\s*\{fileID:\s*(-?\d+)\}/g);
              for (const cm of compMatches) {
                result.add(parseInt(cm[1], 10));
              }
              break;
            }
          }
        }
        break;
      }
    }

    // Recurse into this child's children
    const subIds = collectHierarchy(content, childTransformId);
    for (const id of subIds) {
      result.add(id);
    }
  }

  return result;
}

/**
 * Remap fileIDs in a block based on an ID mapping.
 * Replaces header and all fileID references (skips fileID: 0).
 */
export function remapFileIds(blockText: string, idMap: Map<number, number>): string {
  let result = blockText;

  // Remap header: --- !u!<cls> &<old> -> &<new>
  result = result.replace(/^(--- !u!\d+ &)(-?\d+)/, (match, prefix, oldId) => {
    const id = parseInt(oldId, 10);
    return idMap.has(id) ? `${prefix}${idMap.get(id)}` : match;
  });

  // Remap all fileID references (skip fileID: 0)
  result = result.replace(/(\{fileID:\s*)(-?\d+)(\})/g, (match, prefix, oldId, suffix) => {
    const id = parseInt(oldId, 10);
    if (id === 0) return match;
    return idMap.has(id) ? `${prefix}${idMap.get(id)}${suffix}` : match;
  });

  return result;
}

/**
 * Find ALL GameObjects with a given name (returns all matching fileIDs).
 * Used by destructive operations to detect ambiguity.
 */
export function findAllGameObjectIdsByName(content: string, objectName: string): number[] {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');
  const ids: number[] = [];

  for (const block of blocks) {
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      const idMatch = block.match(/^--- !u!1 &(-?\d+)/);
      if (idMatch) {
        ids.push(parseInt(idMatch[1], 10));
      }
    }
  }

  return ids;
}

/**
 * Find ALL Transform fileIDs for GameObjects with a given name.
 */
export function findAllTransformIdsByName(content: string, objectName: string): number[] {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');
  const ids: number[] = [];

  for (const block of blocks) {
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      const componentMatch = block.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(-?\d+)\}/);
      if (componentMatch) {
        ids.push(parseInt(componentMatch[1], 10));
      }
    }
  }

  return ids;
}

/**
 * Require a unique GameObject match for destructive operations.
 * Returns the single ID or an error string.
 */
export function requireUniqueGameObject(content: string, objectName: string): { id: number } | { error: string } {
  // Auto-detect numeric fileID (including negative IDs from 64-bit unsigned overflow)
  if (/^-?\d+$/.test(objectName)) {
    const fileId = parseInt(objectName, 10);
    const found = findBlockByFileId(content, fileId);
    if (!found) {
      return { error: `GameObject with fileID ${fileId} not found` };
    }
    if (found.classId !== 1) {
      return { error: `fileID ${fileId} is not a GameObject (class ${found.classId})` };
    }
    return { id: fileId };
  }

  // Name-based lookup (existing logic)
  const allIds = findAllGameObjectIdsByName(content, objectName);
  if (allIds.length === 0) {
    return { error: `GameObject "${objectName}" not found` };
  }
  if (allIds.length > 1) {
    return { error: `Multiple GameObjects named "${objectName}" found (fileIDs: ${allIds.join(', ')}). Use numeric fileID to specify which one.` };
  }
  return { id: allIds[0] };
}

/**
 * Require a unique Transform match for destructive operations.
 * Returns the single ID or an error string.
 */
export function requireUniqueTransform(content: string, objectName: string): { id: number } | { error: string } {
  const allIds = findAllTransformIdsByName(content, objectName);
  if (allIds.length === 0) {
    return { error: `GameObject "${objectName}" not found` };
  }
  if (allIds.length > 1) {
    // Report GameObject fileIDs (not Transform IDs) so users can pass them as identifiers
    const goIds = findAllGameObjectIdsByName(content, objectName);
    return { error: `Multiple GameObjects named "${objectName}" found (fileIDs: ${goIds.join(', ')}). Use numeric fileID to specify which one.` };
  }
  return { id: allIds[0] };
}

/**
 * Validate Unity YAML file integrity.
 * Returns null if valid, or an error description string if invalid.
 */
export function validateUnityYAML(content: string): string | null {
  if (!content.startsWith('%YAML 1.1')) {
    return 'Missing or invalid YAML header';
  }

  // Check for GUIDs that are too short (less than 30 hex characters)
  // Valid Unity GUIDs are typically 32-36 hex characters
  const invalidGuids = content.match(/guid:\s*[a-f0-9]{1,29}\b/g);
  if (invalidGuids) {
    return 'Found invalid GUID format (missing characters)';
  }

  const blockOpens = (content.match(/--- !u!/g) || []).length;
  const blockCloses = (content.match(/\n---(?!u!)/g) || []).length;
  if (Math.abs(blockOpens - blockCloses) > 1) {
    return 'Unbalanced YAML block markers';
  }

  return null;
}

/**
 * Apply a single property modification to a block.
 */
export function applyModification(block: string, propertyPath: string, value: string, objectReference: string): string {
  propertyPath = normalize_property_path(propertyPath);
  // Handle simple paths (e.g., m_Name)
  if (!propertyPath.includes('.') && !propertyPath.includes('Array')) {
    const propPattern = new RegExp(`(^\\s*${propertyPath}:\\s*)(.*)$`, 'm');
    if (propPattern.test(block)) {
      const replacement = (objectReference && objectReference !== '{fileID: 0}') ? objectReference : value;
      return block.replace(propPattern, (_m: string, prefix: string) => prefix + replacement);
    }
    return block;
  }

  // Handle dotted paths (e.g., m_LocalPosition.x)
  if (propertyPath.includes('.') && !propertyPath.includes('Array')) {
    const parts = propertyPath.split('.');
    const parentProp = parts[0];
    const subField = parts[1];

    // Find inline object syntax: m_LocalPosition: {x: 0, y: 0, z: 0}
    const inlinePattern = new RegExp(`(${parentProp}:\\s*\\{)([^}]*)(\\})`, 'm');
    const inlineMatch = block.match(inlinePattern);
    if (inlineMatch) {
      const fields = inlineMatch[2];
      const fieldPattern = new RegExp(`(${subField}:\\s*)([^,}]+)`);
      const updatedFields = fields.replace(fieldPattern, (_m: string, prefix: string) => prefix + value);
      return block.replace(inlinePattern, (_m: string, g1: string, _g2: string, g3: string) => g1 + updatedFields + g3);
    }

    // Fall back to block-style nested YAML
    const effectiveValue = objectReference && objectReference !== '{fileID: 0}' ? objectReference : value;
    const blockResult = resolve_block_style_path(block, parts, effectiveValue);
    if (blockResult !== null) return blockResult;

    return block;
  }

  // Handle array paths (e.g., m_Materials.Array.data[0])
  if (propertyPath.includes('Array.data[')) {
    const arrayMatch = propertyPath.match(/^(.+)\.Array\.data\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayProp = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);

      // Find the array in the block
      const arrayPattern = new RegExp(`${arrayProp}:\\s*\\n((?:\\s*-\\s*[^\\n]+\\n)*)`, 'm');
      const arrayBlockMatch = block.match(arrayPattern);
      if (arrayBlockMatch) {
        const lines = arrayBlockMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        if (index < lines.length) {
          const refValue = objectReference && objectReference !== '{fileID: 0}' ? objectReference : value;
          const oldLine = lines[index];
          const newLine = oldLine.replace(/-\s*.*/, `- ${refValue}`);
          return block.replace(oldLine, newLine);
        }
      }
    }
    return block;
  }

  return block;
}

/**
 * Resolve and replace a nested property value in block-style YAML.
 * For a path like ["m_Shadows", "m_Type"] with value "1", finds:
 *   m_Shadows:
 *     m_Type: 2    <-- replaces "2" with "1"
 * Returns the modified block, or null if any segment wasn't found.
 */
export function resolve_block_style_path(block: string, segments: string[], value: string): string | null {
    const lines = block.split('\n');
    let searchStart = 0;
    let searchEnd = lines.length;

    // Walk each segment except the last to narrow the search window
    for (let seg = 0; seg < segments.length - 1; seg++) {
        const segment = segments[seg];
        let parentIdx = -1;
        let parentIndent = -1;

        for (let i = searchStart; i < searchEnd; i++) {
            const match = lines[i].match(new RegExp(`^(\\s*)${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`));
            if (match) {
                parentIdx = i;
                parentIndent = match[1].length;
                break;
            }
        }

        if (parentIdx === -1) return null;

        // Detect child indent from first non-empty line after parent
        let childIndent = -1;
        for (let i = parentIdx + 1; i < searchEnd; i++) {
            if (lines[i].trim() === '') continue;
            const leadingSpaces = lines[i].match(/^(\s*)/);
            if (leadingSpaces) {
                const indent = leadingSpaces[1].length;
                if (indent > parentIndent) {
                    childIndent = indent;
                    break;
                }
            }
            break;
        }

        if (childIndent === -1) return null;

        // Narrow to children
        searchStart = parentIdx + 1;
        for (let i = parentIdx + 1; i < searchEnd; i++) {
            if (lines[i].trim() === '') continue;
            const leadingSpaces = lines[i].match(/^(\s*)/);
            if (leadingSpaces && leadingSpaces[1].length < childIndent) {
                searchEnd = i;
                break;
            }
        }
    }

    // Find and replace the final property
    const finalProp = segments[segments.length - 1];
    for (let i = searchStart; i < searchEnd; i++) {
        const match = lines[i].match(new RegExp(`^(\\s*${finalProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*).+$`));
        if (match) {
            lines[i] = match[1] + value;
            return lines.join('\n');
        }
    }

    return null;
}

/**
 * Find the root GameObject in a prefab file (the one with m_Father: {fileID: 0}).
 */
export function findPrefabRootInfo(content: string): { gameObjectId: number; transformId: number; name: string } | null {
  const blocks = content.split(/(?=--- !u!)/);

  // Find a Transform with m_Father: {fileID: 0} - that's the root
  for (const block of blocks) {
    if (block.startsWith('--- !u!4 ') && /m_Father:\s*\{fileID:\s*0\}/.test(block)) {
      const transformIdMatch = block.match(/^--- !u!4 &(\d+)/);
      const gameObjectIdMatch = block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);

      if (transformIdMatch && gameObjectIdMatch) {
        const transformId = parseInt(transformIdMatch[1], 10);
        const gameObjectId = parseInt(gameObjectIdMatch[1], 10);

        // Find the GameObject name
        for (const goBlock of blocks) {
          if (goBlock.startsWith(`--- !u!1 &${gameObjectId}`)) {
            const nameMatch = goBlock.match(/m_Name:\s*(.+)/);
            const name = nameMatch ? nameMatch[1].trim() : 'Prefab';
            return { gameObjectId, transformId, name };
          }
        }
      }
    }
  }

  // Fallback: variant prefabs have stripped blocks instead of full blocks
  // Look for stripped GameObject and Transform blocks referencing a PrefabInstance
  for (const block of blocks) {
    if (/^--- !u!1 &\d+\s+stripped/.test(block)) {
      const goIdMatch = block.match(/^--- !u!1 &(\d+)/);
      if (!goIdMatch) continue;
      const gameObjectId = parseInt(goIdMatch[1], 10);

      // Find the matching stripped Transform
      for (const tBlock of blocks) {
        if (/^--- !u!4 &\d+\s+stripped/.test(tBlock)) {
          const tIdMatch = tBlock.match(/^--- !u!4 &(\d+)/);
          if (!tIdMatch) continue;
          const transformId = parseInt(tIdMatch[1], 10);

          // Extract name from PrefabInstance modifications
          let name = 'Variant';
          for (const piBlock of blocks) {
            if (piBlock.startsWith('--- !u!1001 ')) {
              const nameModMatch = piBlock.match(/propertyPath: m_Name\s*\n\s*value:\s*(.+)/);
              if (nameModMatch) {
                name = nameModMatch[1].trim();
              }
              break;
            }
          }

          return { gameObjectId, transformId, name };
        }
      }
    }
  }

  return null;
}

/**
 * Extract GUID from a Unity .meta file.
 */
export function extractGuidFromMeta(metaPath: string): string | null {
  if (!existsSync(metaPath)) {
    return null;
  }

  try {
    const content = readFileSync(metaPath, 'utf-8');
    const match = content.match(/guid:\s*([a-f0-9]{32})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the source prefab for a PrefabVariant file.
 * Finds the PrefabInstance block, extracts the source GUID, and resolves
 * the source prefab path via the GUID cache.
 */
export function resolve_source_prefab(
  doc: UnityDocument,
  file_path: string,
  project_path?: string,
): {
  source_guid: string;
  source_path: string;
  prefab_instance_id: string;
  prefab_instance_block: UnityBlock;
} | null {
  const pi_blocks = doc.find_by_class_id(1001);
  if (pi_blocks.length === 0) return null;

  const pi_block = pi_blocks[0];

  // Extract source GUID from m_SourcePrefab
  const source_match = pi_block.raw.match(/m_SourcePrefab:[ \t]*\{[^}]*guid:[ \t]*([a-f0-9]{32})/);
  if (!source_match) return null;
  const source_guid = source_match[1];

  // Resolve GUID to absolute path
  const resolved_project = project_path || find_unity_project_root(path.dirname(file_path));
  if (!resolved_project) return null;

  const cache = load_guid_cache_for_file(file_path, resolved_project);
  if (!cache) return null;

  const source_path = cache.resolve_absolute(source_guid);
  if (!source_path || !existsSync(source_path)) return null;

  return {
    source_guid,
    source_path,
    prefab_instance_id: pi_block.file_id,
    prefab_instance_block: pi_block,
  };
}

/**
 * Look up a script GUID by name, path, or raw GUID.
 * Returns { guid, path } or null if not found.
 */
export function resolveScriptGuid(
  script: string,
  projectPath?: string
): { guid: string; path: string | null } | null {
  // Check if it's already a valid GUID (32 hex chars)
  if (/^[a-f0-9]{32}$/i.test(script)) {
    if (/^0{32}$/i.test(script)) {
      throw new Error(`Invalid script GUID "${script}": all-zero GUID is not allowed. Provide a real script GUID from a .meta file.`);
    }
    return { guid: script.toLowerCase(), path: null };
  }

  // Check if it's a direct path to a .cs file
  if (script.endsWith('.cs')) {
    const metaPath = script + '.meta';
    if (existsSync(metaPath)) {
      const guid = extractGuidFromMeta(metaPath);
      if (guid) {
        return { guid, path: script };
      }
    }
    // Try with project path prefix
    if (projectPath) {
      const fullPath = path.join(projectPath, script);
      const fullMetaPath = fullPath + '.meta';
      if (existsSync(fullMetaPath)) {
        const guid = extractGuidFromMeta(fullMetaPath);
        if (guid) {
          return { guid, path: script };
        }
      }
    }
  }

  // Try to find in GUID cache by name
  if (projectPath) {
    const guidCache = load_guid_cache(projectPath);
    if (guidCache) {
      const result = guidCache.find_by_name(script, '.cs');
      if (result) return result;
    }

    // Strategy 4: Type registry lookup by class name
    const registryPath = path.join(projectPath, '.unity-agentic', 'type-registry.json');
    if (existsSync(registryPath)) {
      try {
        const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as Array<{
          name: string;
          kind: string;
          namespace: string | null;
          filePath: string;
          guid: string | null;
        }>;

        // Support qualified names like "TMPro.TextMeshProUGUI"
        let targetName = script;
        let targetNamespace: string | null = null;
        const dotIndex = script.lastIndexOf('.');
        if (dotIndex > 0) {
          targetNamespace = script.substring(0, dotIndex);
          targetName = script.substring(dotIndex + 1);
        }

        const targetNameLower = targetName.toLowerCase();
        const matches = registry.filter(t => {
          if (t.name.toLowerCase() !== targetNameLower) return false;
          if (targetNamespace && t.namespace?.toLowerCase() !== targetNamespace.toLowerCase()) return false;
          return true;
        });

        if (matches.length === 1) {
          if (matches[0].guid) {
            return { guid: matches[0].guid, path: matches[0].filePath };
          }
          // GUID is null — try to resolve from adjacent .meta file
          if (matches[0].filePath && projectPath) {
            const fullFilePath = path.isAbsolute(matches[0].filePath)
              ? matches[0].filePath
              : path.join(projectPath, matches[0].filePath);
            const metaPath = fullFilePath + '.meta';
            if (existsSync(metaPath)) {
              const guid = extractGuidFromMeta(metaPath);
              if (guid) return { guid, path: matches[0].filePath };
            }
            // Fallback: try Packages/ relative path through project root
            if (matches[0].filePath.startsWith('Packages/')) {
              const pkgPath = path.join(projectPath, matches[0].filePath);
              const pkgMetaPath = pkgPath + '.meta';
              if (existsSync(pkgMetaPath)) {
                const guid = extractGuidFromMeta(pkgMetaPath);
                if (guid) return { guid, path: matches[0].filePath };
              }
            }
            // Fallback: DLL-backed type — find the source .cs by class name in package caches
            // Unity references scripts by the .cs file's GUID even when compiled into a DLL
            if (matches[0].filePath?.endsWith('.dll')) {
              const classNameLower = targetName.toLowerCase();
              const dllBasename = path.basename(matches[0].filePath).toLowerCase();
              for (const cacheName of ['package-cache.json', 'local-package-cache.json']) {
                const cachePath = path.join(projectPath, '.unity-agentic', cacheName);
                if (!existsSync(cachePath)) continue;
                try {
                  const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
                  // First: find .cs source file matching the class name
                  for (const [guid, assetPath] of Object.entries(cache)) {
                    if (assetPath.endsWith('.cs') &&
                        path.basename(assetPath, '.cs').toLowerCase() === classNameLower) {
                      return { guid, path: assetPath };
                    }
                  }
                  // Second: find the DLL itself (for DLL-only references)
                  for (const [guid, assetPath] of Object.entries(cache)) {
                    if (assetPath.toLowerCase().endsWith('.dll') &&
                        path.basename(assetPath).toLowerCase() === dllBasename) {
                      return { guid, path: assetPath };
                    }
                  }
                } catch { /* ignore corrupt cache */ }
              }
            }
          }
        }
        if (matches.length > 1) {
          // Multiple matches: prefer the one with a GUID
          const withGuid = matches.filter(m => m.guid);
          if (withGuid.length === 1) {
            return { guid: withGuid[0].guid!, path: withGuid[0].filePath };
          }
          // Also try .meta fallback for entries with null GUIDs
          const resolvedFromMeta = matches
            .filter(m => !m.guid && m.filePath)
            .map(m => {
              const fullPath = path.isAbsolute(m.filePath)
                ? m.filePath
                : path.join(projectPath, m.filePath);
              let guid = existsSync(fullPath + '.meta')
                ? extractGuidFromMeta(fullPath + '.meta')
                : null;
              // Fallback: try Packages/ relative path through project root
              if (!guid && m.filePath.startsWith('Packages/')) {
                const pkgPath = path.join(projectPath, m.filePath);
                if (existsSync(pkgPath + '.meta')) {
                  guid = extractGuidFromMeta(pkgPath + '.meta');
                }
              }
              // Fallback: DLL-backed type — find source .cs by class name in package cache
              if (!guid && m.filePath?.endsWith('.dll')) {
                const clsLower = (m.name ?? targetName).toLowerCase();
                const dllBase = path.basename(m.filePath).toLowerCase();
                for (const cn of ['package-cache.json', 'local-package-cache.json']) {
                  const cp = path.join(projectPath, '.unity-agentic', cn);
                  if (!existsSync(cp)) continue;
                  try {
                    const c = JSON.parse(readFileSync(cp, 'utf-8')) as Record<string, string>;
                    // First: find .cs source matching class name
                    for (const [g, p] of Object.entries(c)) {
                      if (p.endsWith('.cs') && path.basename(p, '.cs').toLowerCase() === clsLower) {
                        guid = g; break;
                      }
                    }
                    // Second: find the DLL itself
                    if (!guid) {
                      for (const [g, p] of Object.entries(c)) {
                        if (p.toLowerCase().endsWith('.dll') && path.basename(p).toLowerCase() === dllBase) {
                          guid = g; break;
                        }
                      }
                    }
                  } catch {}
                  if (guid) break;
                }
              }
              return guid ? { guid, path: m.filePath } : null;
            })
            .filter((r): r is { guid: string; path: string } => r !== null);
          const allResolved = [...withGuid.map(m => ({ guid: m.guid!, path: m.filePath })), ...resolvedFromMeta];
          if (allResolved.length === 1) {
            return allResolved[0];
          }
          if (allResolved.length > 1) {
            // Try package caches as tiebreaker
            const pkgCachePaths = [
              path.join(projectPath, '.unity-agentic', 'package-cache.json'),
              path.join(projectPath, '.unity-agentic', 'local-package-cache.json'),
            ];
            for (const cachePath of pkgCachePaths) {
              if (!existsSync(cachePath)) continue;
              try {
                const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
                const inCache = allResolved.filter(r => r.guid in cache);
                if (inCache.length === 1) return inCache[0];
              } catch { /* ignore */ }
            }
            const paths = allResolved.map(m => m.path).join(', ');
            throw new Error(
              `Ambiguous type "${script}": found ${allResolved.length} matches (${paths}). ` +
              `Use a qualified name (e.g., "Namespace.${targetName}") or provide the full path.`
            );
          }
        }
      } catch (err) {
        // Re-throw intentional resolution errors (ambiguity, etc.)
        if (err instanceof Error && err.message.startsWith('Ambiguous type')) {
          throw err;
        }
        // Registry read/parse failed -- continue to fallback strategies
      }
    }

    // Strategy 5: Package cache fallback
    // Strategy 6: Local package cache fallback (Packages/ directory)
    // Both support FQN input: "MyNamespace.MyClass" matches basename "MyClass"
    const scriptNameLower = script.toLowerCase().replace(/\.cs$/, '');
    const dotIdx = scriptNameLower.lastIndexOf('.');
    const classNameOnly = dotIdx > 0 ? scriptNameLower.substring(dotIdx + 1) : null;

    const cachePaths = [
      path.join(projectPath, '.unity-agentic', 'package-cache.json'),
      path.join(projectPath, '.unity-agentic', 'local-package-cache.json'),
    ];

    for (const cachePath of cachePaths) {
      if (!existsSync(cachePath)) continue;
      try {
        const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;

        for (const [guid, assetPath] of Object.entries(cache)) {
          if (!assetPath.endsWith('.cs')) continue;
          const fileName = path.basename(assetPath, '.cs').toLowerCase();
          if (fileName === scriptNameLower || (classNameOnly && fileName === classNameOnly)) {
            return { guid, path: assetPath };
          }
        }
      } catch {
        // Cache read failed
      }
    }

    // Strategy 7: Filesystem fallback via readdirSync (recursive)
    // Only used when registry/cache lookup fails
    try {
      const assetsDir = path.join(projectPath, 'Assets');
      if (existsSync(assetsDir)) {
        const entries = readdirSync(assetsDir, { recursive: true, withFileTypes: false }) as string[];
        for (const entry of entries) {
          if (!entry.endsWith('.cs')) continue;
          const fileName = path.basename(entry, '.cs').toLowerCase();
          if (fileName === scriptNameLower || (classNameOnly && fileName === classNameOnly)) {
            const fullPath = path.join(assetsDir, entry);
            const guid = extractGuidFromMeta(fullPath + '.meta');
            if (guid) {
              return { guid, path: path.join('Assets', entry) };
            }
          }
        }
      }
    } catch {
      // Filesystem scan failed
    }
  }

  return null;
}

// ─── Asset Path to PPtr Resolution ────────────────────────────────────

/** Maps asset file extension to the main-object fileID and PPtr type. */
const ASSET_PPTR_MAP: Record<string, { fileID: number; type: number }> = {
  '.inputactions': { fileID: 11400000, type: 2 },
  '.asset':        { fileID: 11400000, type: 2 },
  '.mat':          { fileID: 2100000,  type: 2 },
  '.prefab':       { fileID: 100100000, type: 2 },
  '.controller':   { fileID: 9100000,  type: 2 },
  '.anim':         { fileID: 7400000,  type: 2 },
};

const ASSET_EXTENSIONS = new Set(Object.keys(ASSET_PPTR_MAP));

/**
 * Resolve an asset path (e.g., "MyActions.inputactions") to a cross-file PPtr string.
 *
 * Returns:
 * - `string`    = resolved PPtr (e.g., "{fileID: 11400000, guid: abc..., type: 2}")
 * - `undefined` = value is not an asset path, no resolution attempted
 * - `null`      = value IS an asset path but resolution failed (GUID not found)
 */
export function resolveAssetPathToPPtr(
  value: string,
  file_path: string,
  project_path?: string,
): string | null | undefined {
  // Already a PPtr -- pass through
  if (value.startsWith('{fileID:') || value.startsWith('{')) return undefined;

  const ext = path.extname(value).toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) return undefined;

  // Resolve project root
  const resolved_project = project_path || find_unity_project_root(path.dirname(file_path));
  if (!resolved_project) return null;

  const mapping = ASSET_PPTR_MAP[ext];
  let guid: string | null = null;

  // Strategy 1: full or relative path with .meta file
  const basename_val = path.basename(value, ext);
  if (value.includes('/') || value.includes('\\')) {
    const abs = path.isAbsolute(value) ? value : path.join(resolved_project, value);
    guid = extractGuidFromMeta(abs + '.meta');
  }

  // Strategy 2: GUID cache lookup by name
  if (!guid) {
    const cache = load_guid_cache_for_file(file_path, resolved_project);
    if (cache) {
      const found = cache.find_by_name(basename_val, ext);
      if (found) guid = found.guid;
    }
  }

  // Strategy 3: scan common locations for .meta file
  if (!guid) {
    const candidates = [
      path.join(resolved_project, 'Assets', value),
      path.join(resolved_project, value),
    ];
    for (const candidate of candidates) {
      guid = extractGuidFromMeta(candidate + '.meta');
      if (guid) break;
    }
  }

  if (!guid) return null;

  return `{fileID: ${mapping.fileID}, guid: ${guid}, type: ${mapping.type}}`;
}

/**
 * Resolved script info with optional field data.
 */
export interface ResolvedScript {
  guid: string;
  path: string | null;
  fields?: import('../types').CSharpFieldRef[];
  base_class?: string;
  kind?: string;
  is_abstract?: boolean;
  /** Namespace of the resolved type (populated for DLL-backed scripts) */
  namespace?: string;
  /** Class name of the resolved type (populated for DLL-backed scripts) */
  class_name?: string;
  /** Set when field extraction failed — included as a warning in results */
  extraction_error?: string;
}

function detect_abstract_class_in_source(file_path: string, class_name: string): boolean {
  try {
    const source = readFileSync(file_path, 'utf-8');
    const escaped_name = class_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^\\w])abstract\\s+class\\s+${escaped_name}(?=$|[^\\w])`, 'm');
    return pattern.test(source);
  } catch {
    return false;
  }
}

/**
 * Resolve a script and extract its serialized fields if possible.
 *
 * Wraps resolveScriptGuid with on-demand field extraction.
 * Always extracts type info (base_class, kind, fields) for validation.
 * Version-specific type filtering happens downstream in generate_field_yaml.
 */
export function resolve_script_with_fields(
  script: string,
  project_path?: string
): ResolvedScript | null {
  const resolved = resolveScriptGuid(script, project_path);
  if (!resolved) return null;

  const result: ResolvedScript = {
    guid: resolved.guid,
    path: resolved.path,
  };

  // Best-effort abstract detection even without project_path
  if (resolved.path && resolved.path.endsWith('.cs')) {
    const full_path = resolved.path.startsWith('/')
      ? resolved.path
      : project_path
        ? path.join(project_path, resolved.path)
        : resolved.path;

    if (existsSync(full_path)) {
      const class_name = script.includes('.') ? script.split('.').pop()! : script;
      if (class_name.length > 0) {
        result.is_abstract = detect_abstract_class_in_source(full_path, class_name);
      }
    }
  }

  // Can't extract fields without a project path
  if (!project_path) return result;

  // Extract fields from the resolved script file
  if (resolved.path) {
    try {
      const full_path = resolved.path.startsWith('/')
        ? resolved.path
        : path.join(project_path, resolved.path);

      if (!existsSync(full_path)) {
        result.extraction_error = `Script file not found at resolved path: ${full_path}`;
      } else if (resolved.path.endsWith('.cs')) {
        const { getNativeExtractSerializedFields } = require('../scanner');
        const extract = getNativeExtractSerializedFields();
        if (extract) {
          const type_infos = extract(full_path);
          if (type_infos && type_infos.length > 0) {
            // Prefer the type that extends MonoBehaviour or ScriptableObject
            const mono = type_infos.find((t: import('../types').CSharpTypeInfo) =>
              t.baseClass === 'MonoBehaviour' || t.baseClass === 'ScriptableObject' ||
              t.baseClass === 'NetworkBehaviour' || t.baseClass === 'StateMachineBehaviour'
            );
            const chosen = mono || type_infos[0];
            result.fields = chosen.fields;
            result.base_class = chosen.baseClass ?? undefined;
            result.kind = chosen.kind;
            result.class_name = chosen.name;
            if (chosen.name) {
              result.is_abstract = detect_abstract_class_in_source(full_path, chosen.name);
            }
          }
        } else {
          result.extraction_error = 'Native extractSerializedFields function not available';
        }
      } else if (resolved.path.endsWith('.dll')) {
        const { getNativeExtractDllFields } = require('../scanner');
        const extract = getNativeExtractDllFields();
        if (extract) {
          const type_infos = extract(full_path);
          if (type_infos && type_infos.length > 0) {
            // For DLLs, try to match by script name
            const script_name = script.includes('.') ? script.split('.').pop()! : script;
            const match = type_infos.find((t: import('../types').CSharpTypeInfo) =>
              t.name === script_name
            );
            const chosen = match || type_infos[0];
            result.fields = chosen.fields;
            result.base_class = chosen.baseClass ?? undefined;
            result.kind = chosen.kind;
            result.namespace = chosen.namespace ?? undefined;
            result.class_name = chosen.name;
          }
        } else {
          result.extraction_error = 'Native extractDllFields function not available';
        }
      }
    } catch (err: unknown) {
      // Field extraction failed — surface the error as a warning
      result.extraction_error = `Field extraction failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Cross-file enum resolution: replace enum-typed fields with "int"
  // (same-file enums are handled in Rust; this covers cross-file enums via type registry)
  if (result.fields && result.fields.length > 0) {
    resolve_enum_fields(result.fields, project_path);
  }

  return result;
}

/**
 * Resolve enum-typed fields to "int" using the type registry.
 *
 * Unity serializes enums as int (default 0). The Rust parser handles
 * same-file enums, but cross-file enums need the type registry.
 *
 * Handles:
 * - Simple names: `Faction` → matches registry entry `Faction`
 * - Qualified names: `RageSpline.Outline` → matches registry entry `Outline`
 * - Nullable enums: `Faction?` → stripped to `Faction` for lookup, but result stays nullable (skipped by YAML)
 *
 * Mutates fields in place.
 */
function resolve_enum_fields(fields: import('../types').CSharpFieldRef[], project_path: string): void {
  const registry_path = path.join(project_path, '.unity-agentic', 'type-registry.json');
  if (!existsSync(registry_path)) return;

  try {
    const registry = JSON.parse(readFileSync(registry_path, 'utf-8')) as Array<{
      name: string;
      kind: string;
    }>;

    const enum_names = new Set<string>();
    for (const entry of registry) {
      if (entry.kind === 'enum') {
        enum_names.add(entry.name);
      }
    }

    if (enum_names.size === 0) return;

    for (const field of fields) {
      // Strip nullable suffix for lookup (Unity doesn't serialize Nullable<T> —
      // the YAML generator skips them, but we still resolve the base type)
      let typeName = field.typeName;
      const nullable = typeName.endsWith('?');
      if (nullable) {
        typeName = typeName.slice(0, -1);
      }

      // Exact match
      if (enum_names.has(typeName)) {
        field.typeName = nullable ? 'int?' : 'int';
        continue;
      }

      // Qualified name match: `Outer.Inner` → check `Inner`
      const dotIdx = typeName.lastIndexOf('.');
      if (dotIdx > 0) {
        const shortName = typeName.substring(dotIdx + 1);
        if (enum_names.has(shortName)) {
          field.typeName = nullable ? 'int?' : 'int';
        }
      }
    }
  } catch {
    // Registry read failed — skip enum resolution
  }
}

/**
 * Build a lookup function that resolves type names to their serialized fields.
 * Searches the project's Assets/ directory for TypeName.cs files, then extracts
 * fields on-demand via the native Rust module. Results are cached per type.
 *
 * Used by generate_field_yaml to expand [Serializable] struct/class fields
 * instead of defaulting to {fileID: 0}.
 */
export function build_type_lookup(
    project_path: string
): ((typeName: string) => import('../types').CSharpFieldRef[] | null) {
    let extractFn: ((filePath: string) => import('../types').CSharpTypeInfo[] | null) | null = null;
    try {
        const { getNativeExtractSerializedFields } = require('../scanner');
        extractFn = getNativeExtractSerializedFields();
    } catch { /* native module unavailable */ }
    if (!extractFn) return () => null;

    // Build index of .cs files by basename for fast lookup
    const assetsDir = path.join(project_path, 'Assets');
    const csIndex = new Map<string, string>();
    try {
        const { readdirSync } = require('fs') as typeof import('fs');
        const entries = readdirSync(assetsDir, { recursive: true, withFileTypes: false }) as string[];
        for (const entry of entries) {
            if (typeof entry === 'string' && entry.endsWith('.cs')) {
                const basename = entry.substring(entry.lastIndexOf('/') + 1).replace(/\.cs$/, '');
                if (!csIndex.has(basename)) {
                    csIndex.set(basename, path.join(assetsDir, entry));
                }
            }
        }
    } catch { /* directory read failed */ }
    if (csIndex.size === 0) return () => null;

    const cache = new Map<string, import('../types').CSharpFieldRef[] | null>();

    return (typeName: string) => {
        if (cache.has(typeName)) return cache.get(typeName) ?? null;

        const shortName = typeName.includes('.') ? typeName.substring(typeName.lastIndexOf('.') + 1) : typeName;
        const csPath = csIndex.get(shortName);
        if (!csPath || !existsSync(csPath)) {
            cache.set(typeName, null);
            return null;
        }

        try {
            const typeInfos = extractFn!(csPath);
            if (!typeInfos || typeInfos.length === 0) {
                cache.set(typeName, null);
                return null;
            }
            const match = typeInfos.find((t: import('../types').CSharpTypeInfo) => t.name === shortName);
            if (match && match.fields && match.fields.length > 0) {
                resolve_enum_fields(match.fields, project_path);
                cache.set(typeName, match.fields);
                return match.fields;
            }
            cache.set(typeName, null);
            return null;
        } catch {
            cache.set(typeName, null);
            return null;
        }
    };
}
