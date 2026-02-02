import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
    parse_editor_build_settings,
    list_build_profiles,
    get_build_settings,
} from '../src/build-settings';

const FIXTURE_PATH = path.resolve(__dirname, '../../test/fixtures/external');
const BUILD_SETTINGS_PATH = path.join(FIXTURE_PATH, 'ProjectSettings', 'EditorBuildSettings.asset');

describe('parse_editor_build_settings', () => {
    it('should parse scenes from EditorBuildSettings.asset', () => {
        const settings = parse_editor_build_settings(BUILD_SETTINGS_PATH);

        expect(settings.scenes).toBeDefined();
        expect(settings.scenes.length).toBe(2);
    });

    it('should parse scene properties correctly', () => {
        const settings = parse_editor_build_settings(BUILD_SETTINGS_PATH);
        const [menu, level] = settings.scenes;

        // First scene: Menu
        expect(menu.enabled).toBe(true);
        expect(menu.path).toBe('Assets/Scenes/Menu.unity');
        expect(menu.guid).toBe('07d404ae2f2e9404ab61c78efb374629');
        expect(menu.buildIndex).toBe(0);

        // Second scene: Level
        expect(level.enabled).toBe(true);
        expect(level.path).toBe('Assets/Scenes/Level.unity');
        expect(level.guid).toBe('8c9cfa26abfee488c85f1582747f6a02');
        expect(level.buildIndex).toBe(1);
    });

    it('should throw for non-existent file', () => {
        expect(() => parse_editor_build_settings('/nonexistent/file.asset')).toThrow(
            'EditorBuildSettings.asset not found'
        );
    });
});

describe('list_build_profiles', () => {
    it('should return empty array for Unity 2022 project', () => {
        const profiles = list_build_profiles(FIXTURE_PATH);

        expect(profiles).toEqual([]);
    });
});

describe('get_build_settings', () => {
    it('should return complete build settings', () => {
        const result = get_build_settings(FIXTURE_PATH);

        // Project info
        expect(result.projectInfo.version.raw).toBe('2022.3.13f1');
        expect(result.projectInfo.isUnity6OrLater).toBe(false);

        // Scenes
        expect(result.editorBuildSettings.scenes.length).toBe(2);

        // Build profiles (empty for Unity 2022)
        expect(result.buildProfiles).toEqual([]);
    });

    it('should have correct scene order', () => {
        const result = get_build_settings(FIXTURE_PATH);
        const scenePaths = result.editorBuildSettings.scenes.map(s => s.path);

        expect(scenePaths).toEqual([
            'Assets/Scenes/Menu.unity',
            'Assets/Scenes/Level.unity',
        ]);
    });
});
