/**
 * Unity YAML field generation from C# type info.
 *
 * Maps C# types to their Unity YAML default values with version-aware gating.
 * Only used when creating MonoBehaviours or ScriptableObjects to populate
 * serialized fields after m_EditorClassIdentifier.
 */

import type { CSharpFieldRef } from '../types';
import type { UnityVersion } from '../build-version';
import { yaml_quote_if_needed } from './unity-block';

// ========== Type-to-YAML Default Value Maps ==========

/** Primitive C# types -> YAML default value (both aliases and .NET names). */
const PRIMITIVE_DEFAULTS: Record<string, string> = {
    // C# aliases
    'int': '0',
    'float': '0',
    'double': '0',
    'bool': '0',
    'string': '',
    'byte': '0',
    'sbyte': '0',
    'short': '0',
    'ushort': '0',
    'uint': '0',
    'long': '0',
    'ulong': '0',
    'char': '0',
    // .NET type names
    'Int32': '0',
    'Single': '0',
    'Double': '0',
    'Boolean': '0',
    'String': '',
    'Byte': '0',
    'SByte': '0',
    'Int16': '0',
    'UInt16': '0',
    'UInt32': '0',
    'Int64': '0',
    'UInt64': '0',
    'Char': '0',
};

/** Unity struct types -> inline YAML format (safe for all 2019+ versions). */
const STRUCT_DEFAULTS: Record<string, string> = {
    'Vector2': '{x: 0, y: 0}',
    'Vector3': '{x: 0, y: 0, z: 0}',
    'Vector4': '{x: 0, y: 0, z: 0, w: 0}',
    'Vector2Int': '{x: 0, y: 0}',
    'Vector3Int': '{x: 0, y: 0, z: 0}',
    'Quaternion': '{x: 0, y: 0, z: 0, w: 1}',
    'Color': '{r: 0, g: 0, b: 0, a: 0}',
    'Color32': '{r: 0, g: 0, b: 0, a: 0}',
    'Rect': 'serializedVersion: 2\n    x: 0\n    y: 0\n    width: 0\n    height: 0',
    'RectInt': '{x: 0, y: 0, width: 0, height: 0}',
    'RectOffset': '{m_Left: 0, m_Right: 0, m_Top: 0, m_Bottom: 0}',
    'Matrix4x4': '{e00: 1, e01: 0, e02: 0, e03: 0, e10: 0, e11: 1, e12: 0, e13: 0, e20: 0, e21: 0, e22: 1, e23: 0, e30: 0, e31: 0, e32: 0, e33: 1}',
    'LayerMask': 'serializedVersion: 2\n    m_Bits: 0',
};

/** Types that require a minimum Unity version. */
const VERSION_GATED_STRUCT_DEFAULTS: Record<string, { value: string; min_major: number; min_minor: number }> = {
    // Hash128 serialization added in Unity 2021.1
    'Hash128': { value: 'serializedVersion: 2\n    Hash: 00000000000000000000000000000000', min_major: 2021, min_minor: 1 },
    // RenderingLayerMask added in Unity 6 (6000.0)
    'RenderingLayerMask': { value: 'serializedVersion: 2\n    m_Bits: 0', min_major: 6000, min_minor: 0 },
};

/** Unity struct types that need multi-line block format. */
const BLOCK_STRUCT_DEFAULTS: Record<string, string> = {
    'Bounds': 'm_Center: {x: 0, y: 0, z: 0}\n    m_Extent: {x: 0, y: 0, z: 0}',
    'BoundsInt': 'm_Position: {x: 0, y: 0, z: 0}\n    m_Size: {x: 0, y: 0, z: 0}',
};

/** Types that serialize as Unity object references ({fileID: 0}). */
const OBJECT_REF_TYPES = new Set([
    'GameObject', 'Transform', 'RectTransform',
    'Material', 'Texture', 'Texture2D', 'Texture3D', 'RenderTexture',
    'Sprite', 'AudioClip', 'VideoClip',
    'Mesh', 'Shader', 'ComputeShader',
    'AnimationClip', 'AnimatorController', 'RuntimeAnimatorController',
    'PhysicMaterial', 'PhysicsMaterial', 'PhysicsMaterial2D',
    'Font', 'TMP_FontAsset',
    'Object', 'Component', 'Behaviour', 'MonoBehaviour',
    'ScriptableObject', 'Rigidbody', 'Rigidbody2D',
    'Collider', 'Collider2D', 'Camera', 'Light',
    'Canvas', 'CanvasGroup', 'EventSystem',
    'AudioSource', 'ParticleSystem',
    'TextAsset', 'TerrainData',
]);

