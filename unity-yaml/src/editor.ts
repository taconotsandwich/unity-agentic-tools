import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import type { CreateGameObjectOptions, CreateGameObjectResult, EditTransformOptions, Vector3, AddComponentOptions, AddComponentResult, CreatePrefabVariantOptions, CreatePrefabVariantResult, Quaternion, PropertyEdit, EditComponentByFileIdOptions, EditComponentResult, RemoveComponentOptions, RemoveComponentResult, DeleteGameObjectOptions, DeleteGameObjectResult, CopyComponentOptions, CopyComponentResult, DuplicateGameObjectOptions, DuplicateGameObjectResult, CreateScriptableObjectOptions, CreateScriptableObjectResult, UnpackPrefabOptions, UnpackPrefabResult, ReparentGameObjectOptions, ReparentGameObjectResult, CreateMetaFileOptions, CreateMetaFileResult, CreateSceneOptions, CreateSceneResult } from './types';
import { get_class_id, UNITY_CLASS_IDS } from './class-ids';
import { atomicWrite, generateGuid } from './utils';

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
 * Edit any component property by file ID.
 * Works with any Unity class type (Transform, MeshRenderer, MonoBehaviour, etc.)
 */
export function editComponentByFileId(options: EditComponentByFileIdOptions): EditComponentResult {
  const { file_path, file_id, property, new_value } = options;

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

  // Normalize property name for applyModification:
  // - Dotted/array paths: keep as-is if they already have m_ prefix,
  //   otherwise prepend m_ to the root segment only
  // - Simple paths: ensure m_ prefix
  let normalizedProperty: string;
  if (property.includes('.') || property.includes('Array')) {
    // Dotted or array path — ensure root segment has m_ prefix
    const rootSegment = property.split('.')[0];
    if (rootSegment.startsWith('m_')) {
      normalizedProperty = property;
    } else {
      normalizedProperty = 'm_' + property;
    }
  } else {
    // Simple path
    normalizedProperty = property.startsWith('m_') ? property : 'm_' + property;
  }

  // Find the block with this file ID (any class type)
  const blockPattern = new RegExp(`--- !u!(\\d+) &${file_id}\\b`);
  const blockMatch = content.match(blockPattern);

  if (!blockMatch) {
    return {
      success: false,
      file_path,
      error: `Component with file ID ${file_id} not found`
    };
  }

  const classId = parseInt(blockMatch[1], 10);

  // Split the file into Unity YAML blocks
  const blocks = content.split(/(?=--- !u!)/);

  // Find the target block
  const targetBlockPattern = new RegExp(`^--- !u!${classId} &${file_id}\\b`);
  let targetBlockIndex = -1;

  for (let i = 0; i < blocks.length; i++) {
    if (targetBlockPattern.test(blocks[i])) {
      targetBlockIndex = i;
      break;
    }
  }

  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path,
      error: `Component block with file ID ${file_id} not found`
    };
  }

  // Use applyModification for all path types (simple, dotted, array)
  const targetBlock = blocks[targetBlockIndex];
  let updatedBlock = applyModification(targetBlock, normalizedProperty, new_value, '{fileID: 0}');

  // If applyModification didn't change anything, try without m_ prefix
  // (some properties like "serializedVersion" don't use m_ prefix)
  if (updatedBlock === targetBlock) {
    const withoutPrefix = property.startsWith('m_') ? property.slice(2) : property;
    updatedBlock = applyModification(targetBlock, withoutPrefix, new_value, '{fileID: 0}');
  }

  // If still unchanged and it's a simple path, add the property
  if (updatedBlock === targetBlock && !property.includes('.') && !property.includes('Array')) {
    const addProp = property.startsWith('m_') ? property : 'm_' + property;
    updatedBlock = targetBlock.replace(
      /(\n)(--- !u!|$)/,
      `\n  ${addProp}: ${new_value}$1$2`
    );
  }

  blocks[targetBlockIndex] = updatedBlock;
  const finalContent = blocks.join('');

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
    file_id,
    class_id: classId,
    bytes_written: writeResult.bytes_written
  };
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
 * Batch edit multiple properties in a single file for better performance.
 * Single-pass: reads once, applies all edits in memory, validates, writes once.
 */
