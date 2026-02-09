import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync, cpSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { create_temp_fixture } from './test-utils';
import { isNativeModuleAvailable } from '../src/scanner';

const repo_root = resolve(__dirname, '..');
const fixtures_dir = resolve(__dirname, 'fixtures');
const external_fixtures = resolve(__dirname, '..', '..', 'test', 'fixtures', 'external');

// Skip all tests if native module is not available
const describeIfNative = isNativeModuleAvailable() ? describe : describe.skip;

function run_cli(args: string[]): string {
    return execFileSync('bun', ['dist/cli.js', ...args], {
        cwd: repo_root,
        encoding: 'utf-8'
    });
}

describeIfNative('CLI', () => {
    describe('inspect command', () => {
        it('should output valid JSON', () => {
            const result = run_cli([
                'inspect',
                resolve(fixtures_dir, 'TestSample.unity'),
                'TestObject',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('file_id');
            expect(json).toHaveProperty('active');
        });
    });

    describe('list command', () => {
        it('should list all GameObjects with pagination metadata', () => {
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'TestSample.unity'),
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('total');
            expect(json).toHaveProperty('gameobjects');
            expect(json).toHaveProperty('pageSize');
            expect(json).toHaveProperty('truncated');
            expect(Array.isArray(json.gameobjects)).toBe(true);
        });

        it('should limit results with --page-size', () => {
            // SampleScene has 4 GameObjects; page-size 2 should truncate
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.total).toBe(4);
            expect(json.gameobjects).toHaveLength(2);
            expect(json.truncated).toBe(true);
            expect(json.nextCursor).toBe(2);
            expect(json.pageSize).toBe(2);
        });

        it('should return second page via --cursor', () => {
            // Fetch page 2 (cursor=2, page-size=2)
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2',
                '--cursor', '2',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.total).toBe(4);
            expect(json.gameobjects).toHaveLength(2);
            expect(json.truncated).toBe(false);
            expect(json.cursor).toBe(2);
        });

        it('should return empty page when cursor beyond total', () => {
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--cursor', '999',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.total).toBe(4);
            expect(json.gameobjects).toHaveLength(0);
            expect(json.truncated).toBe(false);
        });

        it('should return compact summary with --summary', () => {
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--summary',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('total_gameobjects', 4);
            expect(json).toHaveProperty('component_counts');
            expect(json.component_counts).toHaveProperty('Transform');
            expect(json).not.toHaveProperty('gameobjects');
        });

        it('should return different objects on page 1 vs page 2', () => {
            const page1 = JSON.parse(run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2', '--cursor', '0', '--json'
            ]));
            const page2 = JSON.parse(run_cli([
                'list',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2', '--cursor', '2', '--json'
            ]));
            const names1 = page1.gameobjects.map((g: any) => g.name);
            const names2 = page2.gameobjects.map((g: any) => g.name);
            // No overlap between pages
            for (const name of names1) {
                expect(names2).not.toContain(name);
            }
            // Together they should cover all 4 objects
            expect(names1.length + names2.length).toBe(4);
        });
    });

    describe('find command', () => {
        it('should find objects by name', () => {
            const result = run_cli([
                'find',
                resolve(fixtures_dir, 'SampleScene.unity'),
                'Player',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('pattern');
            expect(json).toHaveProperty('matches');
            expect(json.matches.length).toBeGreaterThan(0);
        });
    });

    describe('get command', () => {
        it('should return all matching components with -c filter', () => {
            const result = run_cli([
                'get',
                resolve(fixtures_dir, 'Tiny3D.unity'),
                'Directional Light',
                '-c', 'MonoBehaviour',
                '-p',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('components');
            expect(json.components.length).toBe(2);
            expect(json.components.every((c: any) => c.type === 'MonoBehaviour')).toBe(true);
        });

        it('should return single component when only one matches', () => {
            const result = run_cli([
                'get',
                resolve(fixtures_dir, 'SampleScene.unity'),
                'Player',
                '-c', 'Transform',
                '-p',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('components');
            expect(json.components.length).toBe(1);
            expect(json.components[0].type).toBe('Transform');
        });

        it('should fall through to full object when component type not found', () => {
            const result = run_cli([
                'get',
                resolve(fixtures_dir, 'SampleScene.unity'),
                'Player',
                '-c', 'FakeType',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('object');
            expect(json).not.toHaveProperty('components');
        });
    });

    describe('inspect-all command', () => {
        it('should return paginated output', () => {
            const result = run_cli([
                'inspect-all',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('total');
            expect(json).toHaveProperty('truncated', true);
            expect(json.gameobjects).toHaveLength(2);
            expect(json.total).toBe(4);
        });
    });

    describe('inspect command without identifier', () => {
        it('should return paginated output', () => {
            const result = run_cli([
                'inspect',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.total).toBe(4);
            expect(json.gameobjects).toHaveLength(2);
            expect(json.truncated).toBe(true);
        });
    });

    describe('edit command', () => {
        it('should edit a property on a temp copy', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'edit',
                    temp_fixture.temp_path,
                    'Player',
                    'm_IsActive',
                    'false',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('file_path', temp_fixture.temp_path);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('create command', () => {
        it('should create a new GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'create',
                    temp_fixture.temp_path,
                    'NewObject',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('game_object_id');
                expect(json).toHaveProperty('transform_id');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should create a child GameObject with --parent', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'create',
                    temp_fixture.temp_path,
                    'ChildObject',
                    '--parent', 'Player',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('game_object_id');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('edit-transform command', () => {
        it('should edit transform with valid vector', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Player's Transform fileID is known from the fixture
                const listResult = JSON.parse(run_cli([
                    'list', temp_fixture.temp_path, '--json'
                ]));
                const player = listResult.gameobjects.find((g: any) => g.name === 'Player');
                const transformId = player.components.find((c: any) => c.type === 'Transform').fileId;

                const result = run_cli([
                    'edit-transform',
                    temp_fixture.temp_path,
                    transformId,
                    '--position', '1,2,3',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should fail with invalid vector format', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                run_cli([
                    'edit-transform',
                    temp_fixture.temp_path,
                    '999999',
                    '--position', 'not,a,vector',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: any) {
                // CLI exits with error for invalid vector
                expect(err.status).toBeTruthy();
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('add-component command', () => {
        it('should add a component to a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'add-component',
                    temp_fixture.temp_path,
                    'Player',
                    'Rigidbody',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('component_id');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should fail for nonexistent GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'add-component',
                    temp_fixture.temp_path,
                    'NonexistentObject',
                    'Rigidbody',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(false);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('edit-component command', () => {
        it('should edit component by file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Get a component file ID from Player
                const listResult = JSON.parse(run_cli([
                    'list', temp_fixture.temp_path, '--json'
                ]));
                const player = listResult.gameobjects.find((g: any) => g.name === 'Player');
                const transformId = player.components.find((c: any) => c.type === 'Transform').fileId;

                const result = run_cli([
                    'edit-component',
                    temp_fixture.temp_path,
                    transformId,
                    'm_LocalPosition.x',
                    '10',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should fail for invalid file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'edit-component',
                    temp_fixture.temp_path,
                    '999999999',
                    'm_LocalPosition.x',
                    '10',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(false);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('remove-component command', () => {
        it('should remove a component by file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // First add a component, then remove it
                const addResult = JSON.parse(run_cli([
                    'add-component',
                    temp_fixture.temp_path,
                    'Player',
                    'Rigidbody',
                    '--json'
                ]));
                expect(addResult.success).toBe(true);

                const result = run_cli([
                    'remove-component',
                    temp_fixture.temp_path,
                    addResult.component_id,
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('delete command', () => {
        it('should delete a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'delete',
                    temp_fixture.temp_path,
                    'GameManager',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify it's gone
                const listResult = JSON.parse(run_cli([
                    'list', temp_fixture.temp_path, '--json'
                ]));
                const names = listResult.gameobjects.map((g: any) => g.name);
                expect(names).not.toContain('GameManager');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('copy-component command', () => {
        it('should copy a component to another GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Get Camera component from Main Camera
                const listResult = JSON.parse(run_cli([
                    'list', temp_fixture.temp_path, '--json'
                ]));
                const camera = listResult.gameobjects.find((g: any) => g.name === 'Main Camera');
                const cameraComp = camera.components.find((c: any) => c.type === 'Camera');

                const result = run_cli([
                    'copy-component',
                    temp_fixture.temp_path,
                    cameraComp.fileId,
                    'Player',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('duplicate command', () => {
        it('should duplicate a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'duplicate',
                    temp_fixture.temp_path,
                    'Player',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('reparent command', () => {
        it('should reparent a GameObject under another', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'reparent',
                    temp_fixture.temp_path,
                    'GameManager',
                    'Player',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('create-meta command', () => {
        it('should generate a .meta file for a script', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-meta-'));

            try {
                const scriptPath = join(temp_dir, 'TestScript.cs');
                writeFileSync(scriptPath, 'using UnityEngine;\npublic class TestScript : MonoBehaviour { }');

                const result = run_cli([
                    'create-meta',
                    scriptPath,
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(existsSync(scriptPath + '.meta')).toBe(true);
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });
    });

    describe('create-scene command', () => {
        it('should create a minimal scene', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-scene-'));

            try {
                const scenePath = join(temp_dir, 'New.unity');
                const result = run_cli([
                    'create-scene',
                    scenePath,
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(existsSync(scenePath)).toBe(true);

                const content = readFileSync(scenePath, 'utf-8');
                expect(content.startsWith('%YAML 1.1')).toBe(true);
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });

        it('should create a scene with defaults (camera + light)', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-scene-'));

            try {
                const scenePath = join(temp_dir, 'WithDefaults.unity');
                const result = run_cli([
                    'create-scene',
                    scenePath,
                    '--defaults',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                const content = readFileSync(scenePath, 'utf-8');
                expect(content).toContain('Camera');
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });
    });

    describe('settings commands via CLI', () => {
        it('should read settings from a project', () => {
            const result = run_cli([
                'read-settings',
                external_fixtures,
                '--setting', 'tags',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.data).toHaveProperty('tags');
        });

        it('should add a tag via edit-tag', () => {
            // Copy fixtures to temp to avoid mutating originals
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-settings-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'edit-tag',
                    temp_dir,
                    'add',
                    'CLITestTag',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the tag was added
                const readResult = JSON.parse(run_cli([
                    'read-settings', temp_dir, '--setting', 'tags', '--json'
                ]));
                expect(readResult.data.tags).toContain('CLITestTag');
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });

        it('should set a layer via edit-layer', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-settings-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'edit-layer',
                    temp_dir,
                    '8',
                    'CLITestLayer',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });
    });

    describe('search and grep commands', () => {
        it('should search by name across project files', () => {
            const result = run_cli([
                'search',
                external_fixtures,
                '--name', 'Camera',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBeGreaterThanOrEqual(0);
        });

        it('should grep for a pattern in project files', () => {
            const result = run_cli([
                'grep',
                external_fixtures,
                'm_Name',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBeGreaterThan(0);
        });
    });
});