// ========== Version Helpers ==========

/** Check if a Unity version meets a minimum major.minor requirement. */
function version_at_least(version: UnityVersion | undefined, min_major: number, min_minor: number): boolean {
    if (!version) return false;
    if (version.major > min_major) return true;
    if (version.major === min_major) return version.minor >= min_minor;
    return false;
}

// ========== Public API ==========

/**
 * Get the Unity YAML default value for a C# type.
 *
 * Resolution order:
 * 1. Reject nullable types (Unity never serializes Nullable<T>)
 * 2. Primitives
 * 3. Inline structs (Vector3, Color, etc.)
 * 4. Version-gated structs (Hash128, RenderingLayerMask)
 * 5. Block structs (Bounds, BoundsInt)
 * 6. Arrays/Lists -> []
 * 7. Known object reference types -> {fileID: 0}
 * 8. Fallback: {fileID: 0} for unrecognized types
 *
 * Step 8 uses {fileID: 0} because the vast majority of custom types in
 * MonoBehaviours are object references (other components, assets, etc.).
 * For inline serializable types or unresolved enums, {fileID: 0} is "wrong"
 * but harmless — Unity will reset the field to its default when inspected.
 * This is far better than silently dropping the field entirely.
 *
 * @param csharp_type - The C# type name
 * @param version - Optional Unity version for gating version-specific types
 */
export function yaml_default_for_type(csharp_type: string, version?: UnityVersion): string | null {
    // Nullable types are NEVER serialized by Unity
    if (csharp_type.endsWith('?')) {
        return null;
    }

    // Check primitives
    if (csharp_type in PRIMITIVE_DEFAULTS) {
        return PRIMITIVE_DEFAULTS[csharp_type];
    }

    // Check inline structs (safe for all 2019+ versions)
    if (csharp_type in STRUCT_DEFAULTS) {
        return STRUCT_DEFAULTS[csharp_type];
    }

    // Check version-gated structs
    if (csharp_type in VERSION_GATED_STRUCT_DEFAULTS) {
        const gated = VERSION_GATED_STRUCT_DEFAULTS[csharp_type];
        if (version_at_least(version, gated.min_major, gated.min_minor)) {
            return gated.value;
        }
        return null; // Type not available in this Unity version
    }

    // Check block structs
    if (csharp_type in BLOCK_STRUCT_DEFAULTS) {
        return BLOCK_STRUCT_DEFAULTS[csharp_type];
    }

    // Arrays and Lists -> empty array
    if (csharp_type.endsWith('[]')) {
        return '[]';
    }
    if (csharp_type.startsWith('List<') && csharp_type.endsWith('>')) {
        return '[]';
    }

    // Known object reference types
    if (OBJECT_REF_TYPES.has(csharp_type)) {
        return '{fileID: 0}';
    }

    // Fallback for unrecognized types: treat as object reference.
    // Covers custom MonoBehaviours, ScriptableObjects, unresolved enums,
    // and other serializable types. Unity will correct the value on first inspection.
    return '{fileID: 0}';
}

/**
 * Generate YAML string for serialized fields.
 *
 * Takes the CSharpFieldRef array from Rust and produces properly
 * indented YAML to append after m_EditorClassIdentifier:.
 *
 * @param fields - Array of field info from Rust extraction
 * @param version - Optional Unity version for gating version-specific types
 * @param indent - Base indentation (default: 2 spaces for MonoBehaviour properties)
 */