export function batchEditProperties(
  filePath: string,
  edits: PropertyEdit[]
): EditResult {
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

  // Split into blocks once
  let blocks = content.split(/(?=--- !u!)/);

  // Group edits by object_name to find each block only once
  const editsByObject = new Map<string, PropertyEdit[]>();
  for (const edit of edits) {
    const existing = editsByObject.get(edit.object_name) || [];
    existing.push(edit);
    editsByObject.set(edit.object_name, existing);
  }

  // Apply all edits in memory
  for (const [objectName, objectEdits] of editsByObject) {
    const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

    let targetBlockIndex = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].startsWith('--- !u!1 ') && namePattern.test(blocks[i])) {
        targetBlockIndex = i;
        break;
      }
    }

    if (targetBlockIndex === -1) {
      return {
        success: false,
        file_path: filePath,
        error: `Failed to edit ${objectName}.${objectEdits[0].property}: GameObject "${objectName}" not found in file`
      };
    }

    // Apply each property edit to this block
    for (const edit of objectEdits) {
      const normalizedProperty = edit.property.startsWith('m_')
        ? edit.property.slice(2)
        : edit.property;

      const propertyPattern = new RegExp(
        `(^\\s*m_${normalizedProperty}:\\s*)([^\\n]*)`,
        'm'
      );

      if (propertyPattern.test(blocks[targetBlockIndex])) {
        blocks[targetBlockIndex] = blocks[targetBlockIndex].replace(
          propertyPattern,
          `$1${edit.new_value}`
        );
      } else {
        blocks[targetBlockIndex] = blocks[targetBlockIndex].replace(
          /(\n)(--- !u!|$)/,
          `\n  m_${normalizedProperty}: ${edit.new_value}$1$2`
        );
      }
    }
  }

  const updatedContent = blocks.join('');

  if (!validateUnityYAML(updatedContent)) {
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
function eulerToQuaternion(euler: Vector3): Quaternion {
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

/**
 * Generate generic YAML for any Unity component.
 * Unity will fill in default values when the scene/prefab is loaded.
 */
function createGenericComponentYAML(
  componentName: string,
  classId: number,
  componentId: number,
  gameObjectId: number
): string {
  return `--- !u!${classId} &${componentId}
${componentName}:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
`;
}

/**
 * Find a GameObject's fileID by name.
 */
function findGameObjectIdByName(content: string, objectName: string): number | null {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, 'm');

  for (const block of blocks) {
    if (block.startsWith('--- !u!1 ') && namePattern.test(block)) {
      const idMatch = block.match(/^--- !u!1 &(\d+)/);
      if (idMatch) {
        return parseInt(idMatch[1], 10);
      }
    }
  }

  return null;
}

/**
 * Add a component reference to a GameObject's m_Component array.
 */
function addComponentToGameObject(content: string, gameObjectId: number, componentId: number): string {
  const blocks = content.split(/(?=--- !u!)/);
  const goPattern = new RegExp(`^--- !u!1 &${gameObjectId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    if (goPattern.test(blocks[i])) {
      // Add component to m_Component array
      blocks[i] = blocks[i].replace(
        /(m_Component:\s*\n(?:\s*-\s*component:\s*\{fileID:\s*\d+\}\s*\n)*)/,
        `$1  - component: {fileID: ${componentId}}\n`
      );
      break;
    }
  }

  return blocks.join('');
}

/**
 * Look up a script GUID by name, path, or raw GUID.
 * Returns { guid, path } or null if not found.
 */
function resolveScriptGuid(
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

        // Search for matching script
        for (const [guid, assetPath] of Object.entries(cache)) {
          if (!assetPath.endsWith('.cs')) continue;

          const fileName = path.basename(assetPath, '.cs').toLowerCase();
          const pathLower = assetPath.toLowerCase();

          // Exact name match
          if (fileName === scriptNameLower) {
            return { guid, path: assetPath };
          }
          // Path contains the script name
          if (pathLower.includes(scriptNameLower)) {
            return { guid, path: assetPath };
          }
        }
      } catch {
        // Cache read failed
      }
    }
  }

  return null;
}

/**
 * Create MonoBehaviour YAML for a custom script.
 */
function createMonoBehaviourYAML(
  componentId: number,
  gameObjectId: number,
  scriptGuid: string
): string {
  return `--- !u!114 &${componentId}
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
  m_Name:
  m_EditorClassIdentifier:
`;
}

/**
 * Add a component to an existing GameObject.
 * Supports any Unity built-in component by name (e.g., "MeshRenderer", "Animator", "Canvas")
 * and custom scripts by name, path, or GUID.
 */
export function addComponent(options: AddComponentOptions): AddComponentResult {
  const { file_path, game_object_name, component_type, project_path } = options;

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

  // Find the GameObject
  const gameObjectId = findGameObjectIdByName(content, game_object_name);
  if (gameObjectId === null) {
    return {
      success: false,
      file_path,
      error: `GameObject "${game_object_name}" not found`
    };
  }

  // Generate unique component ID
  const existingIds = extractExistingFileIds(content);
  const componentId = generateFileId(existingIds);

  let componentYAML: string;
  let scriptGuid: string | undefined;
  let scriptPath: string | undefined;

  // Check if it's a known Unity built-in component
  const classId = get_class_id(component_type);
  if (classId !== null) {
    // Get the canonical component name from the class ID mapping
    const componentName = UNITY_CLASS_IDS[classId] || component_type;
    componentYAML = createGenericComponentYAML(componentName, classId, componentId, gameObjectId);
  } else {
    // Treat as custom script
    const resolved = resolveScriptGuid(component_type, project_path);
    if (!resolved) {
      return {
        success: false,
        file_path,
        error: `Component or script not found: "${component_type}". Use a Unity component name (e.g., "MeshRenderer", "Animator") or provide a script name, path (Assets/Scripts/Foo.cs), or GUID.`
      };
    }
    componentYAML = createMonoBehaviourYAML(componentId, gameObjectId, resolved.guid);
    scriptGuid = resolved.guid;
    scriptPath = resolved.path || undefined;
  }

  // Add component reference to GameObject
  content = addComponentToGameObject(content, gameObjectId, componentId);

  // Append component block to file
  const finalContent = content.endsWith('\n')
    ? content + componentYAML
    : content + '\n' + componentYAML;

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
    component_id: componentId,
    script_guid: scriptGuid,
    script_path: scriptPath
  };
}

/**
 * Extract GUID from a Unity .meta file.
 */
function extractGuidFromMeta(metaPath: string): string | null {
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
 * Find the root GameObject in a prefab file (the one with m_Father: {fileID: 0}).
 */
function findPrefabRootInfo(content: string): { gameObjectId: number; transformId: number; name: string } | null {
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

  return null;
}


/**
 * Create a Prefab Variant from a source prefab.
 */
export function createPrefabVariant(options: CreatePrefabVariantOptions): CreatePrefabVariantResult {
  const { source_prefab, output_path, variant_name } = options;

  // Check source prefab exists
  if (!existsSync(source_prefab)) {
    return {
      success: false,
      output_path,
      error: `Source prefab not found: ${source_prefab}`
    };
  }

  // Check source prefab has .prefab extension
  if (!source_prefab.endsWith('.prefab')) {
    return {
      success: false,
      output_path,
      error: 'Source file must be a .prefab file'
    };
  }

  // Check output path has .prefab extension
  if (!output_path.endsWith('.prefab')) {
    return {
      success: false,
      output_path,
      error: 'Output path must have .prefab extension'
    };
  }

  // Get source prefab GUID from .meta file
  const metaPath = source_prefab + '.meta';
  const sourceGuid = extractGuidFromMeta(metaPath);

  if (!sourceGuid) {
    return {
      success: false,
      output_path,
      error: `Could not find or read .meta file for source prefab: ${metaPath}`
    };
  }

  // Read source prefab to find root GameObject info
  let sourceContent: string;
  try {
    sourceContent = readFileSync(source_prefab, 'utf-8');
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  const rootInfo = findPrefabRootInfo(sourceContent);
  if (!rootInfo) {
    return {
      success: false,
      output_path,
      error: 'Could not find root GameObject in source prefab'
    };
  }

  // Generate IDs for the variant
  const prefabInstanceId = generateFileId(new Set());
  const strippedGoId = generateFileId(new Set([prefabInstanceId]));
  const strippedTransformId = generateFileId(new Set([prefabInstanceId, strippedGoId]));

  // Determine variant name
  const finalName = variant_name || `${rootInfo.name} Variant`;

  // Create the Prefab Variant YAML
  const variantYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &${strippedGoId} stripped
GameObject:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.gameObjectId}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!4 &${strippedTransformId} stripped
Transform:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.transformId}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!1001 &${prefabInstanceId}
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: ${rootInfo.gameObjectId}, guid: ${sourceGuid}, type: 3}
      propertyPath: m_Name
      value: ${finalName}
      objectReference: {fileID: 0}
    m_RemovedComponents: []
    m_RemovedGameObjects: []
    m_AddedGameObjects: []
    m_AddedComponents: []
  m_SourcePrefab: {fileID: 100100000, guid: ${sourceGuid}, type: 3}
`;

  // Write the variant prefab
  try {
    writeFileSync(output_path, variantYaml, 'utf-8');
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write variant prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Generate .meta file for the variant
  const variantGuid = generateGuid();
  const variantMetaContent = `fileFormatVersion: 2
guid: ${variantGuid}
PrefabImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(output_path + '.meta', variantMetaContent, 'utf-8');
  } catch (err) {
    // Clean up the prefab file if meta write fails
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore cleanup error */ }

    return {
      success: false,
      output_path,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return {
    success: true,
    output_path,
    source_guid: sourceGuid,
    prefab_instance_id: prefabInstanceId
  };
}

// ========== Phase 0: Shared Helpers ==========

/**
 * Find a YAML block by its fileID.
 */
function findBlockByFileId(content: string, fileId: number): { block: string; classId: number; index: number } | null {
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
 * Remove blocks whose fileIDs are in the given set.
 * Always keeps the first block (YAML header).
 */
function removeBlocks(content: string, fileIdsToRemove: Set<number>): string {
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
 * Remove a component reference from a GameObject's m_Component array.
 */
function removeComponentFromGameObject(content: string, goFileId: number, compFileId: number): string {
  const blocks = content.split(/(?=--- !u!)/);
  const goPattern = new RegExp(`^--- !u!1 &${goFileId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    if (goPattern.test(blocks[i])) {
      // Remove the component line
      const compLinePattern = new RegExp(`\\s*- component: \\{fileID: ${compFileId}\\}\\n?`);
      blocks[i] = blocks[i].replace(compLinePattern, '');
      break;
    }
  }

  return blocks.join('');
}

/**
 * Remove a child from a parent Transform's m_Children.
 */
function removeChildFromParent(content: string, parentTransformId: number, childTransformId: number): string {
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);

  for (let i = 0; i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      // Remove the child line from multiline m_Children
      const childLinePattern = new RegExp(`\\s*- \\{fileID: ${childTransformId}\\}\\n?`);
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
 * Recursively collect all fileIDs in a Transform hierarchy (not including the starting Transform itself).
 */
function collectHierarchy(content: string, transformFileId: number): Set<number> {
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
function remapFileIds(blockText: string, idMap: Map<number, number>): string {
  let result = blockText;

  // Remap header: --- !u!<cls> &<old> → &<new>
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
 * Apply a single property modification to a block.
 */
function applyModification(block: string, propertyPath: string, value: string, objectReference: string): string {
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

// ========== Phase 1: Remove Component ==========

/**
 * Remove a component from a Unity YAML file by its fileID.
 */
export function removeComponent(options: RemoveComponentOptions): RemoveComponentResult {
  const { file_path, file_id } = options;
  const fileIdNum = parseInt(file_id, 10);

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const found = findBlockByFileId(content, fileIdNum);
  if (!found) {
    return { success: false, file_path, error: `Component with file ID ${file_id} not found` };
  }

  // Reject if it's a GameObject (1) or Transform (4)
  if (found.classId === 1) {
    return { success: false, file_path, error: 'Cannot remove a GameObject with remove-component. Use delete instead.' };
  }
  if (found.classId === 4) {
    return { success: false, file_path, error: 'Cannot remove a Transform with remove-component. Use delete to remove the entire GameObject.' };
  }

  // Extract m_GameObject from the component block
  const goMatch = found.block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
  if (goMatch) {
    const parentGoId = parseInt(goMatch[1], 10);
    content = removeComponentFromGameObject(content, parentGoId, fileIdNum);
  }

  content = removeBlocks(content, new Set([fileIdNum]));

  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: 'Validation failed after removing component' };
  }

  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    removed_file_id: file_id,
    removed_class_id: found.classId
  };
}

// ========== Phase 2: Delete GameObject ==========

/**
 * Delete a GameObject and its entire hierarchy from a Unity YAML file.
 */
export function deleteGameObject(options: DeleteGameObjectOptions): DeleteGameObjectResult {
  const { file_path, object_name } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const goId = findGameObjectIdByName(content, object_name);
  if (goId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }

  // Collect all component fileIDs from the GO
  const goFound = findBlockByFileId(content, goId);
  if (!goFound) {
    return { success: false, file_path, error: `GameObject block not found` };
  }

  const componentIds = new Set<number>();
  const compMatches = goFound.block.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.add(parseInt(cm[1], 10));
  }

  // Find the Transform among the components
  let transformId: number | null = null;
  let fatherId = 0;
  const blocks = content.split(/(?=--- !u!)/);

  for (const compId of componentIds) {
    const transformPattern = new RegExp(`^--- !u!4 &${compId}\\b`);
    for (const block of blocks) {
      if (transformPattern.test(block)) {
        transformId = compId;
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    if (transformId !== null) break;
  }

  // Collect all descendants
  const allIds = new Set<number>([goId]);
  for (const id of componentIds) {
    allIds.add(id);
  }

  if (transformId !== null) {
    const descendants = collectHierarchy(content, transformId);
    for (const id of descendants) {
      allIds.add(id);
    }
  }

  // Detach from parent if parented
  if (fatherId !== 0 && transformId !== null) {
    content = removeChildFromParent(content, fatherId, transformId);
  }

  content = removeBlocks(content, allIds);

  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: 'Validation failed after deleting GameObject' };
  }

  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    deleted_count: allIds.size
  };
}

// ========== Phase 3: Copy Component ==========

/**
 * Copy a component to a different (or same) GameObject.
 */
export function copyComponent(options: CopyComponentOptions): CopyComponentResult {
  const { file_path, source_file_id, target_game_object_name } = options;
  const sourceIdNum = parseInt(source_file_id, 10);

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const found = findBlockByFileId(content, sourceIdNum);
  if (!found) {
    return { success: false, file_path, error: `Component with file ID ${source_file_id} not found` };
  }

  if (found.classId === 1) {
    return { success: false, file_path, error: 'Cannot copy a GameObject. Use duplicate instead.' };
  }
  if (found.classId === 4) {
    return { success: false, file_path, error: 'Cannot copy a Transform component.' };
  }

  const targetGoId = findGameObjectIdByName(content, target_game_object_name);
  if (targetGoId === null) {
    return { success: false, file_path, error: `Target GameObject "${target_game_object_name}" not found` };
  }

  const existingIds = extractExistingFileIds(content);
  const newId = generateFileId(existingIds);

  // Clone the block with new fileId and updated m_GameObject
  let clonedBlock = found.block.replace(
    new RegExp(`^(--- !u!${found.classId} &)${sourceIdNum}`),
    `$1${newId}`
  );
  clonedBlock = clonedBlock.replace(
    /m_GameObject:\s*\{fileID:\s*\d+\}/,
    `m_GameObject: {fileID: ${targetGoId}}`
  );

  // Add component reference to target GO
  content = addComponentToGameObject(content, targetGoId, newId);

  // Append cloned block
  content = content.endsWith('\n')
    ? content + clonedBlock
    : content + '\n' + clonedBlock;

  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: 'Validation failed after copying component' };
  }

  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    source_file_id,
    new_component_id: newId,
    target_game_object: target_game_object_name
  };
}

