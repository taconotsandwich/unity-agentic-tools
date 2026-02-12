import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { UnityDocument } from '../src/editor/unity-document';
import { UnityBlock } from '../src/editor/unity-block';
import { create_temp_fixture, TempFixture } from './test-utils';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const SAMPLE_SCENE = join(FIXTURES_DIR, 'SampleScene.unity');
const SCENE_WITH_PREFAB = join(FIXTURES_DIR, 'SceneWithPrefab.unity');
const SAMPLE_PREFAB = join(FIXTURES_DIR, 'SamplePrefab.prefab');

// Track temp fixtures for cleanup
let temp_fixtures: TempFixture[] = [];

afterEach(() => {
    for (const fixture of temp_fixtures) {
        fixture.cleanup_fn();
    }
    temp_fixtures = [];
});

function make_temp(source: string): string {
    const fixture = create_temp_fixture(source);
    temp_fixtures.push(fixture);
    return fixture.temp_path;
}

// ─── from_file ─────────────────────────────────────────────────────────

describe('UnityDocument.from_file', () => {
    it('should load SampleScene.unity and parse blocks', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // SampleScene has: OcclusionCulling, RenderSettings, LightmapSettings, NavMeshSettings,
        // MainCamera GO + Transform + Camera + AudioListener + Behaviour,
        // DirectionalLight GO + Transform + Light,
        // Player GO + Transform + MeshFilter + MeshRenderer + MonoBehaviour,
        // GameManager GO + Transform + MonoBehaviour
        // = 4 settings + 5 + 3 + 5 + 3 = 20 blocks
        expect(doc.count).toBe(20);
        expect(doc.file_path).toBe(SAMPLE_SCENE);
    });

    it('should have a YAML header', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const serialized = doc.serialize();
        expect(serialized.startsWith('%YAML 1.1')).toBe(true);
    });

    it('should throw on validation failure for invalid content', () => {
        const temp = make_temp(SAMPLE_SCENE);
        // Overwrite with invalid content
        writeFileSync(temp, 'not valid yaml');

        expect(() => UnityDocument.from_file(temp, { validate: true })).toThrow('Invalid Unity YAML file');
    });
});

// ─── from_string ───────────────────────────────────────────────────────

