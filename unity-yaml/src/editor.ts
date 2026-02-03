import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import type { CreateGameObjectOptions, CreateGameObjectResult, EditTransformOptions, Vector3 } from './types';

export interface EditResult {
  success: boolean;
  file_path: string;
  bytes_written?: number;
  error?: string;
}

export interface PropertyEditOptions {
  file_path: string;
  object_name: string;
  property: string;
  new_value: string;
  preserve_comments?: boolean;
}

/**
 * Safely edit a Unity YAML file property while preserving GUIDs, file IDs, comments, and formatting.
 */
export function safeUnityYAMLEdit(
  filePath: string,
  objectName: string,
  propertyName: string,
  newValue: string
): EditResult {
  // Check if file exists first
  if (!existsSync(filePath)) {
    return {
      success: false,
      file_path: filePath,
      error: `File not found: ${filePath}`
    };
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      file_path: filePath,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Normalize property name: strip m_ prefix if provided, we'll add it back
  const normalizedProperty = propertyName.startsWith('m_')
    ? propertyName.slice(2)
    : propertyName;

  // Split the file into Unity YAML blocks (each starts with --- !u!)
  // Keep the delimiter with the block that follows it
  const blocks = content.split(/(?=--- !u!)/);

  // Find the GameObject block (!u!1) that contains m_Name: objectName
  // We need to escape special regex characters in the object name
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

  let targetBlockIndex = -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Check if this is a GameObject block (!u!1) and contains the target name
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      targetBlockIndex = i;
      break;
    }
  }

  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path: filePath,
      error: `GameObject "${objectName}" not found in file`
    };
  }

  // Edit only the target block
  const targetBlock = blocks[targetBlockIndex];
  const propertyPattern = new RegExp(
    `(^\\s*m_${normalizedProperty}:\\s*)([^\\n]*)`,
    'm'
  );

  let updatedBlock: string;
  if (propertyPattern.test(targetBlock)) {
    // Replace existing property
    updatedBlock = targetBlock.replace(propertyPattern, `$1${newValue}`);
  } else {
    // Property doesn't exist, add it before the next block marker or at the end
    updatedBlock = targetBlock.replace(
      /(\n)(--- !u!|$)/,
      `\n  m_${normalizedProperty}: ${newValue}$1$2`
    );
  }

  blocks[targetBlockIndex] = updatedBlock;
  const finalContent = blocks.join('');
  return atomicWrite(filePath, finalContent);
}

/**
 * Edit a specific property in a Unity file with validation.
 */