// ========== Phase 4: Duplicate GameObject ==========

/**
 * Duplicate a GameObject (and its entire hierarchy) within the same file.
 */
export function duplicateGameObject(options: DuplicateGameObjectOptions): DuplicateGameObjectResult {
  const { file_path, object_name, new_name } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const goId = findGameObjectIdByName(content, object_name);
  if (goId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }

  const goFound = findBlockByFileId(content, goId);
  if (!goFound) {
    return { success: false, file_path, error: `GameObject block not found` };
  }

  // Collect all component fileIDs
  const componentIds: number[] = [];
  const compMatches = goFound.block.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.push(parseInt(cm[1], 10));
  }

  // Find the Transform
  let transformId: number | null = null;
  let fatherId = 0;
  const blocks = content.split(/(?=--- !u!)/);

  for (const compId of componentIds) {
    const transformPattern = new RegExp(`^--- !u!4 &${compId}\\b`);
    for (const block of blocks) {
      if (transformPattern.test(block)) {
        transformId = compId;
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    if (transformId !== null) break;
  }

  // Build full set of IDs to duplicate
  const allOldIds = new Set<number>([goId, ...componentIds]);
  if (transformId !== null) {
    const descendants = collectHierarchy(content, transformId);
    for (const id of descendants) {
      allOldIds.add(id);
    }
  }

  // Generate new IDs for each old ID
  const existingIds = extractExistingFileIds(content);
  const idMap = new Map<number, number>();
  for (const oldId of allOldIds) {
    const newId = generateFileId(existingIds);
    existingIds.add(newId);
    idMap.set(oldId, newId);
  }

  // Clone all blocks
  const clonedBlocks: string[] = [];
  for (const block of blocks) {
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (idMatch) {
      const blockId = parseInt(idMatch[1], 10);
      if (allOldIds.has(blockId)) {
        clonedBlocks.push(remapFileIds(block, idMap));
      }
    }
  }

  // Set m_Name on the cloned root GO
  const finalName = new_name || `${object_name} (1)`;
  const escapedOldName = object_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < clonedBlocks.length; i++) {
    if (clonedBlocks[i].startsWith(`--- !u!1 &${idMap.get(goId)}`)) {
      clonedBlocks[i] = clonedBlocks[i].replace(
        new RegExp(`(m_Name:\\s*)${escapedOldName}`),
        `$1${finalName}`
      );
      break;
    }
  }

  // If source had a parent, add cloned Transform to parent's m_Children
  const newTransformId = transformId !== null ? idMap.get(transformId)! : null;
  let finalContent = content.endsWith('\n')
    ? content + clonedBlocks.join('')
    : content + '\n' + clonedBlocks.join('');

  if (fatherId !== 0 && newTransformId !== null) {
    finalContent = addChildToParent(finalContent, fatherId, newTransformId);
  }

  if (!validateUnityYAML(finalContent)) {
    return { success: false, file_path, error: 'Validation failed after duplicating GameObject' };
  }

  const writeResult = atomicWrite(file_path, finalContent);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    game_object_id: idMap.get(goId),
    transform_id: newTransformId ?? undefined,
    total_duplicated: allOldIds.size
  };
}

// ========== Phase 5: Create ScriptableObject ==========

/**
 * Create a new ScriptableObject .asset file.
 */
export function createScriptableObject(options: CreateScriptableObjectOptions): CreateScriptableObjectResult {
  const { output_path, script, project_path } = options;

  if (!output_path.endsWith('.asset')) {
    return { success: false, output_path, error: 'Output path must have .asset extension' };
  }

  const resolved = resolveScriptGuid(script, project_path);
  if (!resolved) {
    return { success: false, output_path, error: `Script not found: "${script}". Provide a GUID, script path, or script name with --project.` };
  }

  const baseName = path.basename(output_path, '.asset');

  const assetYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 0}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${resolved.guid}, type: 3}
  m_Name: ${baseName}
  m_EditorClassIdentifier:
`;

  try {
    writeFileSync(output_path, assetYaml, 'utf-8');
  } catch (err) {
    return { success: false, output_path, error: `Failed to write asset file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Generate .meta file
  const assetGuid = generateGuid();
  const metaContent = `fileFormatVersion: 2
guid: ${assetGuid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 11400000
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(output_path + '.meta', metaContent, 'utf-8');
  } catch (err) {
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore */ }
    return { success: false, output_path, error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}` };
  }

  return {
    success: true,
    output_path,
    script_guid: resolved.guid,
    asset_guid: assetGuid
  };
}

// ========== Phase 6: Unpack Prefab Instance ==========

/**
 * Unpack a PrefabInstance in a scene file, converting it to standalone GameObjects.
 */
export function unpackPrefab(options: UnpackPrefabOptions): UnpackPrefabResult {
  const { file_path, prefab_instance, project_path } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const blocks = content.split(/(?=--- !u!)/);

  // Find the PrefabInstance block - try by fileID first, then by name in modifications
  let prefabInstanceBlock: string | null = null;
  let prefabInstanceId: number | null = null;

  // Try as fileID
  const asNumber = parseInt(prefab_instance, 10);
  if (!isNaN(asNumber)) {
    for (const block of blocks) {
      if (new RegExp(`^--- !u!1001 &${asNumber}\\b`).test(block)) {
        prefabInstanceBlock = block;
        prefabInstanceId = asNumber;
        break;
      }
    }
  }

  // Try by name in m_Modifications (look for m_Name modification)
  if (!prefabInstanceBlock) {
    for (const block of blocks) {
      if (block.startsWith('--- !u!1001 ')) {
        const nameModPattern = new RegExp(`propertyPath: m_Name\\s*\\n\\s*value: ${prefab_instance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
        if (nameModPattern.test(block)) {
          prefabInstanceBlock = block;
          const idMatch = block.match(/^--- !u!1001 &(\d+)/);
          if (idMatch) prefabInstanceId = parseInt(idMatch[1], 10);
          break;
        }
      }
    }
  }

  if (!prefabInstanceBlock || prefabInstanceId === null) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // Extract m_SourcePrefab guid
  const sourcePrefabMatch = prefabInstanceBlock.match(/m_SourcePrefab:\s*\{fileID:\s*\d+,\s*guid:\s*([a-f0-9]+)/);
  if (!sourcePrefabMatch) {
    return { success: false, file_path, error: 'Could not find m_SourcePrefab in PrefabInstance' };
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

  if (!sourcePrefabPath || !existsSync(sourcePrefabPath)) {
    return { success: false, file_path, error: `Could not resolve source prefab with GUID ${sourcePrefabGuid}. Provide --project path with GUID cache.` };
  }

  // Read source prefab
  let prefabContent: string;
  try {
    prefabContent = readFileSync(sourcePrefabPath, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}` };
  }

  const prefabBlocks = prefabContent.split(/(?=--- !u!)/);

  // Collect all block fileIDs from the prefab
  const prefabIds: number[] = [];
  for (const block of prefabBlocks) {
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (idMatch) {
      prefabIds.push(parseInt(idMatch[1], 10));
    }
  }

  // Generate new fileIDs for each prefab block
  const existingIds = extractExistingFileIds(content);
  const idMap = new Map<number, number>();
  for (const oldId of prefabIds) {
    const newId = generateFileId(existingIds);
    existingIds.add(newId);
    idMap.set(oldId, newId);
  }

  // Parse m_RemovedComponents
  const removedComponents = new Set<number>();
  const removedSection = prefabInstanceBlock.match(/m_RemovedComponents:\s*\n((?:\s*-\s*\{[^}]+\}\s*\n)*)/);
  if (removedSection) {
    const removedMatches = removedSection[1].matchAll(/fileID:\s*(\d+)/g);
    for (const rm of removedMatches) {
      removedComponents.add(parseInt(rm[1], 10));
    }
  }

  // Clone all prefab blocks (skipping removed components and header)
  const clonedBlocks: string[] = [];
  for (const block of prefabBlocks) {
    if (!block.startsWith('--- !u!')) continue;

    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (!idMatch) continue;

    const blockId = parseInt(idMatch[1], 10);
    if (removedComponents.has(blockId)) continue;

    let cloned = remapFileIds(block, idMap);

    // Remove prefab-related fields from cloned blocks
    cloned = cloned.replace(/\s*m_CorrespondingSourceObject:\s*\{[^}]+\}\n?/, '\n  m_CorrespondingSourceObject: {fileID: 0}\n');
    cloned = cloned.replace(/\s*m_PrefabInstance:\s*\{[^}]+\}\n?/, '\n  m_PrefabInstance: {fileID: 0}\n');
    cloned = cloned.replace(/\s*m_PrefabAsset:\s*\{[^}]+\}\n?/, '\n  m_PrefabAsset: {fileID: 0}\n');

    clonedBlocks.push(cloned);
  }

  // Parse and apply m_Modifications
  const modificationsSection = prefabInstanceBlock.match(/m_Modifications:\s*\n((?:\s*-\s*target:[\s\S]*?(?=\s*m_RemovedComponents:|\s*m_RemovedGameObjects:|\s*m_AddedGameObjects:|\s*m_AddedComponents:|\s*m_SourcePrefab:))?)/);
  if (modificationsSection) {
    const modEntries = modificationsSection[1].split(/\n\s*-\s*target:/).filter(s => s.trim());

    for (const entry of modEntries) {
      const targetIdMatch = entry.match(/\{fileID:\s*(\d+)/);
      const propPathMatch = entry.match(/propertyPath:\s*(.+)/);
      const valueMatch = entry.match(/value:\s*(.*)/);
      const objRefMatch = entry.match(/objectReference:\s*(\{[^}]*\})/);

      if (targetIdMatch && propPathMatch) {
        const targetOldId = parseInt(targetIdMatch[1], 10);
        const targetNewId = idMap.get(targetOldId);
        if (targetNewId === undefined) continue;

        const propertyPath = propPathMatch[1].trim();
        const value = valueMatch ? valueMatch[1].trim() : '';
        const objectReference = objRefMatch ? objRefMatch[1].trim() : '{fileID: 0}';

        // Remap objectReference fileIDs
        let remappedObjRef = objectReference;
        if (objectReference !== '{fileID: 0}') {
          remappedObjRef = objectReference.replace(/(\{fileID:\s*)(\d+)/g, (match, prefix, oldId) => {
            const id = parseInt(oldId, 10);
            if (id === 0) return match;
            return idMap.has(id) ? `${prefix}${idMap.get(id)}` : match;
          });
        }

        // Find and modify the cloned block
        for (let i = 0; i < clonedBlocks.length; i++) {
          if (clonedBlocks[i].match(new RegExp(`^--- !u!\\d+ &${targetNewId}\\b`))) {
            clonedBlocks[i] = applyModification(clonedBlocks[i], propertyPath, value, remappedObjRef);
            break;
          }
        }
      }
    }
  }

  // Handle m_TransformParent
  const transformParentMatch = prefabInstanceBlock.match(/m_TransformParent:\s*\{fileID:\s*(\d+)\}/);
  const transformParentId = transformParentMatch ? parseInt(transformParentMatch[1], 10) : 0;

  // Find the root Transform in cloned blocks and set m_Father
  const rootInfo = findPrefabRootInfo(prefabContent);
  if (rootInfo && idMap.has(rootInfo.transformId)) {
    const newRootTransformId = idMap.get(rootInfo.transformId)!;
    for (let i = 0; i < clonedBlocks.length; i++) {
      if (clonedBlocks[i].match(new RegExp(`^--- !u!4 &${newRootTransformId}\\b`))) {
        clonedBlocks[i] = clonedBlocks[i].replace(
          /m_Father:\s*\{fileID:\s*\d+\}/,
          `m_Father: {fileID: ${transformParentId}}`
        );
        break;
      }
    }
  }

  // Find and remove all stripped blocks referencing this PrefabInstance
  const strippedBlockIds = new Set<number>();
  for (const block of blocks) {
    if (block.includes('stripped') && block.includes(`m_PrefabInstance: {fileID: ${prefabInstanceId}}`)) {
      const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
      if (idMatch) {
        strippedBlockIds.add(parseInt(idMatch[1], 10));
      }
    }
  }

  // Handle scene-side added components (components in scene that reference stripped GOs)
  for (const block of blocks) {
    if (block.includes(`m_PrefabInstance: {fileID: 0}`) || !block.startsWith('--- !u!')) continue;
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (!idMatch) continue;
    const blockId = parseInt(idMatch[1], 10);
    if (strippedBlockIds.has(blockId) || blockId === prefabInstanceId) continue;

    // Check if this block references the PrefabInstance
    if (block.includes(`m_PrefabInstance: {fileID: ${prefabInstanceId}}`)) {
      // This is an added component on the scene side; keep it but re-wire m_GameObject
      // Not adding to removal set
    }
  }

  // Build set of blocks to remove: PrefabInstance + stripped blocks
  const blocksToRemove = new Set<number>([prefabInstanceId, ...strippedBlockIds]);

  content = removeBlocks(content, blocksToRemove);

  // Append cloned blocks
  content = content.endsWith('\n')
    ? content + clonedBlocks.join('')
    : content + '\n' + clonedBlocks.join('');

  // If parent transform exists, add root Transform as child
  if (transformParentId !== 0 && rootInfo && idMap.has(rootInfo.transformId)) {
    content = addChildToParent(content, transformParentId, idMap.get(rootInfo.transformId)!);
  }

  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: 'Validation failed after unpacking prefab' };
  }

  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  const newRootGoId = rootInfo ? idMap.get(rootInfo.gameObjectId) : undefined;

  return {
    success: true,
    file_path,
    unpacked_count: clonedBlocks.length,
    root_game_object_id: newRootGoId
  };
}

