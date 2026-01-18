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
export declare function safeUnityYAMLEdit(filePath: string, objectName: string, propertyName: string, newValue: string): EditResult;
/**
 * Edit a specific property in a Unity file with validation.
 */
export declare function editProperty(options: PropertyEditOptions): EditResult;
/**
 * Validate Unity YAML file integrity.
 */
export declare function validateUnityYAML(content: string): boolean;
/**
 * Batch edit multiple properties in a single file for better performance.
 */
export declare function batchEditProperties(filePath: string, edits: Array<{
    object_name: string;
    property: string;
    new_value: string;
}>): EditResult;
/**
 * Get raw GameObject block as string.
 */
export declare function getGameObjectBlock(filePath: string, objectName: string): string | null;
/**
 * Replace entire GameObject block.
 */
export declare function replaceGameObjectBlock(filePath: string, objectName: string, newBlockContent: string): EditResult;
//# sourceMappingURL=editor.d.ts.map