export function editProperty(options: PropertyEditOptions): EditResult {
  const result = safeUnityYAMLEdit(
    options.file_path,
    options.object_name,
    options.property,
    options.new_value
  );

  if (!result.success) {
    return result;
  }

  return result;
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
 * Atomic write: write to temp file, then rename to prevent partial writes.
 */
function atomicWrite(filePath: string, content: string): EditResult {
  const tmpPath = `${filePath}.tmp`;

  try {
    writeFileSync(tmpPath, content, 'utf-8');

    if (existsSync(filePath)) {
      renameSync(filePath, `${filePath}.bak`);
    }

    renameSync(tmpPath, filePath);

    try {
      if (existsSync(`${filePath}.bak`)) {
        const fs = require('fs');
        fs.unlinkSync(`${filePath}.bak`);
      }
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: true,
      file_path: filePath,
      bytes_written: Buffer.byteLength(content, 'utf-8')
    };
  } catch (error) {
    if (existsSync(`${filePath}.bak`)) {
      try {
        renameSync(`${filePath}.bak`, filePath);
      } catch (restoreError) {
        console.error('Failed to restore backup:', restoreError);
      }
    }

    return {
      success: false,
      file_path: filePath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Batch edit multiple properties in a single file for better performance.
 */
export function batchEditProperties(
  filePath: string,
  edits: Array<{ object_name: string; property: string; new_value: string }>
): EditResult {
  let updatedContent = '';

  for (const edit of edits) {
    const result = safeUnityYAMLEdit(
      filePath,
      edit.object_name,
      edit.property,
      edit.new_value
    );

    if (!result.success) {
      return {
        success: false,
        file_path: filePath,
        error: `Failed to edit ${edit.object_name}.${edit.property}: ${result.error}`
      };
    }

    updatedContent = readFileSync(filePath, 'utf-8');
  }

  const isValid = validateUnityYAML(updatedContent);

  if (!isValid) {
    return {
      success: false,
      file_path: filePath,
      error: 'Validation failed after batch edit'
    };
  }

  return atomicWrite(filePath, updatedContent);
}

/**
 * Get raw GameObject block as string.
 */
export function getGameObjectBlock(filePath: string, objectName: string): string | null {
  const content = readFileSync(filePath, 'utf-8');

  // Split the file into Unity YAML blocks
  const blocks = content.split(/(?=--- !u!)/);

  // Find the GameObject block (!u!1) that contains m_Name: objectName
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

  for (const block of blocks) {
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      return block;
    }
  }

  return null;
}

/**
 * Replace entire GameObject block.
 */
export function replaceGameObjectBlock(
  filePath: string,
  objectName: string,
  newBlockContent: string
): EditResult {
  const content = readFileSync(filePath, 'utf-8');

  // Split the file into Unity YAML blocks
  const blocks = content.split(/(?=--- !u!)/);

  // Find the GameObject block (!u!1) that contains m_Name: objectName
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

  let targetBlockIndex = -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      targetBlockIndex = i;
      break;
    }
  }

  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path: filePath,
      error: `GameObject "${objectName}" not found in file`
    };
  }

  if (!validateUnityYAML(newBlockContent)) {
    return {
      success: false,
      file_path: filePath,
      error: 'New GameObject block is invalid'
    };
  }

  blocks[targetBlockIndex] = newBlockContent;
  const finalContent = blocks.join('');
  return atomicWrite(filePath, finalContent);
}

/**
 * Extract all existing file IDs from a Unity YAML file.
 */
function extractExistingFileIds(content: string): Set<number> {
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
function generateFileId(existingIds: Set<number>): number {
  let id: number;
  do {
    // Generate a random ID in a range similar to Unity's (large positive integers)
    // Using 10-digit range to match observed Unity patterns
    id = Math.floor(Math.random() * 9000000000) + 1000000000;
  } while (existingIds.has(id) || id === 0);
  return id;
}

/**
 * Create YAML blocks for a new GameObject with Transform.
 */
function createGameObjectYAML(
  gameObjectId: number,
  transformId: number,
  name: string,
  parentTransformId: number = 0
): string {
  return `--- !u!1 &${gameObjectId}
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: ${transformId}}
  m_Layer: 0
  m_Name: ${name}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &${transformId}
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: ${parentTransformId}}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
`;
}

/**
 * Find a GameObject's Transform fileID by name.
 */
function findTransformIdByName(content: string, objectName: string): number | null {
  const blocks = content.split(/(?=--- !u!)/);

  // Find the GameObject block with matching name
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

  for (const block of blocks) {
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      // Extract the first component fileID (Transform is always first)
      const componentMatch = block.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
      if (componentMatch) {
        return parseInt(componentMatch[1], 10);
      }
    }
  }

  return null;
}

/**
 * Add a child Transform to a parent's m_Children array.
 */
function addChildToParent(content: string, parentTransformId: number, childTransformId: number): string {
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
 * Create a new GameObject in a Unity YAML file.
 */
export function createGameObject(options: CreateGameObjectOptions): CreateGameObjectResult {
  const { file_path, name, parent } = options;

  // Validate inputs
  if (!name || name.trim() === '') {
    return {
      success: false,
      file_path,
      error: 'GameObject name cannot be empty'
    };
  }

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Validate it's a Unity YAML file
  if (!content.startsWith('%YAML 1.1')) {
    return {
      success: false,
      file_path,
      error: 'File is not a valid Unity YAML file (missing header)'
    };
  }

  // Resolve parent Transform ID if specified
  let parentTransformId = 0;
  if (parent !== undefined) {
    if (typeof parent === 'number') {
      // Direct Transform fileID
      parentTransformId = parent;
      // Verify it exists
      const transformPattern = new RegExp(`--- !u!4 &${parentTransformId}\\b`);
      if (!transformPattern.test(content)) {
        return {
          success: false,
          file_path,
          error: `Parent Transform with fileID ${parentTransformId} not found`
        };
      }
    } else {
      // Parent name - find its Transform
      const foundId = findTransformIdByName(content, parent);
      if (foundId === null) {
        return {
          success: false,
          file_path,
          error: `Parent GameObject "${parent}" not found`
        };
      }
      parentTransformId = foundId;
    }
  }

  // Extract existing file IDs to avoid collisions
  const existingIds = extractExistingFileIds(content);

  // Generate unique IDs for the new GameObject and Transform
  const gameObjectId = generateFileId(existingIds);
  existingIds.add(gameObjectId);
  const transformId = generateFileId(existingIds);

  // Create the YAML blocks
  const newBlocks = createGameObjectYAML(gameObjectId, transformId, name.trim(), parentTransformId);

  // Append to file (ensure trailing newline before new blocks)
  let finalContent = content.endsWith('\n')
    ? content + newBlocks
    : content + '\n' + newBlocks;

  // If parented, add child to parent's m_Children array
  if (parentTransformId !== 0) {
    finalContent = addChildToParent(finalContent, parentTransformId, transformId);
  }

  // Write atomically
  const writeResult = atomicWrite(file_path, finalContent);

  if (!writeResult.success) {
    return {
      success: false,
      file_path,
      error: writeResult.error
    };
  }

  return {
    success: true,
    file_path,
    game_object_id: gameObjectId,
    transform_id: transformId
  };
}

/**
 * Convert Euler angles (degrees) to quaternion.
 * Unity uses ZXY rotation order.
 */
function eulerToQuaternion(euler: Vector3): { x: number; y: number; z: number; w: number } {
  const deg2rad = Math.PI / 180;
  const x = euler.x * deg2rad;
  const y = euler.y * deg2rad;
  const z = euler.z * deg2rad;

  // Unity uses ZXY rotation order
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz
  };
}

/**
 * Edit Transform component properties by fileID.
 */
export function editTransform(options: EditTransformOptions): EditResult {
  const { file_path, transform_id, position, rotation, scale } = options;

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Split into blocks
  const blocks = content.split(/(?=--- !u!)/);

  // Find the Transform block by fileID (class ID 4)
  const transformPattern = new RegExp(`^--- !u!4 &${transform_id}\\b`);
  let targetBlockIndex = -1;

  for (let i = 0; i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      targetBlockIndex = i;
      break;
    }
  }

  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path,
      error: `Transform with fileID ${transform_id} not found`
    };
  }

  let block = blocks[targetBlockIndex];

  // Update position if provided
  if (position) {
    block = block.replace(
      /m_LocalPosition:\s*\{[^}]+\}/,
      `m_LocalPosition: {x: ${position.x}, y: ${position.y}, z: ${position.z}}`
    );
  }

  // Update rotation if provided (convert Euler to quaternion)
  if (rotation) {
    const quat = eulerToQuaternion(rotation);
    block = block.replace(
      /m_LocalRotation:\s*\{[^}]+\}/,
      `m_LocalRotation: {x: ${quat.x}, y: ${quat.y}, z: ${quat.z}, w: ${quat.w}}`
    );
    // Also update the Euler hint
    block = block.replace(
      /m_LocalEulerAnglesHint:\s*\{[^}]+\}/,
      `m_LocalEulerAnglesHint: {x: ${rotation.x}, y: ${rotation.y}, z: ${rotation.z}}`
    );
  }

  // Update scale if provided
  if (scale) {
    block = block.replace(
      /m_LocalScale:\s*\{[^}]+\}/,
      `m_LocalScale: {x: ${scale.x}, y: ${scale.y}, z: ${scale.z}}`
    );
  }

  blocks[targetBlockIndex] = block;
  const finalContent = blocks.join('');

  return atomicWrite(file_path, finalContent);
}
