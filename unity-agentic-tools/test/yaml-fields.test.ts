import { describe, expect, it } from 'vitest';
import { yaml_default_for_type, generate_field_yaml, json_value_to_yaml_lines } from '../src/editor/yaml-fields';
import type { CSharpFieldRef } from '../src/types';
import type { UnityVersion } from '../src/build-version';

function make_version(major: number, minor: number): UnityVersion {
    return { raw: `${major}.${minor}.0f1`, major, minor, patch: 0, releaseType: 'f', revision: 1 };
}

describe('yaml_default_for_type', () => {
    it.each([
        ['int', '0'],
        ['float', '0'],
        ['double', '0'],
        ['byte', '0'],
        ['long', '0'],
        ['bool', '0'],
        ['Int32', '0'],
        ['Single', '0'],
        ['Boolean', '0'],
        ['string', ''],
        ['String', ''],
    ])('should return %s -> %s', (typeName, expected) => {
        expect(yaml_default_for_type(typeName)).toBe(expected);
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

    it.each([
        ['int?', 'maybeValue'],
        ['Faction?', 'nullableEnum'],
    ])('should skip nullable field type %s', (typeName, fieldName) => {
        const fields = [
            make_field('health', 'int'),
            make_field(fieldName, typeName),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).not.toContain(fieldName);
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

    it('should emit rid: 0 for SerializeReference fields', () => {
        const field: CSharpFieldRef = {
            name: 'controller',
            typeName: 'IController',
            hasSerializeField: false,
            hasSerializeReference: true,
            isPublic: true,
            ownerType: 'PlayerAI',
        };
        const yaml = generate_field_yaml([field]);
        expect(yaml).toContain('controller:');
        expect(yaml).toContain('  rid: 0');
        expect(yaml).not.toContain('{fileID: 0}');
    });

    it('should emit rid: 0 for SR fields alongside normal fields', () => {
        const fields: CSharpFieldRef[] = [
            make_field('health', 'int'),
            {
                name: 'behaviour',
                typeName: 'IBehaviour',
                hasSerializeField: false,
                hasSerializeReference: true,
                isPublic: true,
                ownerType: 'TestClass',
            },
            make_field('speed', 'float'),
        ];
        const yaml = generate_field_yaml(fields);
        expect(yaml).toContain('health: 0');
        expect(yaml).toContain('behaviour:');
        expect(yaml).toContain('  rid: 0');
        expect(yaml).toContain('speed: 0');
    });

    it('should expand serializable struct fields via type_lookup', () => {
        const fields: CSharpFieldRef[] = [
            make_field('health', 'int'),
            make_field('trigger', 'PassiveTrigger'),
        ];
        const type_lookup = (typeName: string) => {
            if (typeName === 'PassiveTrigger') {
                return [
                    make_field('conditions', 'List<Condition>'),
                    make_field('triggerType', 'int'),
                ];
            }
            return null;
        };
        const yaml = generate_field_yaml(fields, undefined, '  ', type_lookup);
        expect(yaml).toContain('health: 0');
        expect(yaml).toContain('trigger:');
        expect(yaml).toContain('    conditions: []');
        expect(yaml).toContain('    triggerType: 0');
        expect(yaml).not.toContain('{fileID: 0}');
    });

    it('should fall back to {fileID: 0} when type_lookup returns null', () => {
        const fields: CSharpFieldRef[] = [
            make_field('target', 'SomeUnknownType'),
        ];
        const type_lookup = () => null;
        const yaml = generate_field_yaml(fields, undefined, '  ', type_lookup);
        expect(yaml).toContain('target: {fileID: 0}');
    });
});

describe('json_value_to_yaml_lines', () => {
    it('should convert string primitives', () => {
        expect(json_value_to_yaml_lines('hello')).toEqual(['hello']);
    });

    it('should quote strings that need quoting', () => {
        expect(json_value_to_yaml_lines('has: colon')).toEqual(["'has: colon'"]);
    });

    it('should convert numbers', () => {
        expect(json_value_to_yaml_lines(42)).toEqual(['42']);
        expect(json_value_to_yaml_lines(3.14)).toEqual(['3.14']);
    });

    it('should convert booleans', () => {
        expect(json_value_to_yaml_lines(true)).toEqual(['true']);
        expect(json_value_to_yaml_lines(false)).toEqual(['false']);
    });

    it('should convert null', () => {
        expect(json_value_to_yaml_lines(null)).toEqual(['']);
    });

    it('should convert empty array', () => {
        expect(json_value_to_yaml_lines([])).toEqual(['[]']);
    });

    it('should convert simple array', () => {
        const lines = json_value_to_yaml_lines(['a', 'b', 'c']);
        expect(lines).toEqual([
            '  - a',
            '  - b',
            '  - c',
        ]);
    });

    it('should convert empty object', () => {
        expect(json_value_to_yaml_lines({})).toEqual(['{}']);
    });

    it('should convert flat object', () => {
        const lines = json_value_to_yaml_lines({ health: 100, armor: 50 });
        expect(lines).toEqual([
            '  health: 100',
            '  armor: 50',
        ]);
    });

    it('should convert nested object as flow mapping', () => {
        const lines = json_value_to_yaml_lines({ stats: { health: 100, mana: 50 } });
        expect(lines).toEqual([
            '  stats: {health: 100, mana: 50}',
        ]);
    });

    it('should convert deeply nested structures with leaf flow mapping', () => {
        const lines = json_value_to_yaml_lines({
            a: { b: { c: 'deep' } }
        });
        expect(lines).toEqual([
            '  a:',
            '    b: {c: deep}',
        ]);
    });

    it('should convert array of all-scalar objects as flow mappings', () => {
        const lines = json_value_to_yaml_lines([
            { name: 'sword', damage: 10 },
            { name: 'shield', defense: 5 },
        ]);
        expect(lines).toEqual([
            '  - {name: sword, damage: 10}',
            '  - {name: shield, defense: 5}',
        ]);
    });

    it('should handle custom indent', () => {
        const lines = json_value_to_yaml_lines({ x: 1 }, '    ');
        expect(lines).toEqual(['    x: 1']);
    });

    it('should inline empty collections on same line as key', () => {
        const lines = json_value_to_yaml_lines({ conditions: [], config: {} });
        expect(lines).toEqual([
            '  conditions: []',
            '  config: {}',
        ]);
    });

    it('should use compact list format for complex array items', () => {
        const lines = json_value_to_yaml_lines([
            { rid: 1, type: { class: 'Foo', ns: 'Bar', asm: 'Baz' }, data: { x: 10 } },
        ]);
        expect(lines).toEqual([
            '  - rid: 1',
            '    type: {class: Foo, ns: Bar, asm: Baz}',
            '    data: {x: 10}',
        ]);
    });

    it('should put array items at same indent as parent key', () => {
        const lines = json_value_to_yaml_lines({
            RefIds: [
                { rid: 1, type: { class: 'X', ns: 'Y', asm: 'Z' } },
            ]
        });
        expect(lines).toEqual([
            '  RefIds:',
            '  - rid: 1',
            '    type: {class: X, ns: Y, asm: Z}',
        ]);
    });

    it('should handle mixed flow-mappable and complex values', () => {
        const lines = json_value_to_yaml_lines({
            version: 2,
            RefIds: [
                { rid: 1, type: { class: 'A', ns: '', asm: 'B' }, data: { nested: { deep: 1 } } },
            ]
        });
        expect(lines).toEqual([
            '  version: 2',
            '  RefIds:',
            '  - rid: 1',
            '    type: {class: A, ns: , asm: B}',
            '    data:',
            '      nested: {deep: 1}',
        ]);
    });
});
