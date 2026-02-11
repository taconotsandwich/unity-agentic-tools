import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve, join } from 'path';
import { readFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { read_settings, edit_settings, edit_tag, edit_layer, edit_sorting_layer } from '../src/settings';
import type { TagManagerData, PhysicsData, QualitySettingsData, TimeSettingsData } from '../src/types';

// Root-level fixtures have the full Unity project structure
const EXTERNAL_FIXTURES = resolve(__dirname, '..', '..', 'test', 'fixtures', 'external');

function create_temp_project(): { project_path: string; cleanup: () => void } {
    const temp_dir = join(tmpdir(), `unity-settings-test-${Date.now()}`);
    mkdirSync(join(temp_dir, 'ProjectSettings'), { recursive: true });

    // Copy all ProjectSettings .asset files
    const src_dir = join(EXTERNAL_FIXTURES, 'ProjectSettings');
    if (existsSync(src_dir)) {
        cpSync(src_dir, join(temp_dir, 'ProjectSettings'), { recursive: true });
    }

    return {
        project_path: temp_dir,
        cleanup: () => rmSync(temp_dir, { recursive: true, force: true }),
    };
}

describe('Settings Reader', () => {
    describe('read_settings', () => {
        it('should read TagManager with tags and layers', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'TagManager',
            });

            expect(result.success).toBe(true);
            const data = result.data as TagManagerData;
            expect(data.tags).toEqual(['killzone', 'Coin']);
            expect(data.layers.length).toBeGreaterThanOrEqual(6);
            // Verify specific named layers
            expect(data.layers).toContainEqual({ index: 0, name: 'Default' });
            expect(data.layers).toContainEqual({ index: 1, name: 'TransparentFX' });
            expect(data.layers).toContainEqual({ index: 2, name: 'Ignore Raycast' });
            expect(data.layers).toContainEqual({ index: 3, name: 'ground' });
            expect(data.layers).toContainEqual({ index: 5, name: 'UI' });
            expect(data.layers).toContainEqual({ index: 6, name: 'CameraBounds' });
        });

        it('should read TagManager sorting layers', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'TagManager',
            });

            const data = result.data as TagManagerData;
            expect(data.sorting_layers).toHaveLength(8);
            expect(data.sorting_layers[0]).toEqual({ name: 'Default', unique_id: 0, locked: 0 });
            expect(data.sorting_layers[1].name).toBe('Background');
            expect(data.sorting_layers[7].name).toBe('Player');
        });

        it('should read DynamicsManager physics settings', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'DynamicsManager',
            });

            expect(result.success).toBe(true);
            const data = result.data as PhysicsData;
            expect(data.gravity).toEqual({ x: 0, y: -9.81, z: 0 });
            expect(data.default_solver_iterations).toBe(6);
            expect(data.default_contact_offset).toBe(0.01);
            expect(data.bounce_threshold).toBe(2);
        });

        it('should read QualitySettings with quality levels', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'QualitySettings',
            });

            expect(result.success).toBe(true);
            const data = result.data as QualitySettingsData;
            expect(data.current_quality).toBe(5);
            expect(data.quality_levels).toHaveLength(6);
            expect(data.quality_levels[0].name).toBe('Very Low');
            expect(data.quality_levels[5].name).toBe('Ultra');
        });

        it('should read TimeManager settings', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'TimeManager',
            });

            expect(result.success).toBe(true);
            const data = result.data as TimeSettingsData;
            expect(data.fixed_timestep).toBe(0.02);
            expect(data.max_timestep).toBeCloseTo(0.33333334);
            expect(data.time_scale).toBe(1);
        });

        it('should resolve "physics" alias to DynamicsManager', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'physics',
            });

            expect(result.success).toBe(true);
            expect(result.setting).toBe('DynamicsManager');
        });

        it('should resolve "tags" alias to TagManager', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'tags',
            });

            expect(result.success).toBe(true);
            expect(result.setting).toBe('TagManager');
        });

        it('should return error for nonexistent setting', () => {
            const result = read_settings({
                project_path: EXTERNAL_FIXTURES,
                setting: 'NonExistentSetting',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });
});

