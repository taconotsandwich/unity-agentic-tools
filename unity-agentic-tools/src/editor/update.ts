import { existsSync } from 'fs';
import { readFileSync } from 'fs';
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
    PrefabOverrideEdit, BatchPrefabOverrideResult,
    EditManagedReferenceOptions, EditManagedReferenceResult,
} from '../types';
import { validate_file_path } from '../utils';
import { read_settings } from '../settings';
import { UnityDocument } from './unity-document';
import { yaml_quote_if_needed } from './unity-block';
import { UnityBlock } from './unity-block';

// ========== Private Helpers ==========

/**
 * Auto-enrich an incomplete PPtr target reference by adding guid + type from m_SourcePrefab.
 * In prefab variants, all modification targets reference the source prefab,
 * so {fileID: N} can be completed to {fileID: N, guid: <source_guid>, type: 3}.
 * Returns the enriched ref, or null if source GUID can't be extracted.
 */
function enrich_target_ref(targetRef: string, blockRaw: string): string | null {
    if (/guid:/.test(targetRef)) return targetRef;
    const sourceMatch = blockRaw.match(/m_SourcePrefab:[ \t]*\{[^}]*guid:[ \t]*([a-f0-9]{32})/);
    if (!sourceMatch) return null;
    return targetRef.replace(/\}$/, `, guid: ${sourceMatch[1]}, type: 3}`);
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

    const fatherMatch = block.raw.match(/m_Father:\s*\{fileID:\s*(-?\d+)\}/);
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
  const componentMatch = found.raw.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(-?\d+)\}/);
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
  if (/^-?\d+$/.test(objectName)) {
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
    updatedRaw = updatedRaw.replace(propertyPattern, (_m: string, prefix: string) => prefix + newValue);
  } else {
    // Property doesn't exist, add it before the next block marker or at the end
    updatedRaw = updatedRaw.replace(
      /(\n)(--- !u!|$)/,
      (_m: string, g1: string, g2: string) => `\n  m_${normalizedProperty}: ${newValue}${g1}${g2}`
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
  const sameFileRefMatch = new_value.match(/^\{fileID:\s*(-?\d+)\}$/);
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

  // Type-validate the new value against the current value.
  // Track which name variant resolved so the write step uses the correct one.
  const exactValue = targetBlock.get_property(exactProperty);
  const resolvedProperty = exactValue !== null
    ? exactProperty
    : (exactProperty !== prefixedProperty && targetBlock.get_property(prefixedProperty) !== null
      ? prefixedProperty
      : null);
  const currentValue = exactValue
    ?? (resolvedProperty === prefixedProperty ? targetBlock.get_property(prefixedProperty) : null);
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

  // Write using the resolved name (avoids inserting duplicates when the property
  // exists under the m_-prefixed variant but the user supplied the unprefixed name).
  let modified: boolean;
  if (resolvedProperty) {
    modified = targetBlock.set_property(resolvedProperty, new_value, '{fileID: 0}');
  } else {
    // Property doesn't exist yet -- try exact first (custom fields), then prefixed
    modified = targetBlock.set_property(exactProperty, new_value, '{fileID: 0}');
    if (!modified && exactProperty !== prefixedProperty) {
      modified = targetBlock.set_property(prefixedProperty, new_value, '{fileID: 0}');
    }
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
        bytes_written: 0,
        no_change: true,
        message: 'Property already has the requested value'
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
    const { file_path, prefab_instance, new_value, object_reference, target, managed_reference } = options;
    // Auto-quote propertyPath containing brackets (Unity YAML requires single quotes)
    const property_path = /[\[\]]/.test(options.property_path) && !options.property_path.startsWith("'")
        ? `'${options.property_path}'`
        : options.property_path;
    // managed_reference: ID goes in value:, objectReference forced to {fileID: 0}
    const effectiveValue = managed_reference ?? new_value;
    const objRef = managed_reference ? '{fileID: 0}' : (object_reference ?? '{fileID: 0}');

    if (!existsSync(file_path)) {
        return { success: false, file_path, error: `File not found: ${file_path}` };
    }

    let doc: UnityDocument;
    try {
        doc = UnityDocument.from_file(file_path);
    } catch (err) {
        return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Find the PrefabInstance block (class 1001) — supports fileID or name
    const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
    if (!targetBlock) {
        return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
    }

    // Find existing modification entry by propertyPath (handle both quoted and unquoted)
    const unquotedPath = property_path.replace(/^'|'$/g, '');
    const quotedPath = `'${unquotedPath}'`;
    const escapedUnquoted = unquotedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedQuoted = quotedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pathAlternation = escapedUnquoted === escapedQuoted ? escapedUnquoted : `(?:${escapedQuoted}|${escapedUnquoted})`;
    const entryPattern = new RegExp(
        `(- target:\\s*\\{[^}]+\\}\\s*\\n\\s*propertyPath:\\s*)${pathAlternation}(\\s*\\n\\s*value:\\s*)(.*)(\\s*\\n\\s*objectReference:\\s*)(.*)`,
        'm'
    );
    const entryMatch = targetBlock.raw.match(entryPattern);

    if (entryMatch) {
        // Update existing entry (apply YAML quoting for string safety)
        const quotedValue = yaml_quote_if_needed(effectiveValue);
        const updatedText = targetBlock.raw.replace(entryPattern,
            (_m: string, g1: string, g2: string, _g3: string, g4: string) =>
                g1 + property_path + g2 + quotedValue + g4 + objRef
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

    // Validate target format: must be a Unity object reference like {fileID: N, ...}
    if (!/^\{fileID:\s*-?\d+/.test(targetRef)) {
        return {
            success: false,
            file_path,
            error: `Invalid target reference "${targetRef}". Expected format: {fileID: N, guid: ..., type: T}`
        };
    }

    // Auto-enrich incomplete target (add source prefab guid + type if missing)
    const enriched = enrich_target_ref(targetRef, targetBlock.raw);
    if (enriched) targetRef = enriched;

    // Build the new modification entry (apply YAML quoting for string safety)
    const quotedNewValue = yaml_quote_if_needed(effectiveValue);
    const newEntry = `    - target: ${targetRef}\n      propertyPath: ${property_path}\n      value: ${quotedNewValue}\n      objectReference: ${objRef}`;

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
 * Batch edit multiple property overrides in a PrefabInstance's m_Modifications list.
 * Loads the document once, applies all edits in-memory, and saves once.
 */
export function batchEditPrefabOverrides(
    file_path: string,
    prefab_instance: string,
    edits: PrefabOverrideEdit[],
): BatchPrefabOverrideResult {
    if (!existsSync(file_path)) {
        return { success: false, file_path, error: `File not found: ${file_path}` };
    }

    let doc: UnityDocument;
    try {
        doc = UnityDocument.from_file(file_path);
    } catch (err) {
        return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
    }

    const targetBlock = findPrefabInstanceBlock(doc, prefab_instance);
    if (!targetBlock) {
        return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
    }

    const actions: Array<{ property_path: string; action: 'updated' | 'added' }> = [];

    for (const edit of edits) {
        const { value, object_reference, target, managed_reference } = edit;
        // Auto-quote propertyPath containing brackets (Unity YAML requires single quotes)
        const property_path = /[\[\]]/.test(edit.property_path) && !edit.property_path.startsWith("'")
            ? `'${edit.property_path}'`
            : edit.property_path;
        // managed_reference: ID goes in value:, objectReference forced to {fileID: 0}
        const effectiveValue = managed_reference ?? value;
        const objRef = managed_reference ? '{fileID: 0}' : (object_reference ?? '{fileID: 0}');

        // Find existing modification entry by propertyPath (handle both quoted and unquoted)
        const unquotedPath = property_path.replace(/^'|'$/g, '');
        const quotedPathStr = `'${unquotedPath}'`;
        const batchEscapedUnquoted = unquotedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const batchEscapedQuoted = quotedPathStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const batchPathAlt = batchEscapedUnquoted === batchEscapedQuoted ? batchEscapedUnquoted : `(?:${batchEscapedQuoted}|${batchEscapedUnquoted})`;
        const entryPattern = new RegExp(
            `(- target:\\s*\\{[^}]+\\}\\s*\\n\\s*propertyPath:\\s*)${batchPathAlt}(\\s*\\n\\s*value:\\s*)(.*)(\\s*\\n\\s*objectReference:\\s*)(.*)`,
            'm'
        );
        const entryMatch = targetBlock.raw.match(entryPattern);

        if (entryMatch) {
            // Update existing entry
            const quotedValue = yaml_quote_if_needed(effectiveValue);
            const updatedText = targetBlock.raw.replace(entryPattern,
                (_m: string, g1: string, g2: string, _g3: string, g4: string) =>
                    g1 + property_path + g2 + quotedValue + g4 + objRef
            );
            targetBlock.replace_raw(updatedText);
            actions.push({ property_path, action: 'updated' });
        } else {
            // No existing entry -- add a new one
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
                    error: `Cannot infer target for new override "${property_path}". Provide "target" in the edit entry (e.g., "{fileID: 400000, guid: ..., type: 3}").`
                };
            }

            if (!/^\{fileID:\s*-?\d+/.test(targetRef)) {
                return {
                    success: false,
                    file_path,
                    error: `Invalid target reference "${targetRef}" for "${property_path}". Expected format: {fileID: N, guid: ..., type: T}`
                };
            }

            // Auto-enrich incomplete target (add source prefab guid + type if missing)
            const enriched = enrich_target_ref(targetRef, targetBlock.raw);
            if (enriched) targetRef = enriched;

            // Build the new modification entry
            const quotedNewValue = yaml_quote_if_needed(effectiveValue);
            const newEntry = `    - target: ${targetRef}\n      propertyPath: ${property_path}\n      value: ${quotedNewValue}\n      objectReference: ${objRef}`;

            // Insert before m_RemovedComponents (end of modifications list)
            const removedPattern = /(\n\s*m_RemovedComponents:)/m;
            const removedMatch = targetBlock.raw.match(removedPattern);

            let updatedText: string;
            if (removedMatch) {
                updatedText = targetBlock.raw.replace(removedPattern, `\n${newEntry}$1`);
            } else {
                // Fallback: insert after the last objectReference line in m_Modifications
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
                    return { success: false, file_path, error: `Could not find insertion point in m_Modifications for "${property_path}"` };
                }
            }

            targetBlock.replace_raw(updatedText);
            actions.push({ property_path, action: 'added' });
        }
    }

    const saveResult = doc.save();
    if (!saveResult.success) {
        return { success: false, file_path, error: saveResult.error };
    }

    return {
        success: true,
        file_path,
        prefab_instance_id: prefab_instance,
        applied: actions.length,
        actions,
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

  // Check if this is a stripped block (prefab variant reference -- no editable properties)
  if (targetBlock.is_stripped) {
    return {
      success: false,
      file_path,
      error: `Transform ${transform_id} is a stripped reference in a prefab variant. Use \`update prefab override <file> <prefab_instance_id> <property_path> <value>\` to modify transform overrides (e.g., "m_LocalPosition.x").`
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
          (_m: string, prefix: string) => prefix + edit.new_value
        );
      } else {
        updatedRaw = updatedRaw.replace(
          /(\n)(--- !u!|$)/,
          (_m: string, g1: string, g2: string) => `\n  m_${normalizedProperty}: ${edit.new_value}${g1}${g2}`
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
  if (by_id || /^-?\d+$/.test(object_name)) {
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

  const fatherMatch = childBlock.raw.match(/m_Father:\s*\{fileID:\s*(-?\d+)\}/);
  const oldParentTransformId = fatherMatch ? fatherMatch[1] : '0';

  // Resolve new parent
  // Auto-detect numeric strings as fileIDs (consistent with update gameobject behavior)
  let newParentTransformId = '0';
  if (new_parent.toLowerCase() !== 'root') {
    if (by_id || /^-?\d+$/.test(new_parent)) {
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
    child_transform_id: childTransformId,
    old_parent_transform_id: oldParentTransformId,
    new_parent_transform_id: newParentTransformId
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
      const ok = targetBlock.insert_array_element(array_property, index ?? 0, value);
      if (!ok) {
        const len = targetBlock.get_array_length(array_property);
        if (len < 0) {
          return { success: false, file_path, error: `Array property "${array_property}" not found in component ${file_id}` };
        }
        return { success: false, file_path, error: `Index ${index ?? 0} out of bounds for "${array_property}" (array length: ${len})` };
      }
    } else if (action === 'append') {
      if (value === undefined) {
        return { success: false, file_path, error: 'value is required for append action' };
      }
      const ok = targetBlock.insert_array_element(array_property, -1, value);
      if (!ok) {
        const len = targetBlock.get_array_length(array_property);
        if (len < 0) {
          return { success: false, file_path, error: `Array property "${array_property}" not found in component ${file_id}` };
        }
        return { success: false, file_path, error: `Failed to append to "${array_property}"` };
      }
    } else if (action === 'remove') {
      const ok = targetBlock.remove_array_element(array_property, index ?? 0);
      if (!ok) {
        const len = targetBlock.get_array_length(array_property);
        if (len < 0) {
          return { success: false, file_path, error: `Array property "${array_property}" not found in component ${file_id}` };
        }
        return { success: false, file_path, error: `Index ${index ?? 0} out of bounds for "${array_property}" (array length: ${len})` };
      }
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

  // For each edit: find block by file_id, resolve property name (matching editComponentByFileId logic)
  for (const edit of edits) {
    const targetBlock = doc.find_by_file_id(edit.file_id);
    if (!targetBlock) {
      return {
        success: false,
        file_path: filePath,
        error: `Component with file ID ${edit.file_id} not found`
      };
    }

    // Align property resolution with editComponentByFileId:
    // 1. exactProperty = user's original input
    // 2. prefixedProperty = with m_ prepended to root segment (handles dot-notation)
    const exactProperty = edit.property;
    let prefixedProperty: string;
    if (edit.property.includes('.') || edit.property.includes('Array')) {
      const rootSegment = edit.property.split('.')[0];
      prefixedProperty = rootSegment.startsWith('m_') ? edit.property : 'm_' + edit.property;
    } else {
      prefixedProperty = edit.property.startsWith('m_') ? edit.property : 'm_' + edit.property;
    }

    // Try exact property first (custom MonoBehaviour fields), then m_-prefixed (built-in Unity)
    let modified = targetBlock.set_property(exactProperty, edit.new_value, '{fileID: 0}');
    if (!modified && exactProperty !== prefixedProperty) {
      modified = targetBlock.set_property(prefixedProperty, edit.new_value, '{fileID: 0}');
    }
    if (!modified) {
      // Check if property exists but value already matches (no-op)
      const currentValue = targetBlock.get_property(exactProperty)
        ?? (exactProperty !== prefixedProperty ? targetBlock.get_property(prefixedProperty) : null);
      if (currentValue !== null) {
        continue; // Value already set, skip without error
      }
      return {
        success: false,
        file_path: filePath,
        error: `Property "${edit.property}" not found in component ${edit.file_id}`
      };
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

  // Build a regex to match the 4-line modification entry.
  // Use flexible whitespace (\s*) instead of hardcoded indentation.
  // When --target is provided, match by fileID rather than exact string,
  // because the YAML target may include guid and type fields beyond what
  // the user supplies (e.g., user gives {fileID: 123} but YAML has
  // {fileID: 123, guid: abc..., type: 3}).
  let entryPattern: RegExp;
  if (target) {
    const fileIdMatch = target.match(/fileID:\s*(-?\d+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      entryPattern = new RegExp(
        `[ \\t]*- target:\\s*\\{fileID:\\s*${fileId}[^}]*\\}\\s*\\n\\s*propertyPath:\\s*${escapedPath}\\s*\\n\\s*value:[^\\n]*\\n\\s*objectReference:[^\\n]*\\n?`,
        'm'
      );
    } else {
      const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      entryPattern = new RegExp(
        `[ \\t]*- target:\\s*${escapedTarget}\\s*\\n\\s*propertyPath:\\s*${escapedPath}\\s*\\n\\s*value:[^\\n]*\\n\\s*objectReference:[^\\n]*\\n?`,
        'm'
      );
    }
  } else {
    entryPattern = new RegExp(
      `[ \\t]*- target:\\s*\\{[^}]+\\}\\s*\\n\\s*propertyPath:\\s*${escapedPath}\\s*\\n\\s*value:[^\\n]*\\n\\s*objectReference:[^\\n]*\\n?`,
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

  // Validate component_ref format: must be a Unity object reference like {fileID: N, guid: G, type: T}
  if (!/^\{fileID:\s*-?\d+/.test(component_ref)) {
    return { success: false, file_path, error: `Invalid component reference "${component_ref}". Expected format: {fileID: N, guid: ..., type: T}` };
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

  // Validate gameobject ref format: must be a Unity object reference like {fileID: N, guid: G, type: T}
  if (!/^\{fileID:\s*-?\d+/.test(component_ref)) {
    return { success: false, file_path, error: `Invalid GameObject reference "${component_ref}". Expected format: {fileID: N, guid: ..., type: T}` };
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

  const restoreGoSaveResult = doc.save();
  if (!restoreGoSaveResult.success) {
    return { success: false, file_path, error: restoreGoSaveResult.error };
  }

  return {
    success: true,
    file_path,
    prefab_instance_id: targetBlock.file_id,
  };
}

// ========== Prefab Managed Reference ==========

/**
 * Generate a managed reference ID matching Unity's algorithm.
 *
 * Unity (2021+) generates IDs as: hash(timestamp + system_info) << 18 | counter.
 * The upper ~46 bits are a session-unique base derived from time + machine info.
 * The lower 18 bits are a sequential counter (0..262143) within a batch.
 *
 * We replicate this by: crypto-random 46-bit base << 18, then scan for collisions.
 * Reserved values: -2 (null ref), -1 (unknown). Range: 1 to Int64.MaxValue.
 */
function generate_managed_reference_id(existing_raw: string, count: number = 1): string[] {
    const { randomBytes } = require('crypto') as typeof import('crypto');

    // Collect all existing positive int64 IDs from the file
    const existingIds = new Set<bigint>();
    const idPattern = /\b(\d{1,19})\b/g;
    // Only scan lines that contain managed reference contexts
    for (const line of existing_raw.split('\n')) {
        if (line.includes('managedReferences[') || line.includes('rid:') ||
            (line.includes('objectReference:') && /\d{10,}/.test(line)) ||
            (line.includes('value:') && /\d{16,}/.test(line))) {
            let m;
            while ((m = idPattern.exec(line)) !== null) {
                const val = BigInt(m[1]);
                if (val > 0n) existingIds.add(val);
            }
        }
    }

    // Generate a base: random 46 bits shifted left by 18
    const buf = randomBytes(8);
    // Read as unsigned 64-bit, mask to 46 bits, shift left 18
    const raw64 = buf.readBigUInt64BE();
    const mask46 = (1n << 46n) - 1n;
    let base = ((raw64 & mask46) | 1n) << 18n; // ensure non-zero base

    // Clamp to positive Int64 range
    const INT64_MAX = 9223372036854775807n;
    if (base > INT64_MAX) base = base & (INT64_MAX >> 18n) << 18n;
    if (base <= 0n) base = 1n << 18n;

    const results: string[] = [];
    for (let i = 0; i < count; i++) {
        let id = base + BigInt(i);
        // Resolve collisions by incrementing counter
        while (id <= 0n || id > INT64_MAX || existingIds.has(id)) {
            id += 1n;
        }
        existingIds.add(id);
        results.push(id.toString());
    }
    return results;
}

export interface PrefabManagedReferenceOptions {
    file_path: string;
    prefab_instance: string;
    field_path: string;
    type_name: string;
    target: string;
    index?: number;
    project_path?: string;
}

export interface PrefabManagedReferenceResult {
    success: boolean;
    file_path: string;
    rid?: string;
    type_info?: { class_name: string; namespace: string; assembly: string };
    overrides_created?: string[];
    error?: string;
}

/**
 * Add a managed reference to a [SerializeReference] field in a prefab override.
 * Auto-generates the rid and creates all necessary override entries:
 *   - field.Array.data[N].managedReferenceType  (type declaration)
 *   - field.Array.data[N]                        (value: rid)
 *   - managedReferences[-2]                      (version marker)
 */
export function addPrefabManagedReference(options: PrefabManagedReferenceOptions): PrefabManagedReferenceResult {
    const { file_path, prefab_instance, field_path, type_name, target, project_path } = options;
    const index = options.index ?? 0;

    if (!existsSync(file_path)) {
        return { success: false, file_path, error: `File not found: ${file_path}` };
    }

    // Resolve type info
    const typeInfo = resolve_managed_type(type_name, project_path);
    let finalTypeInfo: { class_name: string; namespace: string; assembly: string };

    if (typeInfo) {
        finalTypeInfo = typeInfo;
    } else {
        // Allow manual format: "Assembly Namespace.ClassName"
        const spaceIdx = type_name.indexOf(' ');
        if (spaceIdx > 0) {
            const asm = type_name.substring(0, spaceIdx);
            const fullType = type_name.substring(spaceIdx + 1);
            const lastDot = fullType.lastIndexOf('.');
            finalTypeInfo = {
                assembly: asm,
                namespace: lastDot >= 0 ? fullType.substring(0, lastDot) : '',
                class_name: lastDot >= 0 ? fullType.substring(lastDot + 1) : fullType,
            };
        } else {
            return {
                success: false, file_path,
                error: `Type "${type_name}" not found in type registry. Use "Assembly Namespace.ClassName" format or run "setup" to rebuild.`,
            };
        }
    }

    let doc: UnityDocument;
    try {
        doc = UnityDocument.from_file(file_path);
    } catch (err) {
        return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
    }

    const piBlock = findPrefabInstanceBlock(doc, prefab_instance);
    if (!piBlock) {
        return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
    }

    // Generate the managed reference ID
    const [rid] = generate_managed_reference_id(piBlock.raw);

    // Build the type string: "Assembly Namespace.ClassName" or "Assembly ClassName"
    const typeValue = finalTypeInfo.namespace
        ? `${finalTypeInfo.assembly} ${finalTypeInfo.namespace}.${finalTypeInfo.class_name}`
        : `${finalTypeInfo.assembly} ${finalTypeInfo.class_name}`;

    // Strip .Array suffix from field_path if present (Unity YAML convention)
    const basePath = field_path.replace(/\.Array$/, '');

    // Build all override entries
    const overrides: PrefabOverrideEdit[] = [
        {
            property_path: `${basePath}.Array.data[${index}].managedReferenceType`,
            value: typeValue,
            target,
        },
        {
            property_path: `${basePath}.Array.data[${index}].managedReferenceValue`,
            value: rid,
            target,
        },
        {
            property_path: `managedReferences[-2]`,
            value: '2',
            target,
        },
    ];

    // Apply all overrides via batchEditPrefabOverrides
    const result = batchEditPrefabOverrides(file_path, prefab_instance, overrides);

    if (!result.success) {
        return { success: false, file_path, error: result.error };
    }

    return {
        success: true,
        file_path,
        rid,
        type_info: finalTypeInfo,
        overrides_created: overrides.map(o => o.property_path),
    };
}

// ========== Managed Reference Editing ==========

function resolve_managed_type(
    type_name: string,
    project_path?: string,
): { class_name: string; namespace: string; assembly: string } | null {
    if (!project_path) return null;

    const { join } = require('path') as typeof import('path');
    const registryPath = join(project_path, '.unity-agentic', 'type-registry.json');
    if (!existsSync(registryPath)) return null;

    try {
        const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as Array<{
            name: string; kind: string; namespace: string | null;
            filePath: string; guid: string | null;
        }>;

        let targetName = type_name;
        let targetNs: string | null = null;
        const dotIndex = type_name.lastIndexOf('.');
        if (dotIndex > 0) {
            targetNs = type_name.substring(0, dotIndex);
            targetName = type_name.substring(dotIndex + 1);
        }

        const matches = registry.filter(t => {
            if (t.name.toLowerCase() !== targetName.toLowerCase()) return false;
            if (targetNs && t.namespace?.toLowerCase() !== targetNs.toLowerCase()) return false;
            return true;
        });

        if (matches.length === 0) return null;
        const match = matches[0];
        let assembly = 'Assembly-CSharp';
        if (match.filePath && (match.filePath.includes('Packages/') || match.filePath.includes('PackageCache/'))) {
            const pkgMatch = match.filePath.match(/(?:Packages|PackageCache)\/([^/]+)/);
            if (pkgMatch) assembly = pkgMatch[1].replace(/@.*$/, '');
        }
        return { class_name: match.name, namespace: match.namespace || '', assembly };
    } catch {
        return null;
    }
}

/**
 * Add a managed reference to a component's SerializeReference field.
 */
export function editManagedReference(options: EditManagedReferenceOptions): EditManagedReferenceResult {
    const { file_path, file_id, field_path, type_name, project_path, append } = options;

    if (!existsSync(file_path)) {
        return { success: false, file_path, error: `File not found: ${file_path}` };
    }

    let doc: UnityDocument;
    try {
        doc = UnityDocument.from_file(file_path);
    } catch (err) {
        return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
    }

    const block = doc.find_by_file_id(file_id);
    if (!block) {
        return { success: false, file_path, error: `Component with fileID ${file_id} not found` };
    }
    if (block.class_id !== 114) {
        return { success: false, file_path, error: `fileID ${file_id} is not a MonoBehaviour (class ${block.class_id}). Managed references only apply to MonoBehaviours.` };
    }

    const typeInfo = resolve_managed_type(type_name, project_path);
    if (!typeInfo) {
        // Allow manual format: "Assembly Namespace.ClassName"
        const spaceIdx = type_name.indexOf(' ');
        if (spaceIdx > 0) {
            const asm = type_name.substring(0, spaceIdx);
            const fullType = type_name.substring(spaceIdx + 1);
            const lastDot = fullType.lastIndexOf('.');
            const manual = {
                assembly: asm,
                namespace: lastDot >= 0 ? fullType.substring(0, lastDot) : '',
                class_name: lastDot >= 0 ? fullType.substring(lastDot + 1) : fullType,
            };
            return applyManagedReference(doc, block, file_path, field_path, manual, append);
        }
        return {
            success: false, file_path,
            error: `Type "${type_name}" not found in type registry. Use "Assembly Namespace.ClassName" format or run "setup" to rebuild.`,
        };
    }

    return applyManagedReference(doc, block, file_path, field_path, typeInfo, append);
}

function applyManagedReference(
    doc: UnityDocument, block: UnityBlock, file_path: string,
    field_path: string, typeInfo: { class_name: string; namespace: string; assembly: string },
    append?: boolean,
): EditManagedReferenceResult {
    let raw = block.raw;

    const ridMatches = [...raw.matchAll(/rid:[ \t]*(\d+)/g)];
    const existingRids = ridMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
    const nextRid = existingRids.length > 0 ? Math.max(...existingRids) + 1 : 1;

    const refEntry = `    - rid: ${nextRid}\n      type: {class: ${typeInfo.class_name}, ns: ${typeInfo.namespace}, asm: ${typeInfo.assembly}}\n      data: {}`;

    const refIdsPattern = /(\s*RefIds:\s*\n)/;
    const referencesPattern = /(\s*references:\s*\n\s*version:\s*\d+\s*\n)/;

    if (refIdsPattern.test(raw)) {
        raw = raw.replace(refIdsPattern, `$1${refEntry}\n`);
    } else if (referencesPattern.test(raw)) {
        raw = raw.replace(referencesPattern, `$1    RefIds:\n${refEntry}\n`);
    } else {
        raw = raw.trimEnd() + `\n  references:\n    version: 2\n    RefIds:\n${refEntry}\n`;
    }

    if (!append) {
        const fieldRidPattern = new RegExp(
            `(${field_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\n\\s*rid:[ \\t]*)\\d+`, 'm'
        );
        if (fieldRidPattern.test(raw)) {
            raw = raw.replace(fieldRidPattern, `$1${nextRid}`);
        }
    }

    block.replace_raw(raw);
    const mrSave = doc.save();
    if (!mrSave.success) {
        return { success: false, file_path, error: mrSave.error };
    }

    return { success: true, file_path, rid: nextRid, type_info: typeInfo };
}
