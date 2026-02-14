import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

/**
 * Extract all existing file IDs from a Unity YAML file.
 */
export function extractExistingFileIds(content: string): Set<number> {
  const ids = new Set<number>();
  const matches = content.matchAll(/--- !u!\d+ &(\d+)/g);
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

    const idMatch = blocks[i].match(/^--- !u!\d+ &(\d+)/);
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

    const idMatch = blocks[i].match(/^--- !u!\d+ &(\d+)/);
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
  const childIdMatches = childrenSection[0].matchAll(/\{fileID:\s*(\d+)\}/g);
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
        const goMatch = block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
        if (goMatch) {
          const goId = parseInt(goMatch[1], 10);
          result.add(goId);

          // Find GO block and collect all component fileIDs
          const goPattern = new RegExp(`^--- !u!1 &${goId}\\b`);
          for (const goBlock of blocks) {
            if (goPattern.test(goBlock)) {
              const compMatches = goBlock.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
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
  result = result.replace(/^(--- !u!\d+ &)(\d+)/, (match, prefix, oldId) => {
    const id = parseInt(oldId, 10);
    return idMap.has(id) ? `${prefix}${idMap.get(id)}` : match;
  });

  // Remap all fileID references (skip fileID: 0)
  result = result.replace(/(\{fileID:\s*)(\d+)(\})/g, (match, prefix, oldId, suffix) => {
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
      const idMatch = block.match(/^--- !u!1 &(\d+)/);
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
      const componentMatch = block.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
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
  // Auto-detect numeric fileID
  if (/^\d+$/.test(objectName)) {
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
 */
export function validateUnityYAML(content: string): boolean {
  if (!content.startsWith('%YAML 1.1')) {
    console.error('Missing or invalid YAML header');
    return false;
  }

  // Check for GUIDs that are too short (less than 30 hex characters)
  // Valid Unity GUIDs are typically 32-36 hex characters
  const invalidGuids = content.match(/guid:\s*[a-f0-9]{1,29}\b/g);
  if (invalidGuids) {
    console.error('Found invalid GUID format (missing characters)');
    return false;
  }

  const blockOpens = (content.match(/--- !u!/g) || []).length;
  const blockCloses = (content.match(/\n---(?!u!)/g) || []).length;
  if (Math.abs(blockOpens - blockCloses) > 1) {
    console.error('Unbalanced YAML block markers');
    return false;
  }

  return true;
}

/**
 * Apply a single property modification to a block.
 */
export function applyModification(block: string, propertyPath: string, value: string, objectReference: string): string {
  // Handle simple paths (e.g., m_Name)
  if (!propertyPath.includes('.') && !propertyPath.includes('Array')) {
    const propPattern = new RegExp(`(^\\s*${propertyPath}:\\s*)(.*)$`, 'm');
    if (propPattern.test(block)) {
      if (objectReference && objectReference !== '{fileID: 0}') {
        return block.replace(propPattern, `$1${objectReference}`);
      }
      return block.replace(propPattern, `$1${value}`);
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
      const updatedFields = fields.replace(fieldPattern, `$1${value}`);
      return block.replace(inlinePattern, `$1${updatedFields}$3`);
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
 * Look up a script GUID by name, path, or raw GUID.
 * Returns { guid, path } or null if not found.
 */
export function resolveScriptGuid(
  script: string,
  projectPath?: string
): { guid: string; path: string | null } | null {
  // Check if it's already a valid GUID (32 hex chars)
  if (/^[a-f0-9]{32}$/i.test(script)) {
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
    const cachePath = path.join(projectPath, '.unity-agentic', 'guid-cache.json');
    if (existsSync(cachePath)) {
      try {
        const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
        const scriptNameLower = script.toLowerCase().replace(/\.cs$/, '');

        // Two-pass search: exact filename first, then substring fallback
        let substringMatch: { guid: string; path: string } | null = null;

        for (const [guid, assetPath] of Object.entries(cache)) {
          if (!assetPath.endsWith('.cs')) continue;

          const fileName = path.basename(assetPath, '.cs').toLowerCase();

          // Exact filename match -- return immediately
          if (fileName === scriptNameLower) {
            return { guid, path: assetPath };
          }
          // Track first substring match as fallback
          if (!substringMatch && assetPath.toLowerCase().includes(scriptNameLower)) {
            substringMatch = { guid, path: assetPath };
          }
        }

        if (substringMatch) {
          return substringMatch;
        }
      } catch {
        // Cache read failed
      }
    }

    // Strategy 4: Type registry lookup by class name
    const registryPath = path.join(projectPath, '.unity-agentic', 'type-registry.json');
    if (existsSync(registryPath)) {
      try {
        const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as Array<{
          name: string;
          kind: string;
          namespace: string | null;
          file_path: string;
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

        if (matches.length === 1 && matches[0].guid) {
          return { guid: matches[0].guid, path: matches[0].file_path };
        }
        if (matches.length > 1) {
          // Multiple matches: prefer the one with a GUID
          const withGuid = matches.filter(m => m.guid);
          if (withGuid.length === 1) {
            return { guid: withGuid[0].guid!, path: withGuid[0].file_path };
          }
        }
      } catch {
        // Registry read failed
      }
    }

    // Strategy 5: Package cache fallback
    const packageCachePath = path.join(projectPath, '.unity-agentic', 'package-cache.json');
    if (existsSync(packageCachePath)) {
      try {
        const packageCache = JSON.parse(readFileSync(packageCachePath, 'utf-8')) as Record<string, string>;
        const scriptNameLower = script.toLowerCase().replace(/\.cs$/, '');

        for (const [guid, assetPath] of Object.entries(packageCache)) {
          if (!assetPath.endsWith('.cs')) continue;
          const fileName = path.basename(assetPath, '.cs').toLowerCase();
          if (fileName === scriptNameLower) {
            return { guid, path: assetPath };
          }
        }
      } catch {
        // Package cache read failed
      }
    }
  }

  return null;
}
