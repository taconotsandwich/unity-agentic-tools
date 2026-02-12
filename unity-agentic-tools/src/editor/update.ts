import { existsSync } from 'fs';
import type {
    EditResult, PropertyEditOptions,
    EditTransformOptions, Vector3, Quaternion, PropertyEdit,
    EditComponentByFileIdOptions, EditComponentResult,
    EditPrefabOverrideOptions, EditPrefabOverrideResult,
    ReparentGameObjectOptions, ReparentGameObjectResult,
    TagManagerData,
    ArrayEditOptions, ArrayEditResult, ComponentPropertyEdit,
    RemovePrefabOverrideOptions, RemovePrefabOverrideResult,
    PrefabSubArrayOptions, PrefabSubArrayResult,
} from '../types';
import { validate_file_path } from '../utils';
import { read_settings } from '../settings';
import { UnityDocument } from './unity-document';
import { UnityBlock } from './unity-block';

// ========== Private Helpers ==========

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
 * Validate that new_value is type-compatible with the current value.
 * Returns an error message string if invalid, or null if valid.
 */
function validate_value_type(current_value: string, new_value: string): string | null {
    const current = current_value.trim();
    const incoming = new_value.trim();

    // 1. Reference: current is {fileID:...} -> new must also be {fileID:...}
    if (/^\{fileID:/.test(current)) {
        if (!/^\{fileID:/.test(incoming)) {
            return `Expected a reference value ({fileID: ...}), got "${incoming}"`;
        }
        return null;
    }

    // 2. Compound: current is an inline object like {x: 0, y: 1} -> validate struct
    if (/^\{.+:.+\}$/.test(current)) {
        if (!incoming.startsWith('{') || !incoming.endsWith('}')) {
            return `Expected a compound value (e.g. {x: ..., y: ...}), got "${incoming}"`;
        }
        // Validate that field values inside the struct are numeric (or fileID references)
        const inner = incoming.slice(1, -1).trim();
        if (inner.length > 0) {
            const fields = inner.split(',');
            for (const field of fields) {
                const kv = field.split(':');
                if (kv.length < 2) {
                    return `Malformed struct field in "${incoming}" — expected "key: value" pairs`;
                }
                const val = kv.slice(1).join(':').trim();
                // Allow fileID references and numeric values (int, float, scientific notation)
                if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(val) && !/^\{fileID:/.test(val)) {
                    return `Non-numeric value "${val}" in struct "${incoming}" — expected numeric or {fileID: N}`;
                }
            }
        }
        return null;
    }

    // 3. Array: current is an array (inline [] or multiline "  - ...") -> reject non-array
    if (/^\[/.test(current) || /^\n?\s*-\s/.test(current)) {
        if (!incoming.startsWith('[') && incoming !== '[]') {
            return `Expected an array value (e.g. [] or [...]), got "${incoming}"`;
        }
        return null;
    }

    // 4. Numeric: current is a number -> new must also be numeric
    if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(current)) {
        if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(incoming)) {
            return `Expected numeric value, got "${incoming}"`;
        }
        return null;
    }

    // 5. String/other: accept anything
    return null;
}


/**
 * Check if candidateAncestorTransformId is an ancestor of childTransformId
 * by walking up the m_Father chain. Prevents circular parenting.
 */
function isAncestor(doc: UnityDocument, childTransformId: string, candidateAncestorTransformId: string): boolean {
  // Walk up from candidateAncestorTransformId's m_Father chain.
  // If we ever reach childTransformId, it means childTransformId is an
  // ancestor of candidateAncestorTransformId -- making the reparent circular.

  let currentId = candidateAncestorTransformId;
  const visited = new Set<string>();

  while (currentId !== '0') {
    if (currentId === childTransformId) return true;
    if (visited.has(currentId)) return false; // already a cycle, bail
    visited.add(currentId);

    // Find this Transform block and read its m_Father
    const block = doc.find_by_file_id(currentId);
    if (!block || block.class_id !== 4) break;

    const fatherMatch = block.raw.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
    currentId = fatherMatch ? fatherMatch[1] : '0';
  }

  return false;
}

/**
 * Resolve a GameObject fileID to its Transform fileID.
 * Finds the GameObject block (!u!1), extracts the first component reference (the Transform).
 */
function resolveTransformByGameObjectId(doc: UnityDocument, gameObjectFileId: string): { id: string } | { error: string } {
  const found = doc.find_by_file_id(gameObjectFileId);
  if (!found || found.class_id !== 1) {
    return { error: `GameObject with fileID ${gameObjectFileId} not found` };
  }

  // Extract first component ref from m_Component -- in Unity, the Transform is always first
  const componentMatch = found.raw.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
  if (!componentMatch) {
    return { error: `GameObject fileID ${gameObjectFileId} has no Transform component` };
  }

  const transformId = componentMatch[1];

  // Verify it's actually a Transform (!u!4) or RectTransform (!u!224)
  const transformBlock = doc.find_by_file_id(transformId);
  if (!transformBlock || (transformBlock.class_id !== 4 && transformBlock.class_id !== 224)) {
    return { error: `First component of GameObject fileID ${gameObjectFileId} is not a Transform` };
  }

  return { id: transformId };
}

// ========== Exported Functions ==========

/**
 * Safely edit a Unity YAML file property while preserving GUIDs, file IDs, comments, and formatting.
 */
export function safeUnityYAMLEdit(
  filePath: string,
  objectName: string,
  propertyName: string,
  newValue: string,
  projectPath?: string
): EditResult {
  // Check if file exists first
  if (!existsSync(filePath)) {
    return {
      success: false,
      file_path: filePath,
      error: `File not found: ${filePath}`
    };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(filePath);
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

  // Validate property name against known GO properties
  const VALID_GO_PROPERTIES = new Set([
    'Name', 'TagString', 'IsActive', 'Layer',
    'StaticEditorFlags', 'Icon', 'NavMeshLayer',
  ]);
  if (!VALID_GO_PROPERTIES.has(normalizedProperty)) {
    const validList = [...VALID_GO_PROPERTIES].map(p => `m_${p}`).join(', ');
    return {
      success: false,
      file_path: filePath,
      error: `Unknown GameObject property "m_${normalizedProperty}". Valid properties: ${validList}`
    };
  }

  // Validate value types for known properties (Bug #11)
  const BUILTIN_TAGS = ['Untagged', 'Respawn', 'Finish', 'EditorOnly', 'MainCamera', 'Player', 'GameController'];
  const GO_PROP_VALIDATORS: Record<string, (v: string) => string | null> = {
    'IsActive': v => (v === '0' || v === '1' || v === 'true' || v === 'false') ? null : 'must be 0, 1, true, or false',
    'Layer': v => (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 31) ? null : 'must be an integer 0-31',
    'StaticEditorFlags': v => /^\d+$/.test(v) ? null : 'must be a non-negative integer',
    'TagString': v => {
      if (BUILTIN_TAGS.includes(v)) return null;
      if (projectPath) {
        try {
          const settings = read_settings({ project_path: projectPath, setting: 'tags' });
          const tags = (settings?.data as TagManagerData)?.tags || [];
          if (tags.includes(v)) return null;
          return `tag "${v}" not found in project TagManager. Valid tags: ${[...BUILTIN_TAGS, ...tags].join(', ')}`;
        } catch { /* can't validate -- allow */ }
      }
      return null;  // No project_path = skip custom tag validation
    },
  };
  const validator = GO_PROP_VALIDATORS[normalizedProperty];
  if (validator) {
    const error = validator(newValue);
    if (error) {
      return {
        success: false,
        file_path: filePath,
        error: `Invalid value "${newValue}" for m_${normalizedProperty}: ${error}`
      };
    }
  }

  // Normalize boolean values for Unity YAML
  if (normalizedProperty === 'IsActive') {
    if (newValue === 'true') newValue = '1';
    else if (newValue === 'false') newValue = '0';
  }

  // Find target GameObject block
  let targetBlock: UnityBlock | null = null;

  // If objectName is all digits, look up by fileID directly
  if (/^\d+$/.test(objectName)) {
    targetBlock = doc.find_by_file_id(objectName);
    if (!targetBlock) {
      return {
        success: false,
        file_path: filePath,
        error: `GameObject with fileID ${objectName} not found`
      };
    }
    if (targetBlock.class_id !== 1) {
      return {
        success: false,
        file_path: filePath,
        error: `fileID ${objectName} is not a GameObject (class ${targetBlock.class_id})`
      };
    }
  } else {
    // Find by name
    const matches = doc.find_game_objects_by_name(objectName);

    if (matches.length === 0) {
      return {
        success: false,
        file_path: filePath,
        error: `GameObject "${objectName}" not found in file`
      };
    }

    if (matches.length > 1) {
      const matchedIds = matches.map(b => b.file_id).join(', ');
      return {
        success: false,
        file_path: filePath,
        error: `Multiple GameObjects named "${objectName}" found (fileIDs: ${matchedIds}). Use numeric fileID to specify which one.`
      };
    }

    targetBlock = matches[0];
  }

  // Edit the property using simple regex replacement (preserves existing formatting)
  const propertyPattern = new RegExp(
    `(^\\s*m_${normalizedProperty}:\\s*)([^\\n]*)`,
    'm'
  );

  let updatedRaw = targetBlock.raw;
  if (propertyPattern.test(updatedRaw)) {
    // Replace existing property
    updatedRaw = updatedRaw.replace(propertyPattern, `$1${newValue}`);
  } else {
    // Property doesn't exist, add it before the next block marker or at the end
    updatedRaw = updatedRaw.replace(
      /(\n)(--- !u!|$)/,
      `\n  m_${normalizedProperty}: ${newValue}$1$2`
    );
  }

  targetBlock.replace_raw(updatedRaw);

  const saveResult = doc.save();
  return {
    ...saveResult,
    file_path: filePath,
  };
}

/**
 * Edit a specific property in a Unity file with validation.
 */
export function editProperty(options: PropertyEditOptions): EditResult {
  // Validate file path security
  const pathError = validate_file_path(options.file_path, 'write');
  if (pathError) {
    return { success: false, file_path: options.file_path, error: pathError };
  }

  const result = safeUnityYAMLEdit(
    options.file_path,
    options.object_name,
    options.property,
    options.new_value,
    options.project_path
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

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Compute two property name variants:
  // - exactProperty: the user's original input (may or may not have m_ prefix)
  // - prefixedProperty: with m_ prepended to the root segment
  // We try exactProperty first (handles custom MonoBehaviour fields), then prefixedProperty.
  const exactProperty = property;
  let prefixedProperty: string;
  if (property.includes('.') || property.includes('Array')) {
    const rootSegment = property.split('.')[0];
    prefixedProperty = rootSegment.startsWith('m_') ? property : 'm_' + property;
  } else {
    prefixedProperty = property.startsWith('m_') ? property : 'm_' + property;
  }

  // Find the block with this file ID (any class type)
  const targetBlock = doc.find_by_file_id(file_id);

  if (!targetBlock) {
    // If this file contains PrefabInstance blocks, hint that the fileID may be from the source prefab
    const hasPrefabInstance = doc.find_by_class_id(1001).length > 0;
    if (hasPrefabInstance) {
      return {
        success: false,
        file_path,
        error: `Component with file ID ${file_id} not found. This file contains prefab instances — the fileID may be from the source prefab. Use \`update override\` to edit variant properties.`
      };
    }
    return {
      success: false,
      file_path,
      error: `Component with file ID ${file_id} not found`
    };
  }

  // Check if this is a stripped block (prefab variant reference -- no editable properties)
  if (targetBlock.is_stripped) {
    return {
      success: false,
      file_path,
      error: `Component ${file_id} is a stripped reference in a prefab variant. Use \`update override <file> <prefab_instance_id> <property_path> <value>\` to modify overrides.`
    };
  }

  const classId = targetBlock.class_id;

  // Validate same-file fileID references (no guid = same file). Allow {fileID: 0} (null ref).
  const sameFileRefMatch = new_value.match(/^\{fileID:\s*(\d+)\}$/);
  if (sameFileRefMatch) {
    const refId = sameFileRefMatch[1];
    if (refId !== '0' && !doc.find_by_file_id(refId)) {
      return {
        success: false,
        file_path,
        error: `fileID ${refId} does not exist in this file`
      };
    }
  }

  // Type-validate the new value against the current value
  // Try exact name first (custom MonoBehaviour fields), then m_-prefixed (built-in Unity fields)
  const currentValue = targetBlock.get_property(exactProperty)
    ?? (exactProperty !== prefixedProperty ? targetBlock.get_property(prefixedProperty) : null);
  if (currentValue !== null) {
    const typeError = validate_value_type(currentValue, new_value);
    if (typeError) {
      return {
        success: false,
        file_path,
        error: typeError
      };
    }
  }

  // Try exact property name first (handles custom MonoBehaviour fields like "DirectNested.RawValue")
  let modified = targetBlock.set_property(exactProperty, new_value, '{fileID: 0}');

  // Fall back to m_-prefixed name (handles built-in Unity fields like "m_LocalPosition.x")
  if (!modified && exactProperty !== prefixedProperty) {
    modified = targetBlock.set_property(prefixedProperty, new_value, '{fileID: 0}');
  }

  // If still unchanged, either property doesn't exist or value is already set
  if (!modified) {
    // If we found a current value earlier, the property exists -- this is a no-op (value already matches)
    if (currentValue !== null) {
      return {
        success: true,
        file_path,
        file_id,
        class_id: classId,
        bytes_written: 0
      };
    }
    return {
      success: false,
      file_path,
      error: `Property "${property}" not found in component ${file_id} (class ${classId}). Unity only serializes properties that differ from defaults — newly created or unmodified components may not have this property in YAML yet. Use 'read gameobject --properties' to see available properties, or set the property in the Unity Editor first to make it serializable.`
    };
  }

  const saveResult = doc.save();

  if (!saveResult.success) {
    return {
      success: false,
      file_path,
      error: saveResult.error
    };
  }

  return {
    success: true,
    file_path,
    file_id,
    class_id: classId,
    bytes_written: saveResult.bytes_written
  };
}

/**
 * Edit or add a property override in a PrefabInstance's m_Modifications list.
 */
export function editPrefabOverride(options: EditPrefabOverrideOptions): EditPrefabOverrideResult {
    const { file_path, prefab_instance, property_path, new_value, object_reference, target } = options;
    const objRef = object_reference ?? '{fileID: 0}';

    if (!existsSync(file_path)) {
        return { success: false, file_path, error: `File not found: ${file_path}` };
    }

    let doc: UnityDocument;
    try {
        doc = UnityDocument.from_file(file_path);
    } catch (err) {
        return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Find the PrefabInstance block (class 1001)
    const targetBlock = doc.find_by_file_id(prefab_instance);
    if (!targetBlock || targetBlock.class_id !== 1001) {
        return { success: false, file_path, error: `PrefabInstance with fileID ${prefab_instance} not found` };
    }

    // Find existing modification entry by propertyPath
    const escapedPath = property_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryPattern = new RegExp(
        `(- target:\\s*\\{[^}]+\\}\\s*\\n\\s*propertyPath:\\s*)${escapedPath}(\\s*\\n\\s*value:\\s*)(.*)(\\s*\\n\\s*objectReference:\\s*)(.*)`,
        'm'
    );
    const entryMatch = targetBlock.raw.match(entryPattern);

    if (entryMatch) {
        // Update existing entry
        const updatedText = targetBlock.raw.replace(entryPattern,
            `$1${property_path}$2${new_value}$4${objRef}`
        );

        targetBlock.replace_raw(updatedText);

        const saveResult = doc.save();
        if (!saveResult.success) {
            return { success: false, file_path, error: saveResult.error };
        }

        return {
            success: true,
            file_path,
            prefab_instance_id: prefab_instance,
            property_path,
            action: 'updated',
        };
    }

    // No existing entry -- need to add a new one
    // Determine the target reference
    let targetRef = target;
    if (!targetRef) {
        // Try to infer from sibling properties sharing same root path
        const rootProp = property_path.split('.')[0];
        const siblingPattern = new RegExp(
            `- target:\\s*(\\{[^}]+\\})\\s*\\n\\s*propertyPath:\\s*${rootProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'm'
        );
        const siblingMatch = targetBlock.raw.match(siblingPattern);
        if (siblingMatch) {
            targetRef = siblingMatch[1];
        }
    }

    if (!targetRef) {
        return {
            success: false,
            file_path,
            error: `Cannot infer target for new override "${property_path}". Provide --target (e.g., "{fileID: 400000, guid: ..., type: 3}").`
        };
    }

    // Build the new modification entry
    const newEntry = `    - target: ${targetRef}\n      propertyPath: ${property_path}\n      value: ${new_value}\n      objectReference: ${objRef}`;

    // Insert before m_RemovedComponents (end of modifications list)
    const removedPattern = /(\n\s*m_RemovedComponents:)/m;
    const removedMatch = targetBlock.raw.match(removedPattern);

    let updatedText: string;
    if (removedMatch) {
        updatedText = targetBlock.raw.replace(removedPattern, `\n${newEntry}$1`);
    } else {
        // Fallback: insert after the last modification entry
        // Find the last objectReference line in m_Modifications
        const lines = targetBlock.raw.split('\n');
        let lastObjRefIdx = -1;
        let inModifications = false;
        for (let i = 0; i < lines.length; i++) {
            if (/m_Modifications:/.test(lines[i])) {
                inModifications = true;
                continue;
            }
            if (inModifications && /^\s*objectReference:/.test(lines[i])) {
                lastObjRefIdx = i;
            }
            if (inModifications && /^\s*m_\w+:/.test(lines[i]) && !/objectReference/.test(lines[i]) && !/propertyPath/.test(lines[i])) {
                if (lastObjRefIdx !== -1) break;
            }
        }

        if (lastObjRefIdx !== -1) {
            lines.splice(lastObjRefIdx + 1, 0, newEntry);
            updatedText = lines.join('\n');
        } else {
            return { success: false, file_path, error: 'Could not find insertion point in m_Modifications' };
        }
    }

    targetBlock.replace_raw(updatedText);

    const saveResult = doc.save();
    if (!saveResult.success) {
        return { success: false, file_path, error: saveResult.error };
    }

    return {
        success: true,
        file_path,
        prefab_instance_id: prefab_instance,
        property_path,
        action: 'added',
    };
}

/**
 * Edit Transform component properties by fileID.
 */
export function editTransform(options: EditTransformOptions): EditResult {
  const { file_path, transform_id, position, rotation, scale } = options;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Find the Transform block by fileID (class ID 4)
  const targetBlock = doc.find_by_file_id(String(transform_id));

  if (!targetBlock || targetBlock.class_id !== 4) {
    return {
      success: false,
      file_path,
      error: `Transform with fileID ${transform_id} not found`
    };
  }

  let blockText = targetBlock.raw;

  // Update position if provided
  if (position) {
    blockText = blockText.replace(
      /m_LocalPosition:\s*\{[^}]+\}/,
      `m_LocalPosition: {x: ${position.x}, y: ${position.y}, z: ${position.z}}`
    );
  }

  // Update rotation if provided (convert Euler to quaternion)
  if (rotation) {
    const quat = eulerToQuaternion(rotation);
    blockText = blockText.replace(
      /m_LocalRotation:\s*\{[^}]+\}/,
      `m_LocalRotation: {x: ${quat.x}, y: ${quat.y}, z: ${quat.z}, w: ${quat.w}}`
    );
    // Also update the Euler hint
    blockText = blockText.replace(
      /m_LocalEulerAnglesHint:\s*\{[^}]+\}/,
      `m_LocalEulerAnglesHint: {x: ${rotation.x}, y: ${rotation.y}, z: ${rotation.z}}`
    );
  }

  // Update scale if provided
  if (scale) {
    blockText = blockText.replace(
      /m_LocalScale:\s*\{[^}]+\}/,
      `m_LocalScale: {x: ${scale.x}, y: ${scale.y}, z: ${scale.z}}`
    );
  }

  targetBlock.replace_raw(blockText);

  const saveResult = doc.save();
  return {
    ...saveResult,
    file_path,
  };
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

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(filePath);
  } catch (err) {
    return {
      success: false,
      file_path: filePath,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Group edits by object_name to find each block only once
  const editsByObject = new Map<string, PropertyEdit[]>();
  for (const edit of edits) {
    const existing = editsByObject.get(edit.object_name) || [];
    existing.push(edit);
    editsByObject.set(edit.object_name, existing);
  }

  // Apply all edits in memory
  for (const [objectName, objectEdits] of editsByObject) {
    const matches = doc.find_game_objects_by_name(objectName);

    if (matches.length === 0) {
      return {
        success: false,
        file_path: filePath,
        error: `Failed to edit ${objectName}.${objectEdits[0].property}: GameObject "${objectName}" not found in file`
      };
    }

    // Take first match (consistent with old behavior)
    const targetBlock = matches[0];

    // Apply each property edit to this block
    for (const edit of objectEdits) {
      const normalizedProperty = edit.property.startsWith('m_')
        ? edit.property.slice(2)
        : edit.property;

      const propertyPattern = new RegExp(
        `(^\\s*m_${normalizedProperty}:\\s*)([^\\n]*)`,
        'm'
      );

      let updatedRaw = targetBlock.raw;
      if (propertyPattern.test(updatedRaw)) {
        updatedRaw = updatedRaw.replace(
          propertyPattern,
          `$1${edit.new_value}`
        );
      } else {
        updatedRaw = updatedRaw.replace(
          /(\n)(--- !u!|$)/,
          `\n  m_${normalizedProperty}: ${edit.new_value}$1$2`
        );
      }
      targetBlock.replace_raw(updatedRaw);
    }
  }

  if (!doc.validate()) {
    return {
      success: false,
      file_path: filePath,
      error: 'Validation failed after batch edit'
    };
  }

  const saveResult = doc.save();
  return {
    ...saveResult,
    file_path: filePath,
  };
}

/**
 * Get raw GameObject block as string.
 */
export function getGameObjectBlock(filePath: string, objectName: string): string | null {
  const doc = UnityDocument.from_file(filePath);

  const matches = doc.find_game_objects_by_name(objectName);
  if (matches.length === 0) {
    return null;
  }

  // Return first match (consistent with old behavior)
  return matches[0].raw;
}

/**
 * Replace entire GameObject block.
 */
export function replaceGameObjectBlock(
  filePath: string,
  objectName: string,
  newBlockContent: string
): EditResult {
  const doc = UnityDocument.from_file(filePath);

  const matches = doc.find_game_objects_by_name(objectName);

  if (matches.length === 0) {
    return {
      success: false,
      file_path: filePath,
      error: `GameObject "${objectName}" not found in file`
    };
  }

  // Validate the new block content by trying to parse it
  try {
    const testDoc = UnityDocument.from_string(newBlockContent);
    if (!testDoc.validate()) {
      return {
        success: false,
        file_path: filePath,
        error: 'New GameObject block is invalid'
      };
    }
  } catch (err) {
    return {
      success: false,
      file_path: filePath,
      error: `New GameObject block is invalid: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Replace first match (consistent with old behavior)
  const targetBlock = matches[0];
  targetBlock.replace_raw(newBlockContent);

  const saveResult = doc.save();
  return {
    ...saveResult,
    file_path: filePath,
  };
}

/**
 * Reparent a GameObject under a new parent (or to root).
 */
export function reparentGameObject(options: ReparentGameObjectOptions): ReparentGameObjectResult {
  const { file_path, object_name, new_parent, by_id } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find the child's Transform ID
  // Auto-detect numeric strings as fileIDs (consistent with update gameobject behavior)
  let childTransformId: string;
  if (by_id || /^\d+$/.test(object_name)) {
    if (isNaN(parseInt(object_name, 10))) {
      return { success: false, file_path, error: `Invalid fileID: "${object_name}" — expected a numeric value` };
    }
    const resolved = resolveTransformByGameObjectId(doc, object_name);
    if ('error' in resolved) {
      return { success: false, file_path, error: resolved.error };
    }
    childTransformId = resolved.id;
  } else {
    const childResult = doc.require_unique_transform(object_name);
    if ('error' in childResult) {
      return { success: false, file_path, error: childResult.error };
    }
    childTransformId = childResult.file_id;
  }

  // Read the child's current m_Father
  const childBlock = doc.find_by_file_id(childTransformId);
  if (!childBlock) {
    return { success: false, file_path, error: `Transform ${childTransformId} not found` };
  }

  const fatherMatch = childBlock.raw.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
  const oldParentTransformId = fatherMatch ? fatherMatch[1] : '0';

  // Resolve new parent
  // Auto-detect numeric strings as fileIDs (consistent with update gameobject behavior)
  let newParentTransformId = '0';
  if (new_parent.toLowerCase() !== 'root') {
    if (by_id || /^\d+$/.test(new_parent)) {
      if (isNaN(parseInt(new_parent, 10))) {
        return { success: false, file_path, error: `Invalid parent fileID: "${new_parent}" — expected a numeric value, or "root"` };
      }
      const resolved = resolveTransformByGameObjectId(doc, new_parent);
      if ('error' in resolved) {
        return { success: false, file_path, error: `Parent not found: ${resolved.error}` };
      }
      newParentTransformId = resolved.id;
    } else {
      const parentResult = doc.require_unique_transform(new_parent);
      if ('error' in parentResult) {
        return { success: false, file_path, error: `Parent not found: ${parentResult.error}` };
      }
      newParentTransformId = parentResult.file_id;
    }

    // Prevent self-parenting
    if (newParentTransformId === childTransformId) {
      return { success: false, file_path, error: 'Cannot reparent a GameObject under itself' };
    }

    // Prevent circular parenting
    if (isAncestor(doc, childTransformId, newParentTransformId)) {
      return { success: false, file_path, error: 'Cannot reparent: would create circular hierarchy' };
    }
  }

  // Remove from old parent's m_Children (if it had a parent)
  if (oldParentTransformId !== '0') {
    doc.remove_child_from_parent(oldParentTransformId, childTransformId);
  }

  // Update child's m_Father to new parent
  const fatherPattern = new RegExp(
    `(m_Father:\\s*)\\{fileID:\\s*\\d+\\}`
  );
  let updatedChildRaw = childBlock.raw.replace(fatherPattern, `$1{fileID: ${newParentTransformId}}`);
  childBlock.replace_raw(updatedChildRaw);

  // Calculate and update m_RootOrder for the reparented Transform
  {
    let newRootOrder: number;
    if (newParentTransformId === '0') {
      // Moving to root: count root transforms, subtract 1 because our m_Father is already set to 0
      newRootOrder = doc.calculate_root_order('0') - 1;
    } else {
      // Moving under a parent: count existing children (before we add ourselves)
      newRootOrder = doc.calculate_root_order(newParentTransformId);
    }
    childBlock.set_property('m_RootOrder', String(newRootOrder));
  }

  // Add to new parent's m_Children (if not reparenting to root)
  if (newParentTransformId !== '0') {
    doc.add_child_to_parent(newParentTransformId, childTransformId);
  }

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after reparent' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    child_transform_id: parseInt(childTransformId, 10),
    old_parent_transform_id: parseInt(oldParentTransformId, 10),
    new_parent_transform_id: parseInt(newParentTransformId, 10)
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
 * Edit an array in a Unity component (insert, append, or remove elements).
 */
export function editArray(options: ArrayEditOptions): ArrayEditResult {
  const { file_path, file_id, array_property, action, value, index } = options;

  // Validate file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  // Load doc from file
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Find block by file_id
  const targetBlock = doc.find_by_file_id(file_id);
  if (!targetBlock) {
    return {
      success: false,
      file_path,
      error: `Component with file ID ${file_id} not found`
    };
  }

  // Based on action:
  try {
    if (action === 'insert') {
      if (value === undefined) {
        return { success: false, file_path, error: 'value is required for insert action' };
      }
      targetBlock.insert_array_element(array_property, index ?? 0, value);
    } else if (action === 'append') {
      if (value === undefined) {
        return { success: false, file_path, error: 'value is required for append action' };
      }
      targetBlock.insert_array_element(array_property, -1, value);
    } else if (action === 'remove') {
      targetBlock.remove_array_element(array_property, index ?? 0);
    } else {
      return { success: false, file_path, error: `Invalid action "${action}". Must be insert, append, or remove.` };
    }
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to ${action} array element: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Get new length
  const new_length = targetBlock.get_array_length(array_property);

  // Validate and save
  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after array edit' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    file_id,
    array_property,
    action,
    new_length
  };
}

/**
 * Batch edit component properties by fileID (like batchEditProperties but for components).
 */
export function batchEditComponentProperties(
  filePath: string,
  edits: ComponentPropertyEdit[]
): EditResult {
  if (!existsSync(filePath)) {
    return {
      success: false,
      file_path: filePath,
      error: `File not found: ${filePath}`
    };
  }

  // Load doc from file (single load)
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(filePath);
  } catch (err) {
    return {
      success: false,
      file_path: filePath,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // For each edit: find block by file_id, call block.set_property(property, new_value)
  for (const edit of edits) {
    const targetBlock = doc.find_by_file_id(edit.file_id);
    if (!targetBlock) {
      return {
        success: false,
        file_path: filePath,
        error: `Component with file ID ${edit.file_id} not found`
      };
    }

    // Normalize property name
    const normalizedProperty = edit.property.startsWith('m_') ? edit.property : 'm_' + edit.property;

    // Try to set the property
    const modified = targetBlock.set_property(normalizedProperty, edit.new_value, '{fileID: 0}');
    if (!modified) {
      // Try without prefix
      const withoutPrefix = edit.property.startsWith('m_') ? edit.property.slice(2) : edit.property;
      const modified2 = targetBlock.set_property(withoutPrefix, edit.new_value, '{fileID: 0}');
      if (!modified2) {
        return {
          success: false,
          file_path: filePath,
          error: `Property "${edit.property}" not found in component ${edit.file_id}`
        };
      }
    }
  }

  // Validate and save (single save)
  if (!doc.validate()) {
    return {
      success: false,
      file_path: filePath,
      error: 'Validation failed after batch edit'
    };
  }

  const saveResult = doc.save();
  return {
    ...saveResult,
    file_path: filePath,
  };
}

/**
 * Remove a modification entry from PrefabInstance's m_Modifications list.
 */
export function removePrefabOverride(options: RemovePrefabOverrideOptions): RemovePrefabOverrideResult {
  const { file_path, prefab_instance, property_path, target } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  // Load doc from file
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PrefabInstance block by prefab_instance (try as fileID first, then as name)
  const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!targetBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // In the block's raw text, find the 4-line entry matching property_path (and optionally target)
  const escapedPath = property_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let entryPattern: RegExp;
  if (target) {
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    entryPattern = new RegExp(
      `    - target: ${escapedTarget}\\s*\\n      propertyPath: ${escapedPath}\\s*\\n      value: [^\\n]*\\s*\\n      objectReference: [^\\n]*\\n`,
      'm'
    );
  } else {
    entryPattern = new RegExp(
      `    - target: \\{[^}]+\\}\\s*\\n      propertyPath: ${escapedPath}\\s*\\n      value: [^\\n]*\\s*\\n      objectReference: [^\\n]*\\n`,
      'm'
    );
  }

  const entryMatch = targetBlock.raw.match(entryPattern);
  if (!entryMatch) {
    return {
      success: false,
      file_path,
      error: `Modification entry for property "${property_path}" not found${target ? ` with target ${target}` : ''}`
    };
  }

  // Remove those 4 lines from the raw text
  const updatedRaw = targetBlock.raw.replace(entryPattern, '');
  targetBlock.replace_raw(updatedRaw);

  // Validate and save
  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after removing override' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
    property_path,
  };
}

/**
 * Add a component reference to m_RemovedComponents array.
 */
export function addRemovedComponent(options: PrefabSubArrayOptions): PrefabSubArrayResult {
  const { file_path, prefab_instance, component_ref } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PI block
  const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!targetBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // If m_RemovedComponents: [], replace with multi-line format first
  let rawText = targetBlock.raw;
  if (/m_RemovedComponents:\s*\[\]/.test(rawText)) {
    rawText = rawText.replace(/m_RemovedComponents:\s*\[\]/, 'm_RemovedComponents:');
  }

  // Add component_ref to m_RemovedComponents array
  // Find the m_RemovedComponents section and append
  const removedPattern = /m_RemovedComponents:\s*\n/;
  if (removedPattern.test(rawText)) {
    rawText = rawText.replace(removedPattern, `m_RemovedComponents:\n  - ${component_ref}\n`);
  } else {
    return { success: false, file_path, error: 'm_RemovedComponents property not found in PrefabInstance' };
  }

  targetBlock.replace_raw(rawText);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after adding removed component' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
  };
}

/**
 * Remove a component reference from m_RemovedComponents array.
 */
export function removeRemovedComponent(options: PrefabSubArrayOptions): PrefabSubArrayResult {
  const { file_path, prefab_instance, component_ref } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PI block
  const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!targetBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // Remove component_ref from m_RemovedComponents array
  const escapedRef = component_ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refPattern = new RegExp(`\\s*- ${escapedRef}\\n?`, 'm');

  if (!refPattern.test(targetBlock.raw)) {
    return { success: false, file_path, error: `Component reference "${component_ref}" not found in m_RemovedComponents` };
  }

  const updatedRaw = targetBlock.raw.replace(refPattern, '');
  targetBlock.replace_raw(updatedRaw);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after removing component' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
  };
}

/**
 * Add a GameObject reference to m_RemovedGameObjects array.
 */
export function addRemovedGameObject(options: PrefabSubArrayOptions): PrefabSubArrayResult {
  const { file_path, prefab_instance, component_ref } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PI block
  const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!targetBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // If m_RemovedGameObjects: [], replace with multi-line format first
  let rawText = targetBlock.raw;
  if (/m_RemovedGameObjects:\s*\[\]/.test(rawText)) {
    rawText = rawText.replace(/m_RemovedGameObjects:\s*\[\]/, 'm_RemovedGameObjects:');
  }

  // Add component_ref to m_RemovedGameObjects array
  const removedPattern = /m_RemovedGameObjects:\s*\n/;
  if (removedPattern.test(rawText)) {
    rawText = rawText.replace(removedPattern, `m_RemovedGameObjects:\n  - ${component_ref}\n`);
  } else {
    return { success: false, file_path, error: 'm_RemovedGameObjects property not found in PrefabInstance' };
  }

  targetBlock.replace_raw(rawText);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after adding removed GameObject' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
  };
}

/**
 * Remove a GameObject reference from m_RemovedGameObjects array.
 */
export function removeRemovedGameObject(options: PrefabSubArrayOptions): PrefabSubArrayResult {
  const { file_path, prefab_instance, component_ref } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find PI block
  const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
  if (!targetBlock) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }

  // Remove component_ref from m_RemovedGameObjects array
  const escapedRef = component_ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refPattern = new RegExp(`\\s*- ${escapedRef}\\n?`, 'm');

  if (!refPattern.test(targetBlock.raw)) {
    return { success: false, file_path, error: `GameObject reference "${component_ref}" not found in m_RemovedGameObjects` };
  }

  const updatedRaw = targetBlock.raw.replace(refPattern, '');
  targetBlock.replace_raw(updatedRaw);

  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after removing GameObject' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
  };
}
