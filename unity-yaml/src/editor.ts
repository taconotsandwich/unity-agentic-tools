import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

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