export function generate_field_yaml(
    fields: CSharpFieldRef[],
    version?: UnityVersion,
    indent: string = '  ',
    type_lookup?: (typeName: string) => CSharpFieldRef[] | null,
): string {
    const lines: string[] = [];

    for (const field of fields) {
        // [SerializeReference] fields serialize as managed references.
        // List/array types get an empty array; scalar types get rid: 0 (null ref).
        if (field.hasSerializeReference) {
            const t = field.typeName;
            if (t.endsWith('[]') || (t.startsWith('List<') && t.endsWith('>'))) {
                lines.push(`${indent}${field.name}: []`);
            } else {
                lines.push(`${indent}${field.name}:`);
                lines.push(`${indent}  rid: 0`);
            }
            continue;
        }

        const default_value = yaml_default_for_type(field.typeName, version);
        if (default_value === null) {
            // Nullable type or version-gated type unavailable in this Unity version -- skip
            continue;
        }

        // Check if this is an unknown type that the type registry knows as a serializable struct
        if (default_value === '{fileID: 0}' && type_lookup) {
            const struct_fields = type_lookup(field.typeName);
            if (struct_fields && struct_fields.length > 0) {
                lines.push(`${indent}${field.name}:`);
                const nested = generate_field_yaml(struct_fields, version, indent + '  ', type_lookup);
                // nested format: '\nfield1: val\nfield2: val\n' -- strip leading/trailing \n
                const nested_lines = nested.slice(1).replace(/\n$/, '').split('\n');
                for (const nl of nested_lines) {
                    lines.push(nl);
                }
                continue;
            }
        }

        // Multi-line values (block structs like Bounds) need special handling
        if (default_value.includes('\n')) {
            lines.push(`${indent}${field.name}:`);
            for (const sub_line of default_value.split('\n')) {
                lines.push(`${indent}${sub_line}`);
            }
        } else {
            lines.push(`${indent}${field.name}: ${default_value}`);
        }
    }

    return lines.length > 0 ? '\n' + lines.join('\n') + '\n' : '\n';
}

// ========== JSON-to-YAML Conversion ==========

/**
 * Convert a JSON value to Unity YAML lines at the given indent level.
 * Returns an array of lines (without trailing newline).
 *
 * Primitives return a single-element array with the scalar value.
 * Objects return block-style key: value pairs.
 * Arrays return - prefixed elements.
 */
export function json_value_to_yaml_lines(value: unknown, indent: string = '  '): string[] {
    if (value === null || value === undefined) {
        return [''];
    }
    if (typeof value === 'string') {
        return [yaml_quote_if_needed(value)];
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return ['[]'];
        const lines: string[] = [];
        for (const item of value) {
            if (is_scalar(item) || is_empty_collection(item)) {
                const scalar = json_value_to_yaml_lines(item);
                lines.push(`${indent}- ${scalar[0]}`);
            } else if (is_flow_mappable(item)) {
                lines.push(`${indent}- ${to_flow_mapping(item as Record<string, unknown>)}`);
            } else {
                // Complex item: compact format (merge - with first child line)
                const child_lines = json_value_to_yaml_lines(item, indent + '  ');
                lines.push(`${indent}- ${child_lines[0].trimStart()}`);
                for (let i = 1; i < child_lines.length; i++) {
                    lines.push(child_lines[i]);
                }
            }
        }
        return lines;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return ['{}'];
        const lines: string[] = [];
        for (const [key, val] of entries) {
            if (is_scalar(val) || is_empty_collection(val)) {
                const scalar = json_value_to_yaml_lines(val);
                lines.push(`${indent}${key}: ${scalar[0]}`);
            } else if (is_flow_mappable(val)) {
                lines.push(`${indent}${key}: ${to_flow_mapping(val as Record<string, unknown>)}`);
            } else {
                // Complex value: key on its own line, children indented below
                // Arrays use same indent (Unity convention: list items at parent key level)
                const child_indent = Array.isArray(val) ? indent : indent + '  ';
                lines.push(`${indent}${key}:`);
                const child_lines = json_value_to_yaml_lines(val, child_indent);
                for (const cl of child_lines) {
                    lines.push(cl);
                }
            }
        }
        return lines;
    }
    return [String(value)];
}

function is_scalar(value: unknown): boolean {
    return value === null || value === undefined ||
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function is_empty_collection(value: unknown): boolean {
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object' && value !== null) return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
}

function is_flow_mappable(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return false;
    return entries.every(([, v]) => is_scalar(v) || is_empty_collection(v));
}

function to_flow_mapping(obj: Record<string, unknown>): string {
    const parts = Object.entries(obj).map(([k, v]) => {
        if (v === null || v === undefined) return `${k}: `;
        if (typeof v === 'string') return `${k}: ${yaml_quote_if_needed(v)}`;
        if (Array.isArray(v) && v.length === 0) return `${k}: []`;
        if (typeof v === 'object' && v !== null && Object.keys(v as Record<string, unknown>).length === 0) return `${k}: {}`;
        return `${k}: ${String(v)}`;
    });
    return `{${parts.join(', ')}}`;
}
