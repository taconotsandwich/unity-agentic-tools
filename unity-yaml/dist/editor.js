"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeUnityYAMLEdit = safeUnityYAMLEdit;
exports.editProperty = editProperty;
exports.validateUnityYAML = validateUnityYAML;
exports.batchEditProperties = batchEditProperties;
exports.getGameObjectBlock = getGameObjectBlock;
exports.replaceGameObjectBlock = replaceGameObjectBlock;
const fs_1 = require("fs");
/**
 * Safely edit a Unity YAML file property while preserving GUIDs, file IDs, comments, and formatting.
 */
function safeUnityYAMLEdit(filePath, objectName, propertyName, newValue) {
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const goPattern = new RegExp(`(--- !u!1 &(\\d+)\\s*\\nGameObject:\\s*.*?m_Name:\\s*${objectName}\\s*.*?(?=--- !u!1|$))`, 'gs');
    const goMatch = content.match(goPattern);
    if (!goMatch) {
        return {
            success: false,
            file_path: filePath,
            error: `GameObject "${objectName}" not found in file`
        };
    }
    const goBlock = goMatch[0];
    const propertyPattern = new RegExp(`(m_${propertyName}:\\s*)(\\S+)`, 'gs');
    const updatedBlock = goBlock.replace(propertyPattern, `$1${newValue}`);
    const finalBlock = updatedBlock === goBlock
        ? goBlock.replace(/(\s*)(?=--- !u!1|\n---)/, `$1  m_${propertyName}: ${newValue}\n`)
        : updatedBlock;
    const finalContent = content.replace(goPattern, finalBlock);
    return atomicWrite(filePath, finalContent);
}
/**
 * Edit a specific property in a Unity file with validation.
 */
function editProperty(options) {
    const result = safeUnityYAMLEdit(options.file_path, options.object_name, options.property, options.new_value);
    if (!result.success) {
        return result;
    }
    return result;
}
/**
 * Validate Unity YAML file integrity.
 */
function validateUnityYAML(content) {
    if (!content.startsWith('%YAML 1.1')) {
        console.error('Missing or invalid YAML header');
        return false;
    }
    const invalidGuids = content.match(/guid:\s*[a-f0-9]{1,31}\b/g);
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
function atomicWrite(filePath, content) {
    const tmpPath = `${filePath}.tmp`;
    try {
        (0, fs_1.writeFileSync)(tmpPath, content, 'utf-8');
        if ((0, fs_1.existsSync)(filePath)) {
            (0, fs_1.renameSync)(filePath, `${filePath}.bak`);
        }
        (0, fs_1.renameSync)(tmpPath, filePath);
        try {
            if ((0, fs_1.existsSync)(`${filePath}.bak`)) {
                const fs = require('fs');
                fs.unlinkSync(`${filePath}.bak`);
            }
        }
        catch {
            // Ignore cleanup errors
        }
        return {
            success: true,
            file_path: filePath,
            bytes_written: Buffer.byteLength(content, 'utf-8')
        };
    }
    catch (error) {
        if ((0, fs_1.existsSync)(`${filePath}.bak`)) {
            try {
                (0, fs_1.renameSync)(`${filePath}.bak`, filePath);
            }
            catch (restoreError) {
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
function batchEditProperties(filePath, edits) {
    let updatedContent = '';
    for (const edit of edits) {
        const result = safeUnityYAMLEdit(filePath, edit.object_name, edit.property, edit.new_value);
        if (!result.success) {
            return {
                success: false,
                file_path: filePath,
                error: `Failed to edit ${edit.object_name}.${edit.property}: ${result.error}`
            };
        }
        updatedContent = (0, fs_1.readFileSync)(filePath, 'utf-8');
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
function getGameObjectBlock(filePath, objectName) {
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const goPattern = new RegExp(`(--- !u!1 &(\\d+)\\s*GameObject:\\s*.*?m_Name:\\s*${objectName}\\s*.*?(?=--- !u!1|$))`, 'gs');
    const match = content.match(goPattern);
    return match ? match[0] : null;
}
/**
 * Replace entire GameObject block.
 */
function replaceGameObjectBlock(filePath, objectName, newBlockContent) {
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const goPattern = new RegExp(`(--- !u!1 &(\\d+)\\s*GameObject:\\s*.*?m_Name:\\s*${objectName}\\s*.*?(?=--- !u!1|$))`, 'gs');
    const goMatch = content.match(goPattern);
    if (!goMatch) {
        return {
            success: false,
            file_path: filePath,
            error: `GameObject "${objectName}" not found in file`
        };
    }
    const finalContent = content.replace(goPattern, newBlockContent);
    if (!validateUnityYAML(newBlockContent)) {
        return {
            success: false,
            file_path: filePath,
            error: 'New GameObject block is invalid'
        };
    }
    return atomicWrite(filePath, finalContent);
}
//# sourceMappingURL=editor.js.map