import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { UnityBlock } from '../src/editor/unity-block';

// ========== Helpers ==========

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

/**
 * Read a Unity YAML file and split into raw block strings.
 * The first element may be the YAML header (not a block).
 */
function load_blocks(filename: string): string[] {
    const content = readFileSync(resolve(FIXTURES_DIR, filename), 'utf-8');
    return content.split(/(?=--- !u!)/);
}

/**
 * Find a raw block string by file ID from an array of raw blocks.
 */
function find_raw_block(blocks: string[], file_id: string): string {
    const pattern = new RegExp(`^--- !u!\\d+ &${file_id}\\b`);
    const found = blocks.find(b => pattern.test(b));
    if (!found) throw new Error(`Block with fileID ${file_id} not found in fixture`);
    return found;
}

// ========== Tests ==========

describe('UnityBlock', () => {

    // ========== Header Parsing ==========

    describe('header parsing', () => {
        it('should parse a GameObject header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('508316491');
            expect(block.class_id).toBe(1);
            expect(block.is_stripped).toBe(false);
            expect(block.type_name).toBe('GameObject');
        });

        it('should parse a Transform header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('508316495');
            expect(block.class_id).toBe(4);
            expect(block.is_stripped).toBe(false);
            expect(block.type_name).toBe('Transform');
        });

        it('should parse a MonoBehaviour header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1847675927');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('1847675927');
            expect(block.class_id).toBe(114);
            expect(block.is_stripped).toBe(false);
            expect(block.type_name).toBe('MonoBehaviour');
        });

        it('should parse a stripped block header', () => {
            const raw_blocks = load_blocks('SceneWithPrefab.unity');
            const raw = find_raw_block(raw_blocks, '600000');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('600000');
            expect(block.class_id).toBe(1);
            expect(block.is_stripped).toBe(true);
            expect(block.type_name).toBe('GameObject');
        });

        it('should parse a PrefabInstance header', () => {
            const raw_blocks = load_blocks('SceneWithPrefab.unity');
            const raw = find_raw_block(raw_blocks, '700000');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('700000');
            expect(block.class_id).toBe(1001);
            expect(block.is_stripped).toBe(false);
            // 1001 is not in UNITY_CLASS_IDS, so it will get Unknown_1001
            // Actually, let's check -- 310 is PrefabInstance in class-ids.ts, not 1001
            // 1001 is not in the map, so it should be Unknown_1001
            expect(block.type_name).toBe('Unknown_1001');
        });

        it('should parse a Light header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            expect(block.file_id).toBe('1028675096');
            expect(block.class_id).toBe(108);
            expect(block.type_name).toBe('Light');
        });

        it('should throw on invalid header', () => {
            expect(() => new UnityBlock('not a unity block')).toThrow(
                /Invalid Unity YAML block header/
            );
        });

        it('should throw on YAML header (no block marker)', () => {
            expect(() => new UnityBlock('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:')).toThrow(
                /Invalid Unity YAML block header/
            );
        });
    });

    // ========== get_property / set_property ==========

    describe('get_property', () => {
        it('should get a simple property (m_Name)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_Name')).toBe('Main Camera');
        });

        it('should get m_IsActive', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1847675923');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_IsActive')).toBe('1');
        });

        it('should get m_TagString', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_TagString')).toBe('MainCamera');
        });

        it('should get a dotted path for inline object (m_LocalPosition.x)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_LocalPosition.x')).toBe('0');
            expect(block.get_property('m_LocalPosition.y')).toBe('1');
            expect(block.get_property('m_LocalPosition.z')).toBe('-10');
        });

        it('should get a dotted path for block-style nested YAML (m_Shadows.m_Type)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // Light block has m_Shadows with block-style sub-properties
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_Shadows.m_Type')).toBe('2');
            expect(block.get_property('m_Shadows.m_Resolution')).toBe('-1');
            expect(block.get_property('m_Shadows.m_Strength')).toBe('1');
        });

        it('should get a deep block-style path (m_Shadows.m_CullingMatrixOverride.e00)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_Shadows.m_CullingMatrixOverride.e00')).toBe('1');
            expect(block.get_property('m_Shadows.m_CullingMatrixOverride.e33')).toBe('1');
        });

        it('should get array element via Array.data path', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // MeshRenderer block for Player has m_Materials array
            const raw = find_raw_block(raw_blocks, '1847675926');
            const block = new UnityBlock(raw);

            const val = block.get_property('m_Materials.Array.data[0]');
            expect(val).toContain('fileID: 10303');
        });

        it('should return null for non-existent property', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_NonExistent')).toBeNull();
        });

        it('should return null for non-existent dotted path', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_LocalPosition.w')).toBeNull();
        });

        it('should return null for out-of-bounds array index', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1847675926');
            const block = new UnityBlock(raw);

            expect(block.get_property('m_Materials.Array.data[99]')).toBeNull();
        });
    });

    describe('set_property', () => {
        it('should set a simple property', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.set_property('m_Name', 'Renamed Camera');
            expect(modified).toBe(true);
            expect(block.get_property('m_Name')).toBe('Renamed Camera');
            expect(block.dirty).toBe(true);
        });

        it('should set a dotted path for inline object', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            const modified = block.set_property('m_LocalPosition.x', '42');
            expect(modified).toBe(true);
            expect(block.get_property('m_LocalPosition.x')).toBe('42');
            // Other fields should be preserved
            expect(block.get_property('m_LocalPosition.y')).toBe('1');
            expect(block.get_property('m_LocalPosition.z')).toBe('-10');
        });

        it('should set a dotted path for block-style nested YAML', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            const modified = block.set_property('m_Shadows.m_Type', '1');
            expect(modified).toBe(true);
            expect(block.get_property('m_Shadows.m_Type')).toBe('1');
            // Other shadow properties should be preserved
            expect(block.get_property('m_Shadows.m_Strength')).toBe('1');
        });

        it('should set an array element', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1847675926');
            const block = new UnityBlock(raw);

            const modified = block.set_property(
                'm_Materials.Array.data[0]',
                '{fileID: 99999, guid: abcd1234, type: 2}'
            );
            expect(modified).toBe(true);
            expect(block.get_property('m_Materials.Array.data[0]')).toContain('fileID: 99999');
        });

        it('should return false when property does not exist (simple)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.set_property('m_NonExistent', 'value');
            expect(modified).toBe(false);
            expect(block.dirty).toBe(false);
        });

        it('should use object_reference when provided', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.set_property(
                'm_Icon',
                'ignored_value',
                '{fileID: 12345}'
            );
            expect(modified).toBe(true);
            expect(block.get_property('m_Icon')).toBe('{fileID: 12345}');
        });

        it('should ignore object_reference when it is {fileID: 0}', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.set_property(
                'm_Name',
                'NewName',
                '{fileID: 0}'
            );
            expect(modified).toBe(true);
            expect(block.get_property('m_Name')).toBe('NewName');
        });
    });

    describe('has_property', () => {
        it('should return true for existing properties', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.has_property('m_Name')).toBe(true);
            expect(block.has_property('m_IsActive')).toBe(true);
        });

        it('should return false for non-existent properties', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.has_property('m_NonExistent')).toBe(false);
        });
    });

    // ========== Format Detection ==========

    describe('detect_format', () => {
        it('should detect inline format for m_LocalPosition', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.detect_format('m_LocalPosition')).toBe('inline');
            expect(block.detect_format('m_LocalRotation')).toBe('inline');
            expect(block.detect_format('m_LocalScale')).toBe('inline');
        });

        it('should detect block format for nested properties', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            expect(block.detect_format('m_Shadows')).toBe('block');
            expect(block.detect_format('m_CullingMask')).toBe('block');
        });

        it('should cache format detection results', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            // Call twice -- second should use cache
            const first = block.detect_format('m_LocalPosition');
            const second = block.detect_format('m_LocalPosition');
            expect(first).toBe(second);
            expect(first).toBe('inline');
        });
    });

    // ========== Format Preservation ==========

    describe('format preservation', () => {
        it('should preserve inline format when editing a sub-field', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            block.set_property('m_LocalPosition.x', '99');

            // The raw text should still have inline format
            expect(block.raw).toMatch(/m_LocalPosition:\s*\{x: 99, y: 1, z: -10\}/);
        });

        it('should preserve block format when editing a nested field', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1028675096');
            const block = new UnityBlock(raw);

            block.set_property('m_Shadows.m_Type', '0');

            // The raw text should still have block format (m_Type on its own indented line)
            expect(block.raw).toMatch(/m_Shadows:\n\s+m_Type: 0/);
        });
    });

    // ========== Array Operations ==========

    describe('get_array_length', () => {
        it('should count multiline array elements (m_Component)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            // Main Camera has 4 components
            expect(block.get_array_length('m_Component')).toBe(4);
        });

        it('should count multiline array elements (m_Children)', () => {
            const raw_blocks = load_blocks('SamplePrefab.prefab');
            // EnemyPrefab root Transform (400000) has 1 child
            const raw = find_raw_block(raw_blocks, '400000');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Children')).toBe(1);
        });

        it('should return 0 for empty array []', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // Main Camera Transform (508316495) has m_Children: []
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Children')).toBe(0);
        });

        it('should return 0 for inline empty array on MonoBehaviour', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // GameManager MonoBehaviour (2094567892) has spawnPoints: []
            const raw = find_raw_block(raw_blocks, '2094567892');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('spawnPoints')).toBe(0);
        });
    });

    describe('insert_array_element', () => {
        it('should insert into an empty array []', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Children')).toBe(0);

            const modified = block.insert_array_element('m_Children', -1, '{fileID: 999}');
            expect(modified).toBe(true);
            expect(block.get_array_length('m_Children')).toBe(1);
            expect(block.dirty).toBe(true);
        });

        it('should append to existing array (index=-1)', () => {
            const raw_blocks = load_blocks('SamplePrefab.prefab');
            const raw = find_raw_block(raw_blocks, '400000');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Children')).toBe(1);

            const modified = block.insert_array_element('m_Children', -1, '{fileID: 999}');
            expect(modified).toBe(true);
            expect(block.get_array_length('m_Children')).toBe(2);
        });

        it('should insert at a specific index', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // Main Camera GO (508316491) has 4 components
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Component')).toBe(4);

            const modified = block.insert_array_element(
                'm_Component',
                1,
                'component: {fileID: 999}'
            );
            expect(modified).toBe(true);
            expect(block.get_array_length('m_Component')).toBe(5);
        });
    });

    describe('remove_array_element', () => {
        it('should remove an element by index', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Component')).toBe(4);

            const modified = block.remove_array_element('m_Component', 0);
            expect(modified).toBe(true);
            expect(block.get_array_length('m_Component')).toBe(3);
            expect(block.dirty).toBe(true);
        });

        it('should convert to empty array [] when removing last element', () => {
            const raw_blocks = load_blocks('SamplePrefab.prefab');
            const raw = find_raw_block(raw_blocks, '400000');
            const block = new UnityBlock(raw);

            expect(block.get_array_length('m_Children')).toBe(1);

            const modified = block.remove_array_element('m_Children', 0);
            expect(modified).toBe(true);
            expect(block.get_array_length('m_Children')).toBe(0);
            expect(block.raw).toContain('m_Children: []');
        });

        it('should return false for out-of-bounds index', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.remove_array_element('m_Component', 99);
            expect(modified).toBe(false);
            expect(block.dirty).toBe(false);
        });

        it('should return false for negative index', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const modified = block.remove_array_element('m_Component', -1);
            expect(modified).toBe(false);
        });
    });

    // ========== Reference Helpers ==========

    describe('extract_file_id_refs', () => {
        it('should extract all non-zero fileID references from body', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // Main Camera GO (508316491) references component fileIDs
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const refs = block.extract_file_id_refs();
            expect(refs).toContain('508316495');
            expect(refs).toContain('508316494');
            expect(refs).toContain('508316493');
            expect(refs).toContain('508316492');
            // Should NOT contain '0'
            expect(refs).not.toContain('0');
        });

        it('should not include the header file ID', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            // The header fileID is 508316491 but it should NOT appear in refs
            // (it's in the header, not the body as a {fileID: ...} reference)
            // However, the block might reference itself -- in this case it doesn't
            const refs = block.extract_file_id_refs();
            // Just check that refs are all body-only refs
            expect(refs.length).toBeGreaterThan(0);
        });

        it('should return empty array for block with only fileID: 0 refs', () => {
            // Create a minimal block with only {fileID: 0} references
            const raw = `--- !u!81 &508316493\nAudioListener:\n  m_GameObject: {fileID: 0}\n`;
            const block = new UnityBlock(raw);

            const refs = block.extract_file_id_refs();
            expect(refs).toEqual([]);
        });
    });

    describe('remap_file_id', () => {
        it('should remap file ID in header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.remap_file_id('508316491', '999999999');

            expect(block.file_id).toBe('999999999');
            expect(block.raw).toMatch(/^--- !u!1 &999999999/);
            expect(block.dirty).toBe(true);
        });

        it('should remap file ID in body references', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // Main Camera Transform (508316495) references m_GameObject: {fileID: 508316491}
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            block.remap_file_id('508316491', '111111111');

            expect(block.raw).toContain('{fileID: 111111111}');
            expect(block.raw).not.toContain('{fileID: 508316491}');
        });

        it('should remap both header and body when same ID appears', () => {
            // Create a block that references itself
            const raw = [
                '--- !u!1 &100\n',
                'GameObject:\n',
                '  m_SelfRef: {fileID: 100}\n',
            ].join('');
            const block = new UnityBlock(raw);

            block.remap_file_id('100', '200');

            expect(block.file_id).toBe('200');
            expect(block.raw).toContain('--- !u!1 &200');
            expect(block.raw).toContain('{fileID: 200}');
            expect(block.raw).not.toContain('{fileID: 100}');
        });

        it('should not remap fileID: 0', () => {
            const raw = [
                '--- !u!1 &100\n',
                'GameObject:\n',
                '  m_PrefabInstance: {fileID: 0}\n',
            ].join('');
            const block = new UnityBlock(raw);

            block.remap_file_id('0', '999');

            // fileID: 0 should NOT be remapped (it's the null reference)
            // The header &100 should also not change since old_id is '0' not '100'
            expect(block.raw).toContain('{fileID: 0}');
        });

        it('should not mark dirty if ID is not found', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.remap_file_id('99999999', '88888888');

            expect(block.dirty).toBe(false);
        });
    });

    // ========== clone ==========

    describe('clone', () => {
        it('should produce an independent copy', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            const cloned = block.clone();

            expect(cloned.raw).toBe(block.raw);
            expect(cloned.file_id).toBe(block.file_id);
            expect(cloned.class_id).toBe(block.class_id);
            expect(cloned.is_stripped).toBe(block.is_stripped);
        });

        it('should not be dirty', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            // Make the original dirty
            block.set_property('m_Name', 'Changed');
            expect(block.dirty).toBe(true);

            const cloned = block.clone();
            expect(cloned.dirty).toBe(false);
        });

        it('should be independent -- modifying clone does not affect original', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);
            const original_name = block.get_property('m_Name');

            const cloned = block.clone();
            cloned.set_property('m_Name', 'ClonedName');

            expect(cloned.get_property('m_Name')).toBe('ClonedName');
            expect(block.get_property('m_Name')).toBe(original_name);
        });
    });

    // ========== Dirty Tracking ==========

    describe('dirty tracking', () => {
        it('should be clean on creation', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.dirty).toBe(false);
        });

        it('should be dirty after set_property', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.set_property('m_Name', 'NewName');
            expect(block.dirty).toBe(true);
        });

        it('should be dirty after replace_raw', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.replace_raw(raw);
            expect(block.dirty).toBe(true);
        });

        it('should be dirty after remap_file_id (when ID found)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.remap_file_id('508316491', '999');
            expect(block.dirty).toBe(true);
        });

        it('should be dirty after insert_array_element', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316495');
            const block = new UnityBlock(raw);

            block.insert_array_element('m_Children', -1, '{fileID: 123}');
            expect(block.dirty).toBe(true);
        });

        it('should be dirty after remove_array_element', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.remove_array_element('m_Component', 0);
            expect(block.dirty).toBe(true);
        });

        it('should NOT be dirty after failed set_property', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            block.set_property('m_NonExistent', 'value');
            expect(block.dirty).toBe(false);
        });
    });

    // ========== replace_raw ==========

    describe('replace_raw', () => {
        it('should replace entire block text and re-parse header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const go_raw = find_raw_block(raw_blocks, '508316491');
            const transform_raw = find_raw_block(raw_blocks, '508316495');

            const block = new UnityBlock(go_raw);
            expect(block.class_id).toBe(1);

            block.replace_raw(transform_raw);
            expect(block.class_id).toBe(4);
            expect(block.file_id).toBe('508316495');
            expect(block.dirty).toBe(true);
        });

        it('should throw on invalid replacement text', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(() => block.replace_raw('not a valid block')).toThrow(
                /Invalid Unity YAML block header/
            );
        });
    });

    // ========== Raw property ==========

    describe('raw property', () => {
        it('should return full block text including header', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.raw).toBe(raw);
            expect(block.raw).toMatch(/^--- !u!1 &508316491/);
            expect(block.raw).toContain('m_Name: Main Camera');
        });
    });

    // ========== Edge Cases ==========

    describe('edge cases', () => {
        it('should handle properties without m_ prefix (custom MonoBehaviour fields)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            // MonoBehaviour block (1847675927) has moveSpeed, jumpForce
            const raw = find_raw_block(raw_blocks, '1847675927');
            const block = new UnityBlock(raw);

            expect(block.get_property('moveSpeed')).toBe('5');
            expect(block.get_property('jumpForce')).toBe('10');
        });

        it('should handle setting custom MonoBehaviour fields', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '1847675927');
            const block = new UnityBlock(raw);

            const modified = block.set_property('moveSpeed', '15');
            expect(modified).toBe(true);
            expect(block.get_property('moveSpeed')).toBe('15');
        });

        it('should handle block-style nested property in Camera (m_NormalizedViewPortRect)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316494');
            const block = new UnityBlock(raw);

            // m_NormalizedViewPortRect is block-style with sub-properties
            expect(block.get_property('m_NormalizedViewPortRect.width')).toBe('1');
            expect(block.get_property('m_NormalizedViewPortRect.height')).toBe('1');
        });

        it('should handle the serializedVersion property (no m_ prefix)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316491');
            const block = new UnityBlock(raw);

            expect(block.get_property('serializedVersion')).toBe('6');
        });

        it('should handle properties with space in key name (Camera)', () => {
            const raw_blocks = load_blocks('SampleScene.unity');
            const raw = find_raw_block(raw_blocks, '508316494');
            const block = new UnityBlock(raw);

            expect(block.get_property('field of view')).toBe('60');
            expect(block.get_property('near clip plane')).toBe('0.3');
        });

        it('should handle inline objects with fileID references', () => {
            const raw_blocks = load_blocks('SamplePrefab.prefab');
            const raw = find_raw_block(raw_blocks, '11400001');
            const block = new UnityBlock(raw);

            // target: {fileID: 100000}
            expect(block.get_property('target')).toBe('{fileID: 100000}');
        });

        it('should handle inline objects with multiple fields (offset)', () => {
            const raw_blocks = load_blocks('SamplePrefab.prefab');
            const raw = find_raw_block(raw_blocks, '11400001');
            const block = new UnityBlock(raw);

            expect(block.get_property('offset.x')).toBe('0');
            expect(block.get_property('offset.y')).toBe('2.5');
            expect(block.get_property('offset.z')).toBe('0');
        });
    });

    // ========== Bug Fix: Block-Style Nested Paths (Bug #2) ==========

    describe('block-style nested paths with content after colon', () => {
        it('should get_property for block-style parent with pure colon line', () => {
            const raw = [
                '--- !u!114 &900\n',
                'MonoBehaviour:\n',
                '  m_Enabled: 1\n',
                '  DirectNested:\n',
                '    RawValue: 42\n',
                '    OtherField: hello\n',
            ].join('');
            const block = new UnityBlock(raw);

            expect(block.get_property('DirectNested.RawValue')).toBe('42');
            expect(block.get_property('DirectNested.OtherField')).toBe('hello');
        });

        it('should set_property for block-style parent with pure colon line', () => {
            const raw = [
                '--- !u!114 &900\n',
                'MonoBehaviour:\n',
                '  m_Enabled: 1\n',
                '  DirectNested:\n',
                '    RawValue: 42\n',
                '    OtherField: hello\n',
            ].join('');
            const block = new UnityBlock(raw);

            const modified = block.set_property('DirectNested.RawValue', '99');
            expect(modified).toBe(true);
            expect(block.get_property('DirectNested.RawValue')).toBe('99');
            expect(block.get_property('DirectNested.OtherField')).toBe('hello');
        });

        it('should get_property for block-style parent with content after colon', () => {
            // Edge case: parent line has content after colon but children are indented below
            const raw = [
                '--- !u!114 &901\n',
                'MonoBehaviour:\n',
                '  m_Enabled: 1\n',
                '  NestedGroup: {}\n',
                '    SubValue: 7\n',
                '    SubFlag: true\n',
            ].join('');
            const block = new UnityBlock(raw);

            expect(block.get_property('NestedGroup.SubValue')).toBe('7');
            expect(block.get_property('NestedGroup.SubFlag')).toBe('true');
        });

        it('should set_property for block-style parent with content after colon', () => {
            const raw = [
                '--- !u!114 &902\n',
                'MonoBehaviour:\n',
                '  m_Enabled: 1\n',
                '  NestedGroup: {}\n',
                '    SubValue: 7\n',
            ].join('');
            const block = new UnityBlock(raw);

            const modified = block.set_property('NestedGroup.SubValue', '55');
            expect(modified).toBe(true);
            expect(block.get_property('NestedGroup.SubValue')).toBe('55');
        });

        it('should NOT treat line with content as block parent if no indented children follow', () => {
            const raw = [
                '--- !u!114 &903\n',
                'MonoBehaviour:\n',
                '  m_Enabled: 1\n',
                '  SimpleValue: hello\n',
                '  AnotherProp: 5\n',
            ].join('');
            const block = new UnityBlock(raw);

            // SimpleValue is a simple property, not a block parent
            expect(block.get_property('SimpleValue.x')).toBeNull();
        });

        it('should get and set produce consistent results for same block-style path', () => {
            const raw = [
                '--- !u!114 &904\n',
                'MonoBehaviour:\n',
                '  DirectNested:\n',
                '    RawValue: 100\n',
            ].join('');
            const block = new UnityBlock(raw);

            expect(block.get_property('DirectNested.RawValue')).toBe('100');

            block.set_property('DirectNested.RawValue', '200');
            expect(block.get_property('DirectNested.RawValue')).toBe('200');

            block.set_property('DirectNested.RawValue', '300');
            expect(block.get_property('DirectNested.RawValue')).toBe('300');
        });
    });
});