// ========== Phase 7: Reparent GameObject ==========

/**
 * Check if candidateAncestorTransformId is an ancestor of childTransformId
 * by walking up the m_Father chain. Prevents circular parenting.
 *
 */
function isAncestor(content: string, childTransformId: number, candidateAncestorTransformId: number): boolean {
  // Walk up from candidateAncestorTransformId's m_Father chain.
  // If we ever reach childTransformId, it means childTransformId is an
  // ancestor of candidateAncestorTransformId — making the reparent circular.
  const blocks = content.split(/(?=--- !u!)/);

  let currentId = candidateAncestorTransformId;
  const visited = new Set<number>();

  while (currentId !== 0) {
    if (currentId === childTransformId) return true;
    if (visited.has(currentId)) return false; // already a cycle, bail
    visited.add(currentId);

    // Find this Transform block and read its m_Father
    const pattern = new RegExp(`^--- !u!4 &${currentId}\\b`);
    let fatherId = 0;
    for (const block of blocks) {
      if (pattern.test(block)) {
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    currentId = fatherId;
  }

  return false;
}

/**
 * Reparent a GameObject under a new parent (or to root).
 */
export function reparentGameObject(options: ReparentGameObjectOptions): ReparentGameObjectResult {
  const { file_path, object_name, new_parent } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find the child's Transform ID
  const childTransformId = findTransformIdByName(content, object_name);
  if (childTransformId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }

  // Read the child's current m_Father
  const blocks = content.split(/(?=--- !u!)/);
  const childTransformPattern = new RegExp(`^--- !u!4 &${childTransformId}\\b`);
  let oldParentTransformId = 0;

  for (const block of blocks) {
    if (childTransformPattern.test(block)) {
      const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
      if (fatherMatch) {
        oldParentTransformId = parseInt(fatherMatch[1], 10);
      }
      break;
    }
  }

  // Resolve new parent
  let newParentTransformId = 0;
  if (new_parent.toLowerCase() !== 'root') {
    const foundId = findTransformIdByName(content, new_parent);
    if (foundId === null) {
      return { success: false, file_path, error: `New parent GameObject "${new_parent}" not found` };
    }
    newParentTransformId = foundId;

    // Prevent self-parenting
    if (newParentTransformId === childTransformId) {
      return { success: false, file_path, error: 'Cannot reparent a GameObject under itself' };
    }

    // Prevent circular parenting
    if (isAncestor(content, childTransformId, newParentTransformId)) {
      return { success: false, file_path, error: 'Cannot reparent: would create circular hierarchy' };
    }
  }

  // Remove from old parent's m_Children (if it had a parent)
  if (oldParentTransformId !== 0) {
    content = removeChildFromParent(content, oldParentTransformId, childTransformId);
  }

  // Update child's m_Father to new parent
  const fatherPattern = new RegExp(
    `(--- !u!4 &${childTransformId}\\b[\\s\\S]*?m_Father:\\s*)\\{fileID:\\s*\\d+\\}`
  );
  content = content.replace(fatherPattern, `$1{fileID: ${newParentTransformId}}`);

  // Add to new parent's m_Children (if not reparenting to root)
  if (newParentTransformId !== 0) {
    content = addChildToParent(content, newParentTransformId, childTransformId);
  }

  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: 'Validation failed after reparent' };
  }

  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }

  return {
    success: true,
    file_path,
    child_transform_id: childTransformId,
    old_parent_transform_id: oldParentTransformId,
    new_parent_transform_id: newParentTransformId
  };
}