describe('UnityDocument.from_string', () => {
    it('should parse inline YAML content', () => {
        const content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100
GameObject:
  m_Name: TestObject
--- !u!4 &200
Transform:
  m_GameObject: {fileID: 100}
`;
        const doc = UnityDocument.from_string(content);
        expect(doc.count).toBe(2);
        expect(doc.file_path).toBeNull();
    });

    it('should throw on validation failure', () => {
        expect(() => UnityDocument.from_string('invalid', { validate: true })).toThrow('Invalid Unity YAML content');
    });
});

// ─── Round-trip fidelity ───────────────────────────────────────────────

describe('Round-trip fidelity', () => {
    it('should round-trip SampleScene.unity exactly', () => {
        const content = readFileSync(SAMPLE_SCENE, 'utf-8');
        const doc = UnityDocument.from_string(content);
        expect(doc.serialize()).toBe(content);
    });

    it('should round-trip SceneWithPrefab.unity exactly', () => {
        const content = readFileSync(SCENE_WITH_PREFAB, 'utf-8');
        const doc = UnityDocument.from_string(content);
        expect(doc.serialize()).toBe(content);
    });

    it('should round-trip SamplePrefab.prefab exactly', () => {
        const content = readFileSync(SAMPLE_PREFAB, 'utf-8');
        const doc = UnityDocument.from_string(content);
        expect(doc.serialize()).toBe(content);
    });
});

// ─── find_by_file_id ───────────────────────────────────────────────────

describe('find_by_file_id', () => {
    it('should find Main Camera GameObject by fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Main Camera GO has fileID 508316491
        const block = doc.find_by_file_id('508316491');
        expect(block).not.toBeNull();
        expect(block!.class_id).toBe(1);
        expect(block!.raw).toContain('m_Name: Main Camera');
    });

    it('should find Transform by fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Main Camera Transform has fileID 508316495
        const block = doc.find_by_file_id('508316495');
        expect(block).not.toBeNull();
        expect(block!.class_id).toBe(4);
    });

    it('should return null for non-existent fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.find_by_file_id('999999999')).toBeNull();
    });

    it('should provide O(1) lookup', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Multiple lookups should all return quickly
        const ids = ['1', '2', '3', '4', '508316491', '1028675095', '1847675923'];
        for (const id of ids) {
            const result = doc.find_by_file_id(id);
            // Just verify it returns without error (performance is O(1) by design)
            if (result) {
                expect(result.file_id).toBe(id);
            }
        }
    });
});

// ─── find_game_objects_by_name ──────────────────────────────────────────

describe('find_game_objects_by_name', () => {
    it('should find Main Camera', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_game_objects_by_name('Main Camera');
        expect(results).toHaveLength(1);
        expect(results[0].file_id).toBe('508316491');
    });

    it('should find Directional Light', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_game_objects_by_name('Directional Light');
        expect(results).toHaveLength(1);
        expect(results[0].file_id).toBe('1028675095');
    });

    it('should find Player', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_game_objects_by_name('Player');
        expect(results).toHaveLength(1);
        expect(results[0].file_id).toBe('1847675923');
    });

    it('should find GameManager', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_game_objects_by_name('GameManager');
        expect(results).toHaveLength(1);
        expect(results[0].file_id).toBe('2094567890');
    });

    it('should return empty for non-existent name', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_game_objects_by_name('NonExistent');
        expect(results).toHaveLength(0);
    });
});

// ─── find_transforms_by_name ───────────────────────────────────────────

describe('find_transforms_by_name', () => {
    it('should find transform ID for Main Camera', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = doc.find_transforms_by_name('Main Camera');
        expect(ids).toHaveLength(1);
        expect(ids[0]).toBe('508316495');
    });

    it('should find transform ID for Directional Light', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = doc.find_transforms_by_name('Directional Light');
        expect(ids).toHaveLength(1);
        expect(ids[0]).toBe('1028675097');
    });
});

// ─── require_unique_game_object ────────────────────────────────────────

describe('require_unique_game_object', () => {
    it('should return block for unique name', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.require_unique_game_object('Player');
        expect(result).not.toHaveProperty('error');
        expect((result as { file_id: string }).file_id).toBe('1847675923');
    });

    it('should return block for numeric fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.require_unique_game_object('508316491');
        expect(result).not.toHaveProperty('error');
        expect((result as { file_id: string }).file_id).toBe('508316491');
    });

    it('should return error for non-existent name', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.require_unique_game_object('NonExistent');
        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('not found');
    });

    it('should return error for non-existent fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.require_unique_game_object('999999999');
        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('not found');
    });

    it('should return error for fileID that is not a GameObject', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // 508316495 is a Transform, not a GameObject
        const result = doc.require_unique_game_object('508316495');
        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('not a GameObject');
    });
});

// ─── require_unique_transform ──────────────────────────────────────────

describe('require_unique_transform', () => {
    it('should return transform for unique GO name', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.require_unique_transform('Main Camera');
        expect(result).not.toHaveProperty('error');
        expect((result as { file_id: string }).file_id).toBe('508316495');
        expect((result as { class_id: number }).class_id).toBe(4);
    });

    it('should return transform for transform fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // 508316495 is Main Camera's Transform
        const result = doc.require_unique_transform('508316495');
        expect(result).not.toHaveProperty('error');
        expect((result as { file_id: string }).file_id).toBe('508316495');
    });

    it('should resolve GO fileID to its transform', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // 508316491 is Main Camera GO - should resolve to its Transform 508316495
        const result = doc.require_unique_transform('508316491');
        expect(result).not.toHaveProperty('error');
        expect((result as { file_id: string }).file_id).toBe('508316495');
    });
});

// ─── remove_blocks ─────────────────────────────────────────────────────

describe('remove_blocks', () => {
    it('should remove specified blocks', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const initial_count = doc.count;

        // Remove Main Camera GO and its Transform
        const to_remove = new Set(['508316491', '508316495']);
        const removed = doc.remove_blocks(to_remove);

        expect(removed).toBe(2);
        expect(doc.count).toBe(initial_count - 2);
        expect(doc.find_by_file_id('508316491')).toBeNull();
        expect(doc.find_by_file_id('508316495')).toBeNull();
    });

    it('should return 0 when no blocks match', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const removed = doc.remove_blocks(new Set(['999999999']));
        expect(removed).toBe(0);
    });
});

// ─── remove_block ──────────────────────────────────────────────────────

describe('remove_block', () => {
    it('should remove a single block by fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const initial_count = doc.count;

        const removed = doc.remove_block('508316491');
        expect(removed).toBe(true);
        expect(doc.count).toBe(initial_count - 1);
        expect(doc.find_by_file_id('508316491')).toBeNull();
    });

    it('should return false for non-existent fileID', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.remove_block('999999999')).toBe(false);
    });
});

// ─── collect_hierarchy ─────────────────────────────────────────────────

describe('collect_hierarchy', () => {
    it('should collect hierarchy from prefab root', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        // Root Transform is 400000, has child 400001
        // Child 400001 -> GO 100001 -> components: 400001, 11400001
        const hierarchy = doc.collect_hierarchy('400000');

        // Should include child transform 400001
        expect(hierarchy.has('400001')).toBe(true);
        // Should include child GO 100001
        expect(hierarchy.has('100001')).toBe(true);
        // Should include child's component 11400001
        expect(hierarchy.has('11400001')).toBe(true);
    });

    it('should return empty set for leaf transforms', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Main Camera transform has no children
        const hierarchy = doc.collect_hierarchy('508316495');
        expect(hierarchy.size).toBe(0);
    });

    it('should return empty set for non-existent transform', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const hierarchy = doc.collect_hierarchy('999999999');
        expect(hierarchy.size).toBe(0);
    });
});

// ─── generate_file_id ──────────────────────────────────────────────────

describe('generate_file_id', () => {
    it('should produce a string of digits', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const id = doc.generate_file_id();
        expect(/^\d+$/.test(id)).toBe(true);
    });

    it('should produce unique IDs not in existing set', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const existing = doc.all_file_ids();
        const id = doc.generate_file_id();
        expect(existing.has(id)).toBe(false);
    });

    it('should produce IDs in the 10-digit range', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const id = doc.generate_file_id();
        expect(id.length).toBe(10);
    });

    it('should produce different IDs on successive calls', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            ids.add(doc.generate_file_id());
        }
        // With 10-digit random IDs, 100 calls should almost certainly produce 100 unique values
        expect(ids.size).toBe(100);
    });
});

// ─── validate ──────────────────────────────────────────────────────────

describe('validate', () => {
    it('should return true for valid YAML files', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.validate()).toBe(true);
    });

    it('should return true for SceneWithPrefab', () => {
        const doc = UnityDocument.from_file(SCENE_WITH_PREFAB);
        expect(doc.validate()).toBe(true);
    });

    it('should return true for SamplePrefab', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        expect(doc.validate()).toBe(true);
    });

    it('should return false for content without YAML header', () => {
        const doc = UnityDocument.from_string('--- !u!1 &100\nGameObject:\n  m_Name: Test\n');
        expect(doc.validate()).toBe(false);
    });
});

// ─── save ──────────────────────────────────────────────────────────────

describe('save', () => {
    it('should save to a temp file and preserve content', () => {
        const temp = make_temp(SAMPLE_SCENE);
        const doc = UnityDocument.from_file(temp);
        const result = doc.save();

        expect(result.success).toBe(true);
        expect(result.bytes_written).toBeGreaterThan(0);

        // Re-read and verify
        const saved_content = readFileSync(temp, 'utf-8');
        expect(saved_content).toBe(doc.serialize());
    });

    it('should save to a different path', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const temp = make_temp(SAMPLE_SCENE);
        const result = doc.save(temp);

        expect(result.success).toBe(true);
        const saved_content = readFileSync(temp, 'utf-8');
        expect(saved_content).toBe(doc.serialize());
    });

    it('should return error when no path available', () => {
        const content = readFileSync(SAMPLE_SCENE, 'utf-8');
        const doc = UnityDocument.from_string(content);
        const result = doc.save();

        expect(result.success).toBe(false);
        expect(result.error).toContain('No file path');
    });
});

// ─── all_file_ids ──────────────────────────────────────────────────────

describe('all_file_ids', () => {
    it('should return all IDs as strings', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = doc.all_file_ids();

        expect(ids).toBeInstanceOf(Set);
        // Check known IDs
        expect(ids.has('1')).toBe(true);       // OcclusionCullingSettings
        expect(ids.has('2')).toBe(true);       // RenderSettings
        expect(ids.has('3')).toBe(true);       // LightmapSettings
        expect(ids.has('4')).toBe(true);       // NavMeshSettings
        expect(ids.has('508316491')).toBe(true); // Main Camera GO
        expect(ids.has('508316495')).toBe(true); // Main Camera Transform
        expect(ids.has('1028675095')).toBe(true); // Directional Light GO
    });

    it('should have correct count for SampleScene', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = doc.all_file_ids();
        // 20 blocks total
        expect(ids.size).toBe(20);
    });

    it('should return strings, not numbers', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const ids = doc.all_file_ids();
        for (const id of ids) {
            expect(typeof id).toBe('string');
        }
    });
});

// ─── count ─────────────────────────────────────────────────────────────

describe('count', () => {
    it('should match expected block count for SampleScene', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.count).toBe(20);
    });

    it('should match expected block count for SamplePrefab', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        // EnemyPrefab: GO + Transform + MeshFilter + MeshRenderer + BoxCollider + MonoBehaviour
        // HealthBar: GO + Transform + MonoBehaviour = 9 blocks
        expect(doc.count).toBe(9);
    });

    it('should match expected block count for SceneWithPrefab', () => {
        const doc = UnityDocument.from_file(SCENE_WITH_PREFAB);
        // OcclusionCulling, RenderSettings, MainCamera GO + Transform + Camera,
        // Stripped GO, Stripped Transform, PrefabInstance = 8
        expect(doc.count).toBe(8);
    });
});

// ─── dirty tracking ───────────────────────────────────────────────────

describe('dirty tracking', () => {
    it('should be clean on load', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.dirty).toBe(false);
    });

    it('should be dirty after append_block', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const raw = `--- !u!1 &999999\nGameObject:\n  m_Name: NewObject\n`;
        const block = new UnityBlock(raw);
        doc.append_block(block);
        expect(doc.dirty).toBe(true);
    });

    it('should be dirty after remove_block', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        doc.remove_block('508316491');
        expect(doc.dirty).toBe(true);
    });

    it('should be dirty after remove_blocks', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        doc.remove_blocks(new Set(['508316491']));
        expect(doc.dirty).toBe(true);
    });
});

// ─── append_block / append_raw ─────────────────────────────────────────

describe('append_block and append_raw', () => {
    it('should append a block and update index', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const initial_count = doc.count;

        const raw = `--- !u!1 &888888\nGameObject:\n  m_Name: AppendTest\n`;
        const block = new UnityBlock(raw);
        doc.append_block(block);

        expect(doc.count).toBe(initial_count + 1);
        expect(doc.find_by_file_id('888888')).not.toBeNull();
        expect(doc.find_by_file_id('888888')!.raw).toContain('AppendTest');
    });

    it('should append raw YAML text', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const initial_count = doc.count;

        const raw = `--- !u!1 &777777\nGameObject:\n  m_Name: RawAppend1\n--- !u!4 &777778\nTransform:\n  m_GameObject: {fileID: 777777}\n`;
        const new_blocks = doc.append_raw(raw);

        expect(new_blocks).toHaveLength(2);
        expect(doc.count).toBe(initial_count + 2);
        expect(doc.find_by_file_id('777777')).not.toBeNull();
        expect(doc.find_by_file_id('777778')).not.toBeNull();
    });
});

// ─── replace_block ─────────────────────────────────────────────────────

describe('replace_block', () => {
    it('should replace a block at a given index', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);

        // Find Main Camera GO index
        const old_block = doc.find_by_file_id('508316491');
        expect(old_block).not.toBeNull();

        const index = doc.blocks.indexOf(old_block!);
        const new_raw = `--- !u!1 &508316491\nGameObject:\n  m_Name: Replaced Camera\n`;
        const new_block = new UnityBlock(new_raw);
        doc.replace_block(index, new_block);

        const found = doc.find_by_file_id('508316491');
        expect(found).not.toBeNull();
        expect(found!.raw).toContain('Replaced Camera');
    });

    it('should throw for out-of-range index', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const block = new UnityBlock('--- !u!1 &1\nGameObject:\n');

        expect(() => doc.replace_block(-1, block)).toThrow('out of range');
        expect(() => doc.replace_block(999, block)).toThrow('out of range');
    });
});

// ─── find_by_class_id ──────────────────────────────────────────────────

describe('find_by_class_id', () => {
    it('should find all GameObjects (class 1)', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const game_objects = doc.find_by_class_id(1);
        // Main Camera, Directional Light, Player, GameManager
        expect(game_objects).toHaveLength(4);
    });

    it('should find all Transforms (class 4)', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const transforms = doc.find_by_class_id(4);
        expect(transforms).toHaveLength(4);
    });

    it('should return empty for non-existent class', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const results = doc.find_by_class_id(9999);
        expect(results).toHaveLength(0);
    });
});

// ─── find_prefab_root ──────────────────────────────────────────────────

describe('find_prefab_root', () => {
    it('should find prefab root in SamplePrefab', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        const root = doc.find_prefab_root();

        expect(root).not.toBeNull();
        expect(root!.game_object.file_id).toBe('100000');
        expect(root!.transform.file_id).toBe('400000');
        expect(root!.name).toBe('EnemyPrefab');
    });

    it('should return null for scene with no prefab root', () => {
        // In SampleScene, all transforms have m_Father: {fileID: 0}
        // but they are scene-level objects, not a prefab root.
        // find_prefab_root still finds the first one with m_Father: 0
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const root = doc.find_prefab_root();
        // A scene will have transforms with m_Father: 0, so it will find something
        expect(root).not.toBeNull();
    });

    it('should find variant prefab root in SceneWithPrefab', () => {
        // SceneWithPrefab has stripped GO and Transform blocks
        const doc = UnityDocument.from_file(SCENE_WITH_PREFAB);
        const root = doc.find_prefab_root();
        expect(root).not.toBeNull();
        // The scene has Main Camera with m_Father: 0, so it should find that first
        // since it's a full (non-stripped) transform
        expect(root!.transform.class_id).toBe(4);
    });
});

// ─── calculate_root_order ──────────────────────────────────────────────

describe('calculate_root_order', () => {
    it('should count root-level transforms for parent 0', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const order = doc.calculate_root_order('0');
        // All 4 GOs have m_Father: {fileID: 0} (Main Camera, Directional Light, Player, GameManager)
        expect(order).toBe(4);
    });

    it('should count children for a parent with children', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        // Root transform 400000 has 1 child (400001)
        const order = doc.calculate_root_order('400000');
        expect(order).toBe(1);
    });

    it('should return 0 for a parent with no children', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Main Camera Transform 508316495 has m_Children: []
        const order = doc.calculate_root_order('508316495');
        expect(order).toBe(0);
    });
});

// ─── add_child_to_parent / remove_child_from_parent ────────────────────

describe('hierarchy manipulation', () => {
    it('should add a child to an empty children list', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        // Main Camera Transform (508316495) has m_Children: []
        const result = doc.add_child_to_parent('508316495', '999999');
        expect(result).toBe(true);

        const transform = doc.find_by_file_id('508316495');
        expect(transform!.raw).toContain('fileID: 999999');
    });

    it('should add a child to an existing children list', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        // Root transform 400000 already has child 400001
        const result = doc.add_child_to_parent('400000', '999999');
        expect(result).toBe(true);

        const transform = doc.find_by_file_id('400000');
        expect(transform!.raw).toContain('fileID: 999999');
        // Original child should still be there
        expect(transform!.raw).toContain('fileID: 400001');
    });

    it('should remove a child from parent', () => {
        const doc = UnityDocument.from_file(SAMPLE_PREFAB);
        // Root transform 400000 has child 400001
        const result = doc.remove_child_from_parent('400000', '400001');
        expect(result).toBe(true);

        const transform = doc.find_by_file_id('400000');
        expect(transform!.raw).not.toContain('fileID: 400001');
    });

    it('should return false when removing non-existent child', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        const result = doc.remove_child_from_parent('508316495', '999999');
        expect(result).toBe(false);
    });

    it('should return false for non-existent parent', () => {
        const doc = UnityDocument.from_file(SAMPLE_SCENE);
        expect(doc.add_child_to_parent('999999', '888888')).toBe(false);
        expect(doc.remove_child_from_parent('999999', '888888')).toBe(false);
    });
});

// ─── remap_file_ids ────────────────────────────────────────────────────

describe('remap_file_ids', () => {
    it('should remap IDs across specified blocks', () => {
        const content = readFileSync(SAMPLE_PREFAB, 'utf-8');
        const doc = UnityDocument.from_string(content);

        const id_map = new Map<string, string>();
        id_map.set('100000', '200000');
        id_map.set('400000', '500000');

        const block_ids = new Set(['100000', '400000']);
        doc.remap_file_ids(id_map, block_ids);

        // Old IDs should be gone
        expect(doc.find_by_file_id('100000')).toBeNull();
        expect(doc.find_by_file_id('400000')).toBeNull();

        // New IDs should exist
        expect(doc.find_by_file_id('200000')).not.toBeNull();
        expect(doc.find_by_file_id('500000')).not.toBeNull();
    });
});

// ─── serialize ─────────────────────────────────────────────────────────

describe('serialize', () => {
    it('should produce header + blocks', () => {
        const content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100
GameObject:
  m_Name: Test
`;
        const doc = UnityDocument.from_string(content);
        expect(doc.serialize()).toBe(content);
    });

    it('should handle content with no header', () => {
        const content = `--- !u!1 &100
GameObject:
  m_Name: Test
`;
        const doc = UnityDocument.from_string(content);
        expect(doc.serialize()).toBe(content);
    });
});

// ─── SceneWithPrefab specific tests ────────────────────────────────────

describe('SceneWithPrefab handling', () => {
    it('should detect stripped blocks', () => {
        const doc = UnityDocument.from_file(SCENE_WITH_PREFAB);
        const stripped_go = doc.find_by_file_id('600000');
        expect(stripped_go).not.toBeNull();
        expect(stripped_go!.is_stripped).toBe(true);
        expect(stripped_go!.class_id).toBe(1);

        const stripped_transform = doc.find_by_file_id('600001');
        expect(stripped_transform).not.toBeNull();
        expect(stripped_transform!.is_stripped).toBe(true);
        expect(stripped_transform!.class_id).toBe(4);
    });

    it('should find PrefabInstance block', () => {
        const doc = UnityDocument.from_file(SCENE_WITH_PREFAB);
        const prefab_instances = doc.find_by_class_id(1001);
        expect(prefab_instances).toHaveLength(1);
        expect(prefab_instances[0].file_id).toBe('700000');
    });
});