describe('Settings Editor', () => {
    let temp: { project_path: string; cleanup: () => void };

    beforeEach(() => {
        temp = create_temp_project();
    });

    afterEach(() => {
        temp.cleanup();
    });

    describe('edit_tag', () => {
        it('should add a new tag', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'add',
                tag: 'NewTag',
            });

            expect(result.success).toBe(true);

            // Verify tag is in file
            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            expect(data.tags).toContain('NewTag');
        });

        it('should remove an existing tag', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'remove',
                tag: 'killzone',
            });

            expect(result.success).toBe(true);

            // Verify tag is removed
            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            expect(data.tags).not.toContain('killzone');
            expect(data.tags).toContain('Coin'); // other tags preserved
        });

        it('should reject duplicate tag', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'add',
                tag: 'killzone',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });

        it('should reject removing nonexistent tag', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'remove',
                tag: 'DoesNotExist',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should reject tag with forward slashes', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'add',
                tag: 'Bad/Tag',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('forward slashes');
        });

        it('should reject tag with newlines', () => {
            const result = edit_tag({
                project_path: temp.project_path,
                action: 'add',
                tag: 'Bad\nTag',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('newlines');
        });
    });

    describe('edit_layer', () => {
        it('should set a layer by index', () => {
            const result = edit_layer({
                project_path: temp.project_path,
                index: 7,
                name: 'PostProcessing',
            });

            expect(result.success).toBe(true);

            // Verify layer is set
            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            expect(data.layers).toContainEqual({ index: 7, name: 'PostProcessing' });
        });

        it('should reject reserved layer index 0 (Default)', () => {
            const result = edit_layer({
                project_path: temp.project_path,
                index: 0,
                name: 'MyLayer',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('reserved');
            expect(result.error).toContain('Default');
        });

        it('should reject reserved layer index 4 (Water)', () => {
            const result = edit_layer({
                project_path: temp.project_path,
                index: 4,
                name: 'MyLayer',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('reserved');
            expect(result.error).toContain('Water');
        });

        it('should allow editing builtin slot 3 (unnamed)', () => {
            const result = edit_layer({
                project_path: temp.project_path,
                index: 3,
                name: 'CustomLayer',
            });

            expect(result.success).toBe(true);

            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            expect(data.layers).toContainEqual({ index: 3, name: 'CustomLayer' });
        });

        it('should reject out-of-range index', () => {
            const result = edit_layer({
                project_path: temp.project_path,
                index: 32,
                name: 'MyLayer',
            });

            expect(result.success).toBe(false);
        });

        it('should reject layer name with invalid characters', () => {
            const newline = edit_layer({
                project_path: temp.project_path,
                index: 8,
                name: 'Bad\nLayer',
            });
            expect(newline.success).toBe(false);
            expect(newline.error).toContain('newline');

            const slash = edit_layer({
                project_path: temp.project_path,
                index: 8,
                name: 'Bad/Layer',
            });
            expect(slash.success).toBe(false);
            expect(slash.error).toContain('forward slash');
        });
    });

    describe('edit_sorting_layer', () => {
        it('should add a new sorting layer', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'add',
                name: 'Foreground',
            });

            expect(result.success).toBe(true);

            // Verify sorting layer exists
            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            const found = data.sorting_layers.find(sl => sl.name === 'Foreground');
            expect(found).toBeDefined();
            expect(found!.unique_id).toBeGreaterThan(0);
        });

        it('should remove a sorting layer', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'remove',
                name: 'Background',
            });

            expect(result.success).toBe(true);

            // Verify sorting layer is removed
            const verify = read_settings({ project_path: temp.project_path, setting: 'TagManager' });
            const data = verify.data as TagManagerData;
            expect(data.sorting_layers.find(sl => sl.name === 'Background')).toBeUndefined();
            // Other layers preserved
            expect(data.sorting_layers.find(sl => sl.name === 'Default')).toBeDefined();
        });

        it('should reject duplicate sorting layer', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'add',
                name: 'Default',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });

        it('should reject empty sorting layer name', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'add',
                name: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('cannot be empty');
        });

        it('should reject whitespace-only sorting layer name', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'add',
                name: '   ',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('cannot be empty');
        });
    });

    describe('edit_settings (generic)', () => {
        it('should edit a property in DynamicsManager', () => {
            const result = edit_settings({
                project_path: temp.project_path,
                setting: 'DynamicsManager',
                property: 'm_Gravity',
                value: '{x: 0, y: -20, z: 0}',
            });

            expect(result.success).toBe(true);

            // Verify the change
            const verify = read_settings({ project_path: temp.project_path, setting: 'DynamicsManager' });
            const data = verify.data as PhysicsData;
            expect(data.gravity.y).toBe(-20);
        });

        it('should return error for nonexistent property', () => {
            const result = edit_settings({
                project_path: temp.project_path,
                setting: 'DynamicsManager',
                property: 'NonExistentProp',
                value: '42',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should resolve snake_case property names for TimeManager (Bug #7)', () => {
            const result = edit_settings({
                project_path: temp.project_path,
                setting: 'TimeManager',
                property: 'time_scale',
                value: '2',
            });

            expect(result.success).toBe(true);

            // Verify the change
            const verify = read_settings({ project_path: temp.project_path, setting: 'TimeManager' });
            const data = verify.data as TimeSettingsData;
            expect(data.time_scale).toBe(2);
        });
    });

    describe('Bug #6: Default sorting layer protection', () => {
        it('should refuse to remove Default sorting layer', () => {
            const result = edit_sorting_layer({
                project_path: temp.project_path,
                action: 'remove',
                name: 'Default',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot remove the Default sorting layer');
        });
    });
});
