import { describe, expect, it } from 'vitest';
import { yaml_default_for_type, generate_field_yaml } from '../src/editor/yaml-fields';
import type { CSharpFieldRef } from '../src/types';
import type { UnityVersion } from '../src/build-version';

function make_version(major: number, minor: number): UnityVersion {
    return { raw: `${major}.${minor}.0f1`, major, minor, patch: 0, releaseType: 'f', revision: 1 };
}

describe('yaml_default_for_type', () => {
    it('should return 0 for numeric primitives', () => {
        expect(yaml_default_for_type('int')).toBe('0');
        expect(yaml_default_for_type('float')).toBe('0');
        expect(yaml_default_for_type('double')).toBe('0');
        expect(yaml_default_for_type('byte')).toBe('0');
        expect(yaml_default_for_type('long')).toBe('0');
    });

    it('should return 0 for bool', () => {
        expect(yaml_default_for_type('bool')).toBe('0');
    });

    it('should return empty string for string', () => {
        expect(yaml_default_for_type('string')).toBe('');
    });

    it('should handle .NET type names', () => {
        expect(yaml_default_for_type('Int32')).toBe('0');
        expect(yaml_default_for_type('Single')).toBe('0');
        expect(yaml_default_for_type('Boolean')).toBe('0');
        expect(yaml_default_for_type('String')).toBe('');
    });

    it('should return inline format for Unity structs', () => {
        expect(yaml_default_for_type('Vector3')).toBe('{x: 0, y: 0, z: 0}');
        expect(yaml_default_for_type('Vector2')).toBe('{x: 0, y: 0}');
        expect(yaml_default_for_type('Color')).toBe('{r: 0, g: 0, b: 0, a: 0}');
        expect(yaml_default_for_type('Quaternion')).toBe('{x: 0, y: 0, z: 0, w: 1}');
    });

    it('should return multi-line format for block structs', () => {
        const bounds = yaml_default_for_type('Bounds');
        expect(bounds).toContain('m_Center');
        expect(bounds).toContain('m_Extent');
    });

    it('should return {fileID: 0} for object reference types', () => {
        expect(yaml_default_for_type('GameObject')).toBe('{fileID: 0}');
        expect(yaml_default_for_type('Transform')).toBe('{fileID: 0}');
        expect(yaml_default_for_type('Material')).toBe('{fileID: 0}');
        expect(yaml_default_for_type('AudioClip')).toBe('{fileID: 0}');
        expect(yaml_default_for_type('ScriptableObject')).toBe('{fileID: 0}');
    });

    it('should return [] for arrays and lists', () => {
        expect(yaml_default_for_type('int[]')).toBe('[]');
        expect(yaml_default_for_type('float[]')).toBe('[]');
        expect(yaml_default_for_type('List<int>')).toBe('[]');
        expect(yaml_default_for_type('List<string>')).toBe('[]');
    });

    it('should return null for nullable types (Unity never serializes Nullable<T>)', () => {
        expect(yaml_default_for_type('int?')).toBeNull();
        expect(yaml_default_for_type('float?')).toBeNull();
        expect(yaml_default_for_type('Vector3?')).toBeNull();
        expect(yaml_default_for_type('bool?')).toBeNull();
    });

    it('should return {fileID: 0} for unknown types (fallback)', () => {
        expect(yaml_default_for_type('MyCustomClass')).toBe('{fileID: 0}');
        expect(yaml_default_for_type('SomeUnknownType')).toBe('{fileID: 0}');
    });

    // ========== Version-gated type tests ==========

    it('should return Hash128 default for Unity 2021.1+', () => {
        const v2021 = make_version(2021, 1);
        const result = yaml_default_for_type('Hash128', v2021);
        expect(result).not.toBeNull();
        expect(result).toContain('Hash');
    });

    it('should return null for Hash128 on Unity 2020.x', () => {
        const v2020 = make_version(2020, 3);
        expect(yaml_default_for_type('Hash128', v2020)).toBeNull();
    });

    it('should return null for Hash128 without version info', () => {
        expect(yaml_default_for_type('Hash128')).toBeNull();
    });

    it('should return RenderingLayerMask default for Unity 6 (6000.0+)', () => {
        const v6 = make_version(6000, 0);
        const result = yaml_default_for_type('RenderingLayerMask', v6);
        expect(result).not.toBeNull();
        expect(result).toContain('m_Bits');
    });

    it('should return null for RenderingLayerMask on Unity 2022.x', () => {
        const v2022 = make_version(2022, 3);
        expect(yaml_default_for_type('RenderingLayerMask', v2022)).toBeNull();
    });

    it('should not gate standard structs like Vector3 on version', () => {
        const v2019 = make_version(2019, 4);
        expect(yaml_default_for_type('Vector3', v2019)).toBe('{x: 0, y: 0, z: 0}');
        expect(yaml_default_for_type('Vector3')).toBe('{x: 0, y: 0, z: 0}');
    });
});

