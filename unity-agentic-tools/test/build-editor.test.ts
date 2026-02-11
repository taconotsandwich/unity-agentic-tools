import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    add_scene,
    remove_scene,
    enable_scene,
    disable_scene,
    move_scene,
    reorder_scenes,
} from '../src/build-editor';
import { parse_editor_build_settings } from '../src/build-settings';

// Use a copy of the fixture for edit tests
const FIXTURE_PATH = path.resolve(__dirname, '../../test/fixtures/external');
const TEST_PROJECT_PATH = path.resolve(__dirname, '../.test-project');
const BUILD_SETTINGS_PATH = path.join(TEST_PROJECT_PATH, 'ProjectSettings', 'EditorBuildSettings.asset');

// Original content for restoration
let originalContent: string;

beforeEach(() => {
    // Create a test copy of the project
    fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'ProjectSettings'), { recursive: true });
    fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'Assets', 'Scenes'), { recursive: true });

    // Copy EditorBuildSettings.asset
    const srcBuildSettings = path.join(FIXTURE_PATH, 'ProjectSettings', 'EditorBuildSettings.asset');
    originalContent = fs.readFileSync(srcBuildSettings, 'utf-8');
    fs.writeFileSync(BUILD_SETTINGS_PATH, originalContent);

    // Copy ProjectVersion.txt
    const srcVersion = path.join(FIXTURE_PATH, 'ProjectSettings', 'ProjectVersion.txt');
    fs.copyFileSync(srcVersion, path.join(TEST_PROJECT_PATH, 'ProjectSettings', 'ProjectVersion.txt'));

    // Create dummy scene files with .meta files (32-char hex GUIDs)
    const sceneGuids: Record<string, string> = {
        'Menu.unity': '07d404ae2f2e9404ab61c78efb374629',
        'Level.unity': '8c9cfa26abfee488c85f1582747f6a02',
        'NewScene.unity': 'aabbccdd11223344556677889900aabb',
    };
    for (const [scene, guid] of Object.entries(sceneGuids)) {
        const scenePath = path.join(TEST_PROJECT_PATH, 'Assets', 'Scenes', scene);
        fs.writeFileSync(scenePath, '%YAML 1.1\n--- !u!1 &1\n');
        fs.writeFileSync(scenePath + '.meta', `fileFormatVersion: 2\nguid: ${guid}\n`);
    }
});

afterEach(() => {
    // Clean up test project
    fs.rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
});

describe('add_scene', () => {
    it('should add a new scene to build settings', () => {
        const result = add_scene(TEST_PROJECT_PATH, 'Assets/Scenes/NewScene.unity');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Added scene');
        expect(result.scenes?.length).toBe(3);
        expect(result.scenes?.[2].path).toBe('Assets/Scenes/NewScene.unity');
    });

    it('should add scene at specific position', () => {
        const result = add_scene(TEST_PROJECT_PATH, 'Assets/Scenes/NewScene.unity', { position: 0 });

        expect(result.success).toBe(true);
        expect(result.scenes?.[0].path).toBe('Assets/Scenes/NewScene.unity');
    });

    it('should add scene as disabled', () => {
        const result = add_scene(TEST_PROJECT_PATH, 'Assets/Scenes/NewScene.unity', { enabled: false });

        expect(result.success).toBe(true);
        expect(result.scenes?.[2].enabled).toBe(false);
    });

    it('should fail for non-existent scene', () => {
        const result = add_scene(TEST_PROJECT_PATH, 'Assets/Scenes/NonExistent.unity');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });

    it('should fail for duplicate scene', () => {
        const result = add_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity');

        expect(result.success).toBe(false);
        expect(result.message).toContain('already in build settings');
    });
});

describe('remove_scene', () => {
    it('should remove a scene from build settings', () => {
        const result = remove_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Level.unity');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Removed scene');
        expect(result.scenes?.length).toBe(1);
        expect(result.scenes?.[0].path).toBe('Assets/Scenes/Menu.unity');
    });

    it('should fail for non-existent scene in build settings', () => {
        const result = remove_scene(TEST_PROJECT_PATH, 'Assets/Scenes/NonExistent.unity');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });
});

describe('enable_scene / disable_scene', () => {
    it('should disable a scene', () => {
        const result = disable_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Disabled');

        const updated = parse_editor_build_settings(BUILD_SETTINGS_PATH);
        const menu = updated.scenes.find(s => s.path === 'Assets/Scenes/Menu.unity');
        expect(menu?.enabled).toBe(false);
    });

    it('should enable a disabled scene', () => {
        // First disable
        disable_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity');

        // Then enable
        const result = enable_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Enabled');

        const updated = parse_editor_build_settings(BUILD_SETTINGS_PATH);
        const menu = updated.scenes.find(s => s.path === 'Assets/Scenes/Menu.unity');
        expect(menu?.enabled).toBe(true);
    });

    it('should handle already enabled scene gracefully', () => {
        const result = enable_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity');

        expect(result.success).toBe(true);
        expect(result.message).toContain('already enabled');
    });
});

describe('move_scene', () => {
    it('should move scene to new position', () => {
        const result = move_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Level.unity', 0);

        expect(result.success).toBe(true);
        expect(result.scenes?.[0].path).toBe('Assets/Scenes/Level.unity');
        expect(result.scenes?.[1].path).toBe('Assets/Scenes/Menu.unity');
    });

    it('should re-enable a disabled scene when moved', () => {
        // First disable the scene
        disable_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Level.unity');

        // Now move it to position 0
        const result = move_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Level.unity', 0);

        expect(result.success).toBe(true);
        const movedScene = result.scenes?.find(s => s.path === 'Assets/Scenes/Level.unity');
        expect(movedScene?.enabled).toBe(true);
        expect(movedScene?.buildIndex).toBeGreaterThanOrEqual(0);
    });

    it('should fail for invalid position', () => {
        const result = move_scene(TEST_PROJECT_PATH, 'Assets/Scenes/Menu.unity', 99);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid position');
    });
});

describe('reorder_scenes', () => {
    it('should reorder all scenes', () => {
        const result = reorder_scenes(TEST_PROJECT_PATH, [
            'Assets/Scenes/Level.unity',
            'Assets/Scenes/Menu.unity',
        ]);

        expect(result.success).toBe(true);
        expect(result.scenes?.[0].path).toBe('Assets/Scenes/Level.unity');
        expect(result.scenes?.[1].path).toBe('Assets/Scenes/Menu.unity');
    });

    it('should fail if scene is missing from new order', () => {
        const result = reorder_scenes(TEST_PROJECT_PATH, ['Assets/Scenes/Menu.unity']);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Missing scene');
    });

    it('should fail if unknown scene in new order', () => {
        const result = reorder_scenes(TEST_PROJECT_PATH, [
            'Assets/Scenes/Menu.unity',
            'Assets/Scenes/Level.unity',
            'Assets/Scenes/Unknown.unity',
        ]);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown scene');
    });
});