// ========== Phase 8: Create .meta File ==========

/**
 * Create a Unity .meta file for a script, using a generated GUID.
 * Will not overwrite existing .meta files.
 */
export function createMetaFile(options: CreateMetaFileOptions): CreateMetaFileResult {
  const { script_path } = options;
  const metaPath = script_path + '.meta';

  if (existsSync(metaPath)) {
    return {
      success: false,
      meta_path: metaPath,
      error: `.meta file already exists: ${metaPath}`
    };
  }

  const guid = generateGuid();

  const metaContent = `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(metaPath, metaContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      meta_path: metaPath,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return {
    success: true,
    meta_path: metaPath,
    guid
  };
}

// ========== Phase 9: Create Scene ==========

/**
 * Create a new Unity scene file with the 4 required global blocks.
 * Optionally includes default Main Camera and Directional Light.
 */
export function createScene(options: CreateSceneOptions): CreateSceneResult {
  const { output_path, include_defaults, scene_guid } = options;

  if (!output_path.endsWith('.unity')) {
    return {
      success: false,
      output_path,
      error: 'Output path must have .unity extension',
    };
  }

  const guid = scene_guid || generateGuid();

  let yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
  m_OcclusionCullingData: {fileID: 0}
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.133, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
  m_HaloStrength: 0.5
  m_FlareStrength: 1
  m_FlareFadeSpeed: 3
  m_HaloTexture: {fileID: 0}
  m_SpotCookie: {fileID: 10001, guid: 0000000000000000e000000000000000, type: 0}
  m_DefaultReflectionMode: 0
  m_DefaultReflectionResolution: 128
  m_ReflectionBounces: 1
  m_ReflectionIntensity: 1
  m_CustomReflection: {fileID: 0}
  m_Sun: {fileID: 0}
  m_IndirectSpecularColor: {r: 0.44657898, g: 0.4964133, b: 0.5748178, a: 1}
  m_UseRadianceAmbientProbe: 0
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 12
  m_GIWorkflowMode: 1
  m_GISettings:
    serializedVersion: 2
    m_BounceScale: 1
    m_IndirectOutputScale: 1
    m_AlbedoBoost: 1
    m_EnvironmentLightingMode: 0
    m_EnableBakedLightmaps: 1
    m_EnableRealtimeLightmaps: 0
  m_LightmapEditorSettings:
    serializedVersion: 12
    m_Resolution: 2
    m_BakeResolution: 40
    m_AtlasSize: 1024
    m_AO: 0
    m_AOMaxDistance: 1
    m_CompAOExponent: 1
    m_CompAOExponentDirect: 0
    m_ExtractAmbientOcclusion: 0
    m_Padding: 2
    m_LightmapParameters: {fileID: 0}
    m_LightmapsBakeMode: 1
    m_TextureCompression: 1
    m_FinalGather: 0
    m_FinalGatherFiltering: 1
    m_FinalGatherRayCount: 256
    m_ReflectionCompression: 2
    m_MixedBakeMode: 2
    m_BakeBackend: 1
    m_PVRSampling: 1
    m_PVRDirectSampleCount: 32
    m_PVRSampleCount: 512
    m_PVRBounces: 2
    m_PVREnvironmentSampleCount: 256
    m_PVREnvironmentReferencePointCount: 2048
    m_PVRFilteringMode: 1
    m_PVRDenoiserTypeDirect: 1
    m_PVRDenoiserTypeIndirect: 1
    m_PVRDenoiserTypeAO: 1
    m_PVRFilterTypeDirect: 0
    m_PVRFilterTypeIndirect: 0
    m_PVRFilterTypeAO: 0
    m_PVREnvironmentMIS: 1
    m_PVRCulling: 1
    m_PVRFilteringGaussRadiusDirect: 1
    m_PVRFilteringGaussRadiusIndirect: 5
    m_PVRFilteringGaussRadiusAO: 2
    m_PVRFilteringAtrousPositionSigmaDirect: 0.5
    m_PVRFilteringAtrousPositionSigmaIndirect: 2
    m_PVRFilteringAtrousPositionSigmaAO: 1
    m_ExportTrainingData: 0
    m_TrainingDataDestination: TrainingData
    m_LightProbeSampleCountMultiplier: 4
  m_LightingDataAsset: {fileID: 0}
  m_LightingSettings: {fileID: 0}
--- !u!196 &4
NavMeshSettings:
  serializedVersion: 2
  m_ObjectHideFlags: 0
  m_BuildSettings:
    serializedVersion: 3
    agentTypeID: 0
    agentRadius: 0.5
    agentHeight: 2
    agentSlope: 45
    agentClimb: 0.4
    ledgeDropHeight: 0
    maxJumpAcrossDistance: 0
    minRegionArea: 2
    manualCellSize: 0
    cellSize: 0.16666667
    manualTileSize: 0
    tileSize: 256
    buildHeightMesh: 0
    maxJobWorkers: 0
    preserveTilesOutsideBounds: 0
    debug:
      m_Flags: 0
  m_NavMeshData: {fileID: 0}
`;

  if (include_defaults) {
    // Add Main Camera: GameObject + Transform + Camera + AudioListener
    yaml += `--- !u!1 &519420028
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 519420032}
  - component: {fileID: 519420031}
  - component: {fileID: 519420029}
  m_Layer: 0
  m_Name: Main Camera
  m_TagString: MainCamera
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &519420032
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 1, z: -10}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!20 &519420031
Camera:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
  serializedVersion: 2
  m_ClearFlags: 1
  m_BackGroundColor: {r: 0.19215687, g: 0.3019608, b: 0.4745098, a: 0}
  m_projectionMatrixMode: 1
  m_GateFitMode: 2
  m_FOVAxisMode: 0
  m_Iso: 200
  m_ShutterSpeed: 0.005
  m_Aperture: 16
  m_FocusDistance: 10
  m_FocalLength: 50
  m_BladeCount: 5
  m_Curvature: {x: 2, y: 11}
  m_BarrelClipping: 0.25
  m_Anamorphism: 0
  m_SensorSize: {x: 36, y: 24}
  m_LensShift: {x: 0, y: 0}
  m_NormalizedViewPortRect:
    serializedVersion: 2
    x: 0
    y: 0
    width: 1
    height: 1
  near clip plane: 0.3
  far clip plane: 1000
  field of view: 60
  orthographic: 0
  orthographic size: 5
  m_Depth: -1
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingPath: -1
  m_TargetTexture: {fileID: 0}
  m_TargetDisplay: 0
  m_TargetEye: 3
  m_HDR: 1
  m_AllowMSAA: 1
  m_AllowDynamicResolution: 0
  m_ForceIntoRT: 0
  m_OcclusionCulling: 1
  m_StereoConvergence: 10
  m_StereoSeparation: 0.022
--- !u!81 &519420029
AudioListener:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
--- !u!1 &705507993
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 705507995}
  - component: {fileID: 705507994}
  m_Layer: 0
  m_Name: Directional Light
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &705507995
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  serializedVersion: 2
  m_LocalRotation: {x: 0.40821788, y: -0.23456968, z: 0.10938163, w: 0.8754261}
  m_LocalPosition: {x: 0, y: 3, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 50, y: -30, z: 0}
--- !u!108 &705507994
Light:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  m_Enabled: 1
  serializedVersion: 10
  m_Type: 1
  m_Shape: 0
  m_Color: {r: 1, g: 0.95686275, b: 0.8392157, a: 1}
  m_Intensity: 1
  m_Range: 10
  m_SpotAngle: 30
  m_InnerSpotAngle: 21.80208
  m_CookieSize: 10
  m_Shadows:
    m_Type: 2
    m_Resolution: -1
    m_CustomResolution: -1
    m_Strength: 1
    m_Bias: 0.05
    m_NormalBias: 0.4
    m_NearPlane: 0.2
    m_CullingMatrixOverride:
      e00: 1
      e01: 0
      e02: 0
      e03: 0
      e10: 0
      e11: 1
      e12: 0
      e13: 0
      e20: 0
      e21: 0
      e22: 1
      e23: 0
      e30: 0
      e31: 0
      e32: 0
      e33: 1
    m_UseCullingMatrixOverride: 0
  m_Cookie: {fileID: 0}
  m_DrawHalo: 0
  m_Flare: {fileID: 0}
  m_RenderMode: 0
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingLayerMask: 1
  m_Lightmapping: 4
  m_LightShadowCasterMode: 0
  m_AreaSize: {x: 1, y: 1}
  m_BounceIntensity: 1
  m_ColorTemperature: 6570
  m_UseColorTemperature: 0
  m_BoundingSphereOverride: {x: 0, y: 0, z: 0, w: 0}
  m_UseBoundingSphereOverride: 0
  m_UseViewFrustumForShadowCasterCull: 1
  m_ShadowRadius: 0
  m_ShadowAngle: 0
`;
  }

  // Write the scene file
  try {
    writeFileSync(output_path, yaml, 'utf-8');
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write scene file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Generate .meta file
  const metaContent = `fileFormatVersion: 2
guid: ${guid}
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  const metaPath = output_path + '.meta';
  try {
    writeFileSync(metaPath, metaContent, 'utf-8');
  } catch (err) {
    // Clean up scene file if meta write fails
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore */ }

    return {
      success: false,
      output_path,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    success: true,
    output_path,
    scene_guid: guid,
    meta_path: metaPath,
  };
}