describe('generate_field_yaml', () => {
    function make_field(name: string, typeName: string): CSharpFieldRef {
        return {
            name,
            typeName,
            hasSerializeField: false,
            hasSerializeReference: false,
            isPublic: true,
            ownerType: 'TestClass',
        };
    }

    it('should generate YAML for simple primitive fields', () => {
        const fields = [
            make_field('health', 'int'),
            make_field('speed', 'float'),
            make_field('playerName', 'string'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).toContain('speed: 0');
        expect(yaml).toContain('playerName: ');
    });

    it('should generate YAML for Unity struct types', () => {
        const fields = [make_field('position', 'Vector3')];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('position: {x: 0, y: 0, z: 0}');
    });

    it('should generate YAML for object references', () => {
        const fields = [make_field('target', 'GameObject')];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('target: {fileID: 0}');
    });

    it('should generate YAML for arrays', () => {
        const fields = [make_field('items', 'List<int>')];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('items: []');
    });

    it('should emit {fileID: 0} for unknown types (fallback)', () => {
        const fields = [
            make_field('known', 'int'),
            make_field('customRef', 'SomeCustomType'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('known: 0');
        expect(yaml).toContain('customRef: {fileID: 0}');
    });

    it('should return newline only for empty fields', () => {
        const yaml = generate_field_yaml([]);
        expect(yaml).toBe('\n');
    });

    it('should use correct indentation', () => {
        const fields = [make_field('value', 'int')];
        const yaml = generate_field_yaml(fields);
        // Default indent is 2 spaces
        expect(yaml).toContain('  value: 0');
    });

    it('should handle mixed field types', () => {
        const fields = [
            make_field('health', 'int'),
            make_field('position', 'Vector3'),
            make_field('target', 'GameObject'),
            make_field('scores', 'List<int>'),
            make_field('active', 'bool'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).toContain('position: {x: 0, y: 0, z: 0}');
        expect(yaml).toContain('target: {fileID: 0}');
        expect(yaml).toContain('scores: []');
        expect(yaml).toContain('active: 0');
    });

    it('should skip version-gated fields when version is too old', () => {
        const fields = [
            make_field('health', 'int'),
            make_field('hash', 'Hash128'),
        ];
        const v2020 = make_version(2020, 3);
        const yaml = generate_field_yaml(fields, v2020);
        expect(yaml).toContain('health: 0');
        expect(yaml).not.toContain('hash');
    });

    it('should include version-gated fields when version is sufficient', () => {
        const fields = [
            make_field('health', 'int'),
            make_field('hash', 'Hash128'),
        ];
        const v2021 = make_version(2021, 1);
        const yaml = generate_field_yaml(fields, v2021);
        expect(yaml).toContain('health: 0');
        expect(yaml).toContain('hash:');
    });

    it('should skip nullable fields entirely', () => {
        const fields = [
            make_field('health', 'int'),
            make_field('maybeValue', 'int?'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).not.toContain('maybeValue');
    });

    it('should generate correct YAML for enum fields resolved to int', () => {
        // After Rust or TS enum resolution, enum fields have typeName "int"
        const fields = [
            make_field('team', 'int'),       // was Faction, resolved to int
            make_field('health', 'int'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('team: 0');
        expect(yaml).toContain('health: 0');
    });

    it('should skip nullable enum fields', () => {
        // Nullable enums (e.g., Faction?) should be skipped
        const fields = [
            make_field('health', 'int'),
            make_field('nullableEnum', 'Faction?'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).not.toContain('nullableEnum');
    });
});
