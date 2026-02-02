import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../dist/cli.js');
const FIXTURE_PATH = path.resolve(__dirname, '../../test/fixtures/external');
const TEST_PROJECT_PATH = path.resolve(__dirname, '../.test-project-cli');

function runCli(args: string): string {
    return execSync(`bun ${CLI_PATH} ${args}`, { encoding: 'utf-8' });
}

describe('CLI', () => {
    describe('version command', () => {
        it('should output version info', () => {
            const output = runCli(`version "${FIXTURE_PATH}"`);

            expect(output).toContain('Unity Version: 2022.3.13f1');
            expect(output).toContain('Unity 6+: No');
            expect(output).toContain('Build Profiles: No');
        });

        it('should output JSON with --json flag', () => {
            const output = runCli(`version "${FIXTURE_PATH}" --json`);
            const json = JSON.parse(output);

            expect(json.version.raw).toBe('2022.3.13f1');
            expect(json.isUnity6OrLater).toBe(false);
        });
    });

    describe('scenes command', () => {
        it('should list scenes', () => {
            const output = runCli(`scenes "${FIXTURE_PATH}"`);

            expect(output).toContain('Build Scenes');
            expect(output).toContain('Menu.unity');
            expect(output).toContain('Level.unity');
        });

        it('should output JSON with --json flag', () => {
            const output = runCli(`scenes "${FIXTURE_PATH}" --json`);
            const json = JSON.parse(output);

            expect(json.length).toBe(2);
            expect(json[0].path).toBe('Assets/Scenes/Menu.unity');
            expect(json[1].path).toBe('Assets/Scenes/Level.unity');
        });
    });

    describe('profiles command', () => {
        it('should indicate no build profiles for Unity 2022', () => {
            const output = runCli(`profiles "${FIXTURE_PATH}"`);

            expect(output).toContain('Build Profiles are only available in Unity 6+');
        });
    });

    describe('info command', () => {
        it('should show complete info', () => {
            const output = runCli(`info "${FIXTURE_PATH}"`);

            expect(output).toContain('Unity Project Info');
            expect(output).toContain('Version: 2022.3.13f1');
            expect(output).toContain('Build Scenes');
            expect(output).toContain('Menu.unity');
        });

        it('should output JSON with --json flag', () => {
            const output = runCli(`info "${FIXTURE_PATH}" --json`);
            const json = JSON.parse(output);

            expect(json.projectInfo.version.raw).toBe('2022.3.13f1');
            expect(json.editorBuildSettings.scenes.length).toBe(2);
            expect(json.buildProfiles).toEqual([]);
        });
    });

    describe('help', () => {
        it('should show help', () => {
            const output = runCli('--help');

            expect(output).toContain('Unity Build Settings CLI');
            expect(output).toContain('version <project-path>');
            expect(output).toContain('scenes <project-path>');
        });
    });
});

// Edit command CLI tests (use isolated test project)
describe('CLI Edit Commands', () => {
    beforeEach(() => {
        // Create a test copy of the project
        fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'ProjectSettings'), { recursive: true });
        fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'Assets', 'Scenes'), { recursive: true });

        // Copy EditorBuildSettings.asset
        fs.copyFileSync(
            path.join(FIXTURE_PATH, 'ProjectSettings', 'EditorBuildSettings.asset'),
            path.join(TEST_PROJECT_PATH, 'ProjectSettings', 'EditorBuildSettings.asset')
        );

        // Copy ProjectVersion.txt
        fs.copyFileSync(
            path.join(FIXTURE_PATH, 'ProjectSettings', 'ProjectVersion.txt'),
            path.join(TEST_PROJECT_PATH, 'ProjectSettings', 'ProjectVersion.txt')
        );

        // Create dummy scene files with .meta files
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
        fs.rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
    });

    describe('add-scene', () => {
        it('should add a scene via CLI', () => {
            const output = runCli(`add-scene "${TEST_PROJECT_PATH}" Assets/Scenes/NewScene.unity`);

            expect(output).toContain('Success');
            expect(output).toContain('Added scene');
            expect(output).toContain('NewScene.unity');
        });

        it('should add scene with --json flag', () => {
            const output = runCli(`add-scene "${TEST_PROJECT_PATH}" Assets/Scenes/NewScene.unity --json`);
            const json = JSON.parse(output);

            expect(json.success).toBe(true);
            expect(json.scenes.length).toBe(3);
        });
    });

    describe('remove-scene', () => {
        it('should remove a scene via CLI', () => {
            const output = runCli(`remove-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Level.unity`);

            expect(output).toContain('Success');
            expect(output).toContain('Removed scene');
        });
    });

    describe('enable-scene / disable-scene', () => {
        it('should disable a scene via CLI', () => {
            const output = runCli(`disable-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Menu.unity`);

            expect(output).toContain('Success');
            expect(output).toContain('Disabled');
        });

        it('should enable a scene via CLI', () => {
            // First disable
            runCli(`disable-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Menu.unity`);

            // Then enable
            const output = runCli(`enable-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Menu.unity`);

            expect(output).toContain('Success');
            expect(output).toContain('Enabled');
        });
    });

    describe('move-scene', () => {
        it('should move a scene via CLI', () => {
            const output = runCli(`move-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Level.unity 0`);

            expect(output).toContain('Success');
            expect(output).toContain('Moved scene');
        });

        it('should output JSON with --json flag', () => {
            const output = runCli(`move-scene "${TEST_PROJECT_PATH}" Assets/Scenes/Level.unity 0 --json`);
            const json = JSON.parse(output);

            expect(json.success).toBe(true);
            expect(json.scenes[0].path).toBe('Assets/Scenes/Level.unity');
        });
    });

    describe('reorder-scenes', () => {
        it('should reorder scenes via CLI', () => {
            const output = runCli(
                `reorder-scenes "${TEST_PROJECT_PATH}" "Assets/Scenes/Level.unity,Assets/Scenes/Menu.unity"`
            );

            expect(output).toContain('Success');
            expect(output).toContain('Reordered');
        });
    });
});
