import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync, cpSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { create_temp_fixture } from './test-utils';
import { isNativeModuleAvailable } from '../src/scanner';

const repo_root = resolve(__dirname, '..');
const fixtures_dir = resolve(__dirname, 'fixtures');
const external_fixtures = resolve(__dirname, '..', '..', 'test', 'fixtures', 'external');

// Skip all tests if native module is not available
const describeIfNative = isNativeModuleAvailable() ? describe : describe.skip;

interface GameObjectEntry {
    name: string;
    components?: ComponentEntry[];
}

interface ComponentEntry {
    type: string;
    fileId: string;
    properties?: Record<string, unknown>;
}

function run_cli(args: string[], cwd: string = repo_root): string {
    return execFileSync('bun', [resolve(repo_root, 'dist/cli.js'), ...args], {
        cwd,
        encoding: 'utf-8'
    });
}

describeIfNative('CLI', () => {
    describe('read gameobject command', () => {
        it('should output valid JSON with file and object wrapper', () => {
            const result = run_cli([
                'read', 'gameobject',
                resolve(fixtures_dir, 'TestSample.unity'),
                'TestObject',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('object');
            expect(json.object).toHaveProperty('name');
            expect(json.object).toHaveProperty('file_id');
            expect(json.object).toHaveProperty('active');
        });

        it('should return all matching components with -c filter', () => {
            const result = run_cli([
                'read', 'gameobject',
                resolve(fixtures_dir, 'Tiny3D.unity'),
                'Directional Light',
                '-c', 'MonoBehaviour',
                '-p',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('components');
            expect(json.components.length).toBe(2);
            expect(json.components.every((c: ComponentEntry) => c.type === 'MonoBehaviour')).toBe(true);
        });

        it('should return single component when only one matches', () => {
            const result = run_cli([
                'read', 'gameobject',
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

        it('should return error when component type not found', () => {
            try {
                run_cli([
                    'read', 'gameobject',
                    resolve(fixtures_dir, 'SampleScene.unity'),
                    'Player',
                    '-c', 'FakeType',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json).toHaveProperty('error');
                expect(json.error).toContain('No component of type "FakeType"');
            }
        });
    });

    describe('read scene command', () => {
        it('should list all GameObjects with pagination metadata', () => {
            const result = run_cli([
                'read', 'scene',
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
                'read', 'scene',
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
                'read', 'scene',
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
                'read', 'scene',
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
                'read', 'scene',
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
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2', '--cursor', '0', '--json'
            ]));
            const page2 = JSON.parse(run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2', '--cursor', '2', '--json'
            ]));
            const names1 = page1.gameobjects.map((g: GameObjectEntry) => g.name);
            const names2 = page2.gameobjects.map((g: GameObjectEntry) => g.name);
            // No overlap between pages
            for (const name of names1) {
                expect(names2).not.toContain(name);
            }
            // Together they should cover all 4 objects
            expect(names1.length + names2.length).toBe(4);
        });
    });

    describe('search command (file mode)', () => {
        it('should find objects by name in a file', () => {
            const result = run_cli([
                'search',
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

    describe('read scene --properties command', () => {
        it('should include component properties when --properties is set', () => {
            const result = run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--properties',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('gameobjects');
            expect(json.gameobjects.length).toBeGreaterThan(0);
            // With --properties, components should have property data
            const go = json.gameobjects.find((g: GameObjectEntry) =>
                g.components?.some((c: ComponentEntry) => c.properties)
            );
            expect(go).toBeTruthy();
        });
    });

    describe('update gameobject command', () => {
        it('should edit a property on a temp copy', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'update', 'gameobject',
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

    describe('create gameobject command', () => {
        it('should create a new GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'create', 'gameobject',
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
                    'create', 'gameobject',
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

    describe('update transform command', () => {
        it('should edit transform with valid vector', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Player's Transform fileID is known from the fixture
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path, '--json'
                ]));
                const player = listResult.gameobjects.find((g: GameObjectEntry) => g.name === 'Player');
                const transformId = player.components.find((c: ComponentEntry) => c.type === 'Transform').fileId;

                const result = run_cli([
                    'update', 'transform',
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
                    'update', 'transform',
                    temp_fixture.temp_path,
                    '999999',
                    '--position', 'not,a,vector',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                const execErr = err as { status: number };
                // CLI exits with error for invalid vector
                expect(execErr.status).toBeTruthy();
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('create component command', () => {
        it('should add a component to a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'create', 'component',
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
                try {
                    run_cli([
                        'create', 'component',
                        temp_fixture.temp_path,
                        'NonexistentObject',
                        'Rigidbody',
                        '--json'
                    ]);
                    throw new Error('Expected non-zero exit code');
                } catch (err: unknown) {
                    if (err instanceof Error && err.message === 'Expected non-zero exit code') throw err;
                    const execErr = err as { status: number; stdout: string };
                    expect(execErr.status).toBe(1);
                    const json = JSON.parse(execErr.stdout);
                    expect(json.success).toBe(false);
                }
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('update component command', () => {
        it('should edit component by file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Get a component file ID from Player
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path, '--json'
                ]));
                const player = listResult.gameobjects.find((g: GameObjectEntry) => g.name === 'Player');
                const transformId = player.components.find((c: ComponentEntry) => c.type === 'Transform').fileId;

                const result = run_cli([
                    'update', 'component',
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
                try {
                    run_cli([
                        'update', 'component',
                        temp_fixture.temp_path,
                        '999999999',
                        'm_LocalPosition.x',
                        '10',
                        '--json'
                    ]);
                    throw new Error('Expected non-zero exit code');
                } catch (err: unknown) {
                    if (err instanceof Error && err.message === 'Expected non-zero exit code') throw err;
                    const execErr = err as { status: number; stdout: string };
                    expect(execErr.status).toBe(1);
                    const json = JSON.parse(execErr.stdout);
                    expect(json.success).toBe(false);
                }
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('delete component command', () => {
        it('should remove a component by file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // First add a component, then remove it
                const addResult = JSON.parse(run_cli([
                    'create', 'component',
                    temp_fixture.temp_path,
                    'Player',
                    'Rigidbody',
                    '--json'
                ]));
                expect(addResult.success).toBe(true);

                const result = run_cli([
                    'delete', 'component',
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

    describe('delete gameobject command', () => {
        it('should delete a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'delete', 'gameobject',
                    temp_fixture.temp_path,
                    'GameManager',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify it's gone
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path, '--json'
                ]));
                const names = listResult.gameobjects.map((g: GameObjectEntry) => g.name);
                expect(names).not.toContain('GameManager');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('create component-copy command', () => {
        it('should copy a component to another GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Get Camera component from Main Camera
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path, '--json'
                ]));
                const camera = listResult.gameobjects.find((g: GameObjectEntry) => g.name === 'Main Camera');
                const cameraComp = camera.components.find((c: ComponentEntry) => c.type === 'Camera');

                const result = run_cli([
                    'create', 'component-copy',
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

    describe('clone command', () => {
        it('should duplicate a GameObject', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'clone',
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

    describe('update parent command', () => {
        it('should reparent a GameObject under another', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'update', 'parent',
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

    describe('create meta command', () => {
        it('should generate a .meta file for a script', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-meta-'));

            try {
                const scriptPath = join(temp_dir, 'TestScript.cs');
                writeFileSync(scriptPath, 'using UnityEngine;\npublic class TestScript : MonoBehaviour { }');

                const result = run_cli([
                    'create', 'meta',
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

    describe('create scene command', () => {
        it('should create a minimal scene', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-scene-'));

            try {
                const scenePath = join(temp_dir, 'New.unity');
                const result = run_cli([
                    'create', 'scene',
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
                    'create', 'scene',
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
                'read', 'settings',
                '--project', external_fixtures,
                '--setting', 'tags',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.data).toHaveProperty('tags');
        });

        it('should add a tag via update tag', () => {
            // Copy fixtures to temp to avoid mutating originals
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-settings-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'update', 'tag',
                    '--project', temp_dir,
                    'add',
                    'CLITestTag',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the tag was added
                const readResult = JSON.parse(run_cli([
                    'read', 'settings', '--project', temp_dir, '--setting', 'tags', '--json'
                ]));
                expect(readResult.data.tags).toContain('CLITestTag');
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });

        it('should set a layer via update layer', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-settings-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'update', 'layer',
                    '--project', temp_dir,
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

        it('should default read settings to cwd project', () => {
            const result = run_cli([
                'read', 'settings',
                '--setting', 'tags',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json).toHaveProperty('project_path', external_fixtures);
        });

        it('should default update tag to cwd project', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-settings-cwd-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'update', 'tag',
                    'add',
                    'CLITestTagCwd',
                    '--json'
                ], temp_dir);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                const readResult = JSON.parse(run_cli([
                    'read', 'settings', '--setting', 'tags', '--json'
                ], temp_dir));
                expect(readResult.data.tags).toContain('CLITestTagCwd');
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });

        it('should default update layer to cwd project', () => {
            const temp_dir = mkdtempSync(join(tmpdir(), 'cli-layer-cwd-'));
            const settingsDir = join(temp_dir, 'ProjectSettings');
            cpSync(join(external_fixtures, 'ProjectSettings'), settingsDir, { recursive: true });

            try {
                const result = run_cli([
                    'update', 'layer',
                    '8',
                    'CLITestLayerCwd',
                    '--json'
                ], temp_dir);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                rmSync(temp_dir, { recursive: true, force: true });
            }
        });

        it('should default read build to cwd project', () => {
            const result = run_cli([
                'read', 'build',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('projectInfo');
            expect(json.projectInfo).toHaveProperty('projectPath', external_fixtures);
        });

        it('should default read scenes alias to cwd project', () => {
            const result = run_cli([
                'read', 'scenes',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('projectInfo');
            expect(json.projectInfo).toHaveProperty('projectPath', external_fixtures);
        });
    });

    describe('update transform by name', () => {
        it('should resolve GameObject name to transform fileID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'update', 'transform',
                    temp_fixture.temp_path,
                    'Player',
                    '--position', '10,20,30',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the position was actually written
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).toContain('m_LocalPosition: {x: 10, y: 20, z: 30}');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should return error for nonexistent GameObject name', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                try {
                    run_cli([
                        'update', 'transform',
                        temp_fixture.temp_path,
                        'NonExistentObject',
                        '--position', '1,2,3',
                        '--json'
                    ]);
                    throw new Error('Expected non-zero exit code');
                } catch (err: unknown) {
                    if (err instanceof Error && err.message === 'Expected non-zero exit code') throw err;
                    const execErr = err as { status: number; stdout: string };
                    expect(execErr.status).toBe(1);
                    const json = JSON.parse(execErr.stdout);
                    expect(json.success).toBe(false);
                    expect(json.error).toContain('Could not resolve');
                }
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('search input validation (file mode)', () => {
        it('should reject empty pattern', () => {
            try {
                run_cli([
                    'search',
                    resolve(fixtures_dir, 'SampleScene.unity'),
                    '',
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: unknown) {
                const execErr = err as { status: number };
                expect(execErr.status).toBeTruthy();
            }
        });

        it('should error on non-existent path', () => {
            try {
                run_cli([
                    'search',
                    '/nonexistent/file.unity',
                    'Camera',
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: unknown) {
                const execErr = err as { status: number };
                expect(execErr.status).toBeTruthy();
            }
        });
    });

    describe('grep input validation', () => {
        it('should reject empty pattern', () => {
            try {
                run_cli([
                    'grep',
                    '',
                    '--project', external_fixtures,
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: unknown) {
                const execErr = err as { status: number };
                expect(execErr.status).toBeTruthy();
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
                'm_Name',
                '--project', external_fixtures,
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBeGreaterThan(0);
        });

        it('should default grep to cwd project', () => {
            const result = run_cli([
                'grep',
                'm_Name',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json).toHaveProperty('project_path', external_fixtures);
        });
    });

    describe('read overrides command', () => {
        it.each([
            ['fileID', '700000'],
            ['name', 'MyEnemy'],
        ] as const)('should read PrefabInstance overrides by %s (%s)', (_label, identifier) => {
            const result = run_cli([
                'read', 'overrides',
                resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                identifier,
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(Array.isArray(json)).toBe(true);
            expect(json.length).toBe(4);
            const paths = json.map((m: Record<string, string>) => m.property_path);
            expect(paths).toContain('m_Name');
            expect(paths).toContain('m_LocalPosition.x');
            expect(paths).toContain('m_LocalPosition.y');
            expect(paths).toContain('m_LocalPosition.z');
            const name_mod = json.find((m: Record<string, string>) => m.property_path === 'm_Name');
            expect(name_mod).toBeTruthy();
            expect(name_mod.value).toBe('MyEnemy');
        });

        it('should output flat format with --flat', () => {
            const result = run_cli([
                'read', 'overrides',
                resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                '700000',
                '--flat',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(Array.isArray(json)).toBe(true);
            expect(json.length).toBe(4);
            // Flat format has property_path, value, target_file_id but no object_reference
            for (const entry of json) {
                expect(entry).toHaveProperty('property_path');
                expect(entry).toHaveProperty('value');
                expect(entry).toHaveProperty('target_file_id');
                expect(entry).not.toHaveProperty('object_reference');
            }
        });

        it('should return error for nonexistent PrefabInstance', () => {
            try {
                run_cli([
                    'read', 'overrides',
                    resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                    'NonExistent',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                const exec_err = err as { status: number; stdout: string };
                expect(exec_err.status).toBeTruthy();
                const json = JSON.parse(exec_err.stdout);
                expect(json).toHaveProperty('error');
                expect(json.error).toContain('not found');
            }
        });
    });

    describe('read component command', () => {
        it('should read component by fileID', () => {
            const result = run_cli([
                'read', 'component',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '508316494',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('file_id', '508316494');
            expect(json).toHaveProperty('class_id', 20);
            expect(json).toHaveProperty('type_name', 'Camera');
        });

        it('should include raw lines with --properties', () => {
            const result = run_cli([
                'read', 'component',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '508316494',
                '-p',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('raw_lines');
            expect(Array.isArray(json.raw_lines)).toBe(true);
            expect(json.raw_lines.length).toBeGreaterThan(0);
        });

        it('should return error for nonexistent fileID', () => {
            try {
                run_cli([
                    'read', 'component',
                    resolve(fixtures_dir, 'SampleScene.unity'),
                    '999999',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                const exec_err = err as { status: number; stdout: string };
                expect(exec_err.status).toBeTruthy();
                const json = JSON.parse(exec_err.stdout);
                expect(json).toHaveProperty('error');
                expect(json.error).toContain('999999');
            }
        });
    });

    describe('read reference command', () => {
        it('should trace outgoing references', () => {
            const result = run_cli([
                'read', 'reference',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '508316491',
                '--direction', 'out',
                '--depth', '1',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('file_id', '508316491');
            expect(json).toHaveProperty('direction', 'out');
            expect(json).toHaveProperty('edges');
            expect(Array.isArray(json.edges)).toBe(true);
            // Main Camera GO references its components (Transform, Camera, etc.)
            expect(json.edges.length).toBeGreaterThan(0);
            for (const edge of json.edges) {
                expect(edge).toHaveProperty('source_file_id');
                expect(edge).toHaveProperty('target_file_id');
                expect(edge).toHaveProperty('depth', 1);
            }
        });

        it('should trace incoming references', () => {
            const result = run_cli([
                'read', 'reference',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '508316491',
                '--direction', 'in',
                '--depth', '1',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('direction', 'in');
            expect(json).toHaveProperty('edges');
            expect(Array.isArray(json.edges)).toBe(true);
            // Components reference back to the GO via m_GameObject
            expect(json.edges.length).toBeGreaterThan(0);
        });

        it('should trace both directions', () => {
            const result = run_cli([
                'read', 'reference',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '508316491',
                '--direction', 'both',
                '--depth', '1',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('direction', 'both');
            expect(json).toHaveProperty('edges');
            expect(Array.isArray(json.edges)).toBe(true);
            expect(json.edges.length).toBeGreaterThan(0);
        });

        it('should return empty edges for nonexistent fileID', () => {
            const result = run_cli([
                'read', 'reference',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '999999',
                '--direction', 'out',
                '--depth', '1',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('edges');
            expect(json.edges).toHaveLength(0);
        });
    });

    describe('read scene --filter-component', () => {
        it('should filter scene by component type', () => {
            const result = run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--filter-component', 'Camera',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('gameobjects');
            expect(json.gameobjects.length).toBeGreaterThan(0);
            // Every returned GO must have a Camera component
            for (const go of json.gameobjects) {
                const has_camera = go.components.some(
                    (c: Record<string, string>) => c.type === 'Camera'
                );
                expect(has_camera).toBe(true);
            }
            // Main Camera should be present, but not all 4 GOs
            expect(json.total).toBeLessThan(4);
        });

        it('should filter before pagination (Bug #3: small page-size with filter)', () => {
            const result = run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--filter-component', 'Camera',
                '--page-size', '1',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('gameobjects');
            // With filter applied before pagination, even page-size 1 should find a Camera
            expect(json.gameobjects.length).toBeGreaterThan(0);
            expect(json.gameobjects[0].components.some(
                (c: Record<string, string>) => c.type === 'Camera'
            )).toBe(true);
            // total should reflect filtered count, not full scene count
            expect(json.total).toBeGreaterThan(0);
            expect(json.total).toBeLessThan(10);
        });

        it('should return 0 results for non-existent component type', () => {
            const result = run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--filter-component', 'NonExistentComponent',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.gameobjects).toEqual([]);
            expect(json.total).toBe(0);
        });
    });

    describe('update array command', () => {
        it('should append to array', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // Use -- to stop Commander option parsing before the value that starts with '-'
                const result = run_cli([
                    'update', 'array',
                    fixture.temp_path,
                    '508316491',
                    'm_Component',
                    'append',
                    '--json',
                    '--',
                    '- component: {fileID: 999999}',
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('file_path', fixture.temp_path);
                expect(json).toHaveProperty('action', 'append');

                // Verify the file was actually modified
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).toContain('fileID: 999999');
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should remove from array by index', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'update', 'array',
                    fixture.temp_path,
                    '508316491',
                    'm_Component',
                    'remove',
                    '--index', '0',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('action', 'remove');
            } finally {
                fixture.cleanup_fn();
            }
        });
    });

    describe('update prefab remove-override command', () => {
        it('should remove prefab override', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'update', 'prefab', 'remove-override',
                    fixture.temp_path,
                    '700000',
                    'm_LocalPosition.x',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('property_path', 'm_LocalPosition.x');

                // Verify the override was actually removed from the file
                const content = readFileSync(fixture.temp_path, 'utf-8');
                // The m_LocalPosition.x override should be gone
                const lines = content.split('\n');
                let found_removed = false;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('propertyPath: m_LocalPosition.x')) {
                        found_removed = true;
                    }
                }
                expect(found_removed).toBe(false);
            } finally {
                fixture.cleanup_fn();
            }
        });
    });

    describe('update prefab remove-component command', () => {
        it('should add component to m_RemovedComponents', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'update', 'prefab', 'remove-component',
                    fixture.temp_path,
                    '700000',
                    '{fileID: 12345}',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the component ref was added to m_RemovedComponents
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).toContain('fileID: 12345');
            } finally {
                fixture.cleanup_fn();
            }
        });
    });

    // ========== Gap Tests: Feature Parity ==========

    describe('search --type expansion (Gap P1.3)', () => {
        it.each([
            ['mat', /\.mat$/],
            ['anim', /\.anim$/],
            ['controller', /\.controller$/],
        ] as const)('should search for .%s files', (type, extension) => {
            const result = run_cli([
                'search', external_fixtures,
                '--type', type,
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBeGreaterThan(0);
            for (const match of json.matches) {
                expect(match.file).toMatch(extension);
            }
        });

        it('should search for .mat files with name filter', () => {
            const result = run_cli([
                'search', external_fixtures,
                '--type', 'mat',
                '--name', 'Outline',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBe(1);
            expect(json.matches[0].file).toContain('Outline');
        });
    });

    describe('read animation --curves (Gap P5.1)', () => {
        let curves_json: Record<string, unknown>;

        beforeAll(() => {
            const result = run_cli([
                'read', 'animation',
                resolve(fixtures_dir, 'keyframe-test.anim'),
                '--curves',
                '--json'
            ]);
            curves_json = JSON.parse(result);
        });

        it('should include curve_data when --curves is set', () => {
            expect(curves_json).toHaveProperty('curve_data');
            const curve_data = curves_json.curve_data as unknown[];
            expect(Array.isArray(curve_data)).toBe(true);
            expect(curve_data.length).toBe(2);
        });

        it('should parse position curve keyframes correctly', () => {
            const curve_data = curves_json.curve_data as Array<Record<string, unknown>>;
            const pos_curve = curve_data.find(
                (c) => c.type === 'position'
            );
            expect(pos_curve).toBeTruthy();
            expect(pos_curve!.path).toBe('Body');
            expect(pos_curve!.attribute).toBe('m_LocalPosition.x');
            expect(pos_curve!.class_id).toBe(4);
            const keyframes = pos_curve!.keyframes as Array<Record<string, number>>;
            expect(keyframes).toHaveLength(2);
            expect(keyframes[0].time).toBe(0);
            expect(keyframes[0].value).toBe(0);
            expect(keyframes[1].time).toBe(1);
            expect(keyframes[1].value).toBe(5);
        });

        it('should parse float curve keyframes correctly', () => {
            const curve_data = curves_json.curve_data as Array<Record<string, unknown>>;
            const float_curve = curve_data.find(
                (c) => c.type === 'float'
            );
            expect(float_curve).toBeTruthy();
            expect(float_curve!.path).toBe('Body/Mesh');
            expect(float_curve!.attribute).toBe('m_Alpha');
            const keyframes = float_curve!.keyframes as Array<Record<string, number>>;
            expect(keyframes).toHaveLength(3);
            expect(keyframes[1].time).toBe(0.5);
            expect(keyframes[1].value).toBe(0);
            expect(keyframes[1].in_slope).toBe(-2);
        });

        it('should not include curve_data without --curves', () => {
            const result = run_cli([
                'read', 'animation',
                resolve(fixtures_dir, 'keyframe-test.anim'),
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).not.toHaveProperty('curve_data');
        });
    });

    describe('read animation events (Gap P5.2)', () => {
        let events_json: Record<string, unknown>;

        beforeAll(() => {
            const result = run_cli([
                'read', 'animation',
                resolve(fixtures_dir, 'events-test.anim'),
                '--json'
            ]);
            events_json = JSON.parse(result);
        });

        it('should parse event time and function name', () => {
            const events = events_json.events as Array<Record<string, unknown>>;
            expect(events).toHaveLength(2);
            expect(events[0].time).toBe(0.5);
            expect(events[0].function_name).toBe('OnHalfway');
            expect(events[1].time).toBe(1);
            expect(events[1].function_name).toBe('OnComplete');
        });

        it('should parse event data and parameters', () => {
            const events = events_json.events as Array<Record<string, unknown>>;
            expect(events[1].data).toBe('done');
            expect(events[1].int_parameter).toBe(42);
            expect(events[1].float_parameter).toBe(3.14);
        });
    });

    describe('update animation --add-event / --remove-event (Gap P5.2)', () => {
        it('should add an event to an animation', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'keyframe-test.anim')
            );

            try {
                const result = run_cli([
                    'update', 'animation',
                    fixture.temp_path,
                    '--add-event', '0.75,OnFootstep,step_data',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the event was added
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).toContain('functionName: OnFootstep');
                expect(content).toContain('data: step_data');
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should add multiple events with repeated --add-event flags', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'keyframe-test.anim')
            );

            try {
                const result = run_cli([
                    'update', 'animation',
                    fixture.temp_path,
                    '--add-event', '0.1,EventA',
                    '--add-event', '0.5,EventB,extra',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json.changes.length).toBeGreaterThanOrEqual(2);

                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).toContain('functionName: EventA');
                expect(content).toContain('functionName: EventB');
                expect(content).toContain('data: extra');
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should remove an event by index', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'events-test.anim')
            );

            try {
                const result = run_cli([
                    'update', 'animation',
                    fixture.temp_path,
                    '--remove-event', '0',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify first event was removed, second remains
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).not.toContain('OnHalfway');
                expect(content).toContain('OnComplete');
            } finally {
                fixture.cleanup_fn();
            }
        });
    });

    describe('read material (Gap P2.1)', () => {
        it('should parse material properties', () => {
            const matFile = resolve(external_fixtures,
                'Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF - Outline.mat');
            const result = run_cli([
                'read', 'material', matFile, '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('name', 'LiberationSans SDF - Outline');
            expect(json).toHaveProperty('shader');
            expect(json.shader).toHaveProperty('guid');
        });
    });

    describe('read animation on external fixture', () => {
        it('should parse idle.anim from external fixtures', () => {
            const animFile = resolve(external_fixtures, 'Assets/dog/Animations/idle.anim');
            const result = run_cli([
                'read', 'animation', animFile, '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('name', 'idle');
            expect(json).toHaveProperty('duration');
            expect(json.duration).toBeGreaterThan(0);
        });
    });

    describe('read animator (Gap P7.1)', () => {
        let animator_json: Record<string, unknown>;

        beforeAll(() => {
            const ctrlFile = resolve(external_fixtures, 'Assets/dog/Animations/sr.controller');
            const result = run_cli([
                'read', 'animator', ctrlFile, '--json'
            ]);
            animator_json = JSON.parse(result);
        });

        it('should parse animator controller states', () => {
            expect(animator_json).toHaveProperty('states');
            const states = animator_json.states as Array<Record<string, unknown>>;
            expect(Array.isArray(states)).toBe(true);
            expect(states.length).toBeGreaterThan(0);
            for (const state of states) {
                expect(state).toHaveProperty('name');
                expect(state).toHaveProperty('motion_guid');
            }
        });

        it('should include parameters', () => {
            expect(animator_json).toHaveProperty('parameters');
            const parameters = animator_json.parameters as Array<Record<string, string>>;
            expect(Array.isArray(parameters)).toBe(true);
            expect(parameters.length).toBeGreaterThan(0);
            const run_param = parameters.find(
                (p) => p.name === 'run'
            );
            expect(run_param).toBeTruthy();
            expect(run_param!.type).toBe('Bool');
        });

        it('should return states_by_layer with --states', () => {
            const ctrlFile = resolve(external_fixtures, 'Assets/dog/Animations/sr.controller');
            const result = run_cli([
                'read', 'animator', ctrlFile, '--states', '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('states_by_layer');
            expect(typeof json.states_by_layer).toBe('object');
        });
    });

    describe('read animator transition details', () => {
        it('should include transition source/dest in default output', () => {
            const ctrlFile = resolve(fixtures_dir, 'test-animator.controller');
            const result = run_cli(['read', 'animator', ctrlFile, '--json']);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('transitions');
            expect(Array.isArray(json.transitions)).toBe(true);
            expect(json.transitions.length).toBe(1);
            expect(json.transitions[0].from).toBe('Idle');
            expect(json.transitions[0].to).toBe('Walk');
            expect(json.transitions[0].has_exit_time).toBe(true);
        });

        it('should include exit_time and source_state in --transitions output', () => {
            const ctrlFile = resolve(fixtures_dir, 'test-animator.controller');
            const result = run_cli(['read', 'animator', ctrlFile, '--transitions', '--json']);
            const json = JSON.parse(result);
            expect(json.transitions.length).toBe(1);
            const t = json.transitions[0];
            expect(t.source_state).toBe('Idle');
            expect(t.destination_state).toBe('Walk');
            expect(t.exit_time).toBe(0.9);
            expect(t.has_exit_time).toBe(true);
            expect(t.duration).toBe(0.25);
        });
    });

    describe('create animator', () => {
        it('should create a valid .controller file', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'unity-create-animator-'));
            const file = join(tmp, 'New.controller');
            try {
                const result = run_cli(['create', 'animator', file, '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.name).toBe('New');
                expect(json.layer).toBe('Base Layer');
                expect(existsSync(file)).toBe(true);
                expect(existsSync(`${file}.meta`)).toBe(true);

                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('AnimatorController:');
                expect(content).toContain('AnimatorStateMachine:');

                const readResult = run_cli(['read', 'animator', file, '--json']);
                const readJson = JSON.parse(readResult);
                expect(readJson.name).toBe('New');
                expect(readJson.layers).toEqual(['Base Layer']);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should reject non-.controller extension', () => {
            try {
                run_cli(['create', 'animator', '/tmp/bad.anim', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { stdout: string };
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('.controller');
            }
        });
    });

    describe('create prefab', () => {
        it('should create a valid .prefab file', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'unity-create-prefab-'));
            const file = join(tmp, 'Enemy.prefab');
            try {
                const result = run_cli(['create', 'prefab', file, '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.name).toBe('Enemy');
                expect(existsSync(file)).toBe(true);
                expect(existsSync(`${file}.meta`)).toBe(true);

                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('GameObject:');
                expect(content).toContain('Transform:');
                expect(content).toContain('m_Name: Enemy');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should reject non-.prefab extension', () => {
            try {
                run_cli(['create', 'prefab', '/tmp/bad.unity', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { stdout: string };
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('.prefab');
            }
        });
    });

    describe('read animator binary detection', () => {
        it('should show binary serialization error for binary files', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'unity-binary-'));
            const binFile = join(tmp, 'binary.asset');
            const buf = Buffer.alloc(64, 0);
            buf.write('UnityFS', 0);
            writeFileSync(binFile, buf);
            try {
                run_cli(['read', 'asset', binFile, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { stdout: string };
                const json = JSON.parse(execErr.stdout);
                expect(json.error).toContain('binary file');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    describe('read asset --properties YAML arrays', () => {
        it('should parse YAML arrays as arrays not flat objects', () => {
            const file = resolve(external_fixtures, 'ProjectSettings/InputManager.asset');
            const result = run_cli(['read', 'asset', file, '--properties', '--json']);
            const json = JSON.parse(result);
            const obj = json.objects[0];
            expect(obj.properties.Axes).toBeDefined();
            expect(Array.isArray(obj.properties.Axes)).toBe(true);
            expect(obj.properties.Axes.length).toBeGreaterThanOrEqual(18);
            expect(obj.properties.Axes[0].Name).toBe('Horizontal');
            expect(obj.properties.Axes[1].Name).toBe('Vertical');
        });
    });

    describe('read asset --properties recursive nested structures', () => {
        it('should parse nested sequences (anim PPtrCurves-like pattern)', () => {
            const file = resolve(fixtures_dir, 'events-test.anim');
            const result = run_cli(['read', 'asset', file, '--properties', '--json']);
            const json = JSON.parse(result);
            const obj = json.objects[0];
            const events = obj.properties.Events;
            expect(Array.isArray(events)).toBe(true);
            expect(events.length).toBe(2);
            expect(events[0].functionName).toBe('OnHalfway');
            expect(events[0].time).toBe('0.5');
            expect(events[1].functionName).toBe('OnComplete');
            expect(events[1].data).toBe('done');
        });

        it('should parse nested maps under empty keys', () => {
            const file = resolve(fixtures_dir, 'events-test.anim');
            const result = run_cli(['read', 'asset', file, '--properties', '--json']);
            const json = JSON.parse(result);
            const obj = json.objects[0];
            const bounds = obj.properties.Bounds;
            expect(bounds).toBeDefined();
            expect(typeof bounds).toBe('object');
            expect(bounds.Center).toBe('{x: 0, y: 0, z: 0}');
            expect(bounds.Extent).toBe('{x: 0, y: 0, z: 0}');
        });
    });

    describe('read asset mesh decode', () => {
        it('should decode mesh vertex data by default', () => {
            const file = resolve(fixtures_dir, 'test-mesh.asset');
            const result = run_cli(['read', 'asset', file, '--properties', '--json']);
            const json = JSON.parse(result);
            const obj = json.objects[0];
            expect(obj.type_name).toBe('Mesh');
            expect(obj.name).toBe('TestTriangle');
            const vd = obj.properties.VertexData;
            expect(vd.vertices).toBeDefined();
            expect(Array.isArray(vd.vertices)).toBe(true);
            expect(vd.vertices.length).toBe(3);
            expect(vd.vertices[0].position).toEqual([0, 0, 0]);
            expect(vd.vertices[1].position).toEqual([1, 0, 0]);
            expect(vd.vertices[2].position).toEqual([0, 1, 0]);
            expect(vd._typelessdata).toBeUndefined();
            expect(Array.isArray(obj.properties.IndexBuffer)).toBe(true);
            expect(obj.properties.IndexBuffer).toEqual([0, 1, 2]);
        });

        it('should preserve raw hex with --raw flag', () => {
            const file = resolve(fixtures_dir, 'test-mesh.asset');
            const result = run_cli(['read', 'asset', file, '--properties', '--raw', '--json']);
            const json = JSON.parse(result);
            const obj = json.objects[0];
            const vd = obj.properties.VertexData;
            expect(typeof vd._typelessdata).toBe('string');
            expect(vd.vertices).toBeUndefined();
            expect(typeof obj.properties.IndexBuffer).toBe('string');
        });
    });

    describe('delete prefab command', () => {
        it.each([
            ['700000', '&700000'],
            ['MyEnemy', 'MyEnemy'],
        ] as const)('should delete PrefabInstance by identifier %s', (identifier, absent_marker) => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'delete', 'prefab',
                    fixture.temp_path,
                    identifier,
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('deleted_count');
                // Deletes PrefabInstance block + all stripped blocks referencing it
                expect(json.deleted_count).toBeGreaterThanOrEqual(3);

                // Verify PrefabInstance is gone from file
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).not.toContain(absent_marker);
            } finally {
                fixture.cleanup_fn();
            }
        });
    });
});

// ========== New feature CLI tests (no native module required) ==========
describe('CLI - New Features', () => {
    // ========== Package Manager ==========
    describe('read manifest', () => {
        it('should list packages from manifest.json', () => {
            const result = run_cli([
                'read', 'manifest',
                '--project', resolve(fixtures_dir, 'test-manifest'),
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.count).toBe(4);
            expect(json.packages).toBeInstanceOf(Array);
        });

        it('should filter packages by search', () => {
            const result = run_cli([
                'read', 'manifest',
                '--project', resolve(fixtures_dir, 'test-manifest'),
                '--search', 'render',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json.count).toBe(1);
            expect(json.packages[0].name).toContain('render');
        });

        it('should default manifest lookup to cwd project', () => {
            const result = run_cli([
                'read', 'manifest',
                '--json'
            ], resolve(fixtures_dir, 'test-manifest'));
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.count).toBeGreaterThan(0);
        });
    });

    describe('create/delete package round-trip', () => {
        it('should add and remove a package', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'pkg-cli-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });

            try {
                // Create
                const create_result = run_cli([
                    'create', 'package',
                    'com.unity.cinemachine', '2.9.7',
                    '--project', tmp,
                    '--json'
                ]);
                const cj = JSON.parse(create_result);
                expect(cj).toHaveProperty('success', true);
                expect(cj.action).toBe('added');

                // Verify it's in the manifest
                const list_result = run_cli(['read', 'manifest', '--project', tmp, '--search', 'cinemachine', '--json']);
                expect(JSON.parse(list_result).count).toBe(1);

                // Delete
                const delete_result = run_cli([
                    'delete', 'package',
                    'com.unity.cinemachine',
                    '--project', tmp,
                    '--json'
                ]);
                const dj = JSON.parse(delete_result);
                expect(dj).toHaveProperty('success', true);

                // Verify it's gone
                const list_result2 = run_cli(['read', 'manifest', '--project', tmp, '--search', 'cinemachine', '--json']);
                expect(JSON.parse(list_result2).count).toBe(0);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should add and remove a package using cwd project default', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'pkg-cli-cwd-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });

            try {
                const create_result = run_cli([
                    'create', 'package',
                    'com.unity.timeline', '1.8.0',
                    '--json'
                ], tmp);
                const cj = JSON.parse(create_result);
                expect(cj).toHaveProperty('success', true);

                const list_result = run_cli(['read', 'manifest', '--search', 'timeline', '--json'], tmp);
                expect(JSON.parse(list_result).count).toBe(1);

                const delete_result = run_cli([
                    'delete', 'package',
                    'com.unity.timeline',
                    '--json'
                ], tmp);
                const dj = JSON.parse(delete_result);
                expect(dj).toHaveProperty('success', true);

                const list_result2 = run_cli(['read', 'manifest', '--search', 'timeline', '--json'], tmp);
                expect(JSON.parse(list_result2).count).toBe(0);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Input Actions ==========
    describe('read input-actions', () => {
        it('should read input actions file', () => {
            const result = run_cli([
                'read', 'input-actions',
                resolve(fixtures_dir, 'test-input-actions.inputactions'),
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('name', 'TestInputActions');
            expect(json.maps).toHaveLength(1);
        });

        it('should show summary', () => {
            const result = run_cli([
                'read', 'input-actions',
                resolve(fixtures_dir, 'test-input-actions.inputactions'),
                '--summary',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('map_count', 1);
            expect(json).toHaveProperty('action_count', 1);
            expect(json).toHaveProperty('binding_count', 1);
        });
    });

    describe('create input-actions', () => {
        it('should create a blank .inputactions file', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ia-cli-'));
            const out = join(tmp, 'NewActions.inputactions');

            try {
                const result = run_cli(['create', 'input-actions', out, 'NewActions', '--json']);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('guid');
                expect(existsSync(out)).toBe(true);
                expect(existsSync(out + '.meta')).toBe(true);

                // Verify content
                const content = JSON.parse(readFileSync(out, 'utf-8'));
                expect(content.name).toBe('NewActions');
                expect(content.maps).toHaveLength(0);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    describe('update input-actions', () => {
        it('should add and remove a map', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ia-cli-'));
            const file = join(tmp, 'test.inputactions');
            cpSync(resolve(fixtures_dir, 'test-input-actions.inputactions'), file);

            try {
                // Add map
                const add_result = run_cli(['update', 'input-actions', file, '--add-map', 'UI', '--json']);
                expect(JSON.parse(add_result).success).toBe(true);

                // Verify
                const read_result = run_cli(['read', 'input-actions', file, '--maps', '--json']);
                expect(JSON.parse(read_result).maps).toHaveLength(2);

                // Remove map
                const rm_result = run_cli(['update', 'input-actions', file, '--remove-map', 'UI', '--json']);
                expect(JSON.parse(rm_result).success).toBe(true);

                // Verify
                const read_result2 = run_cli(['read', 'input-actions', file, '--maps', '--json']);
                expect(JSON.parse(read_result2).maps).toHaveLength(1);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Animation creation ==========
    describe('create animation', () => {
        it('should create a blank .anim file', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-cli-'));
            const out = join(tmp, 'NewAnim.anim');

            try {
                const result = run_cli(['create', 'animation', out, 'NewAnim', '--loop', '--sample-rate', '60', '--json']);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('guid');
                expect(json.loop_time).toBe(true);
                expect(json.sample_rate).toBe(60);
                expect(existsSync(out)).toBe(true);
                expect(existsSync(out + '.meta')).toBe(true);

                // Verify YAML content
                const content = readFileSync(out, 'utf-8');
                expect(content).toContain('m_Name: NewAnim');
                expect(content).toContain('m_LoopTime: 1');
                expect(content).toContain('m_SampleRate: 60');
                expect(content).toContain('m_FloatCurves: []');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Animation curve editing ==========
    describe('update animation-curves', () => {
        it('should add and remove a curve', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-curve-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);

            try {
                // Add a float curve
                const curve_spec = JSON.stringify({
                    type: 'float',
                    path: 'NewPath',
                    attribute: 'm_Enabled',
                    classID: 23,
                    keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0 }]
                });
                const add_result = run_cli(['update', 'animation-curves', file, '--add-curve', curve_spec, '--json']);
                const aj = JSON.parse(add_result);
                expect(aj.success).toBe(true);
                expect(aj.changes[0]).toContain('added float curve');

                // Verify it was added
                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('path: NewPath');
                expect(content).toContain('attribute: m_Enabled');

                // Remove it
                const rm_result = run_cli(['update', 'animation-curves', file, '--remove-curve', 'NewPath:m_Enabled', '--json']);
                const rj = JSON.parse(rm_result);
                expect(rj.success).toBe(true);
                expect(rj.changes[0]).toContain('removed curve');

                // Verify it was removed
                const content2 = readFileSync(file, 'utf-8');
                expect(content2).not.toContain('path: NewPath');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Animator state/transition authoring ==========
    describe('update animator-state', () => {
        it('should add a state', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'animator-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);

            try {
                const result = run_cli(['update', 'animator-state', file, '--add-state', 'Run', '--speed', '1.5', '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes[0]).toContain('added state "Run"');

                // Verify in file
                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('m_Name: Run');
                expect(content).toContain('m_Speed: 1.5');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should add a transition', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'animator-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);

            try {
                const result = run_cli([
                    'update', 'animator-state', file,
                    '--add-transition', 'Idle:Walk',
                    '--condition', 'Speed,greater,0.1',
                    '--duration', '0.25',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes[0]).toContain('Idle -> Walk');

                // Verify in file
                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('m_ConditionEvent: Speed');
                expect(content).toContain('m_TransitionDuration: 0.25');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should add a transition with layer-qualified names (R5 Bug #7)', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'animator-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);

            try {
                const result = run_cli([
                    'update', 'animator-state', file,
                    '--add-transition', 'Base Layer.Idle:Base Layer.Walk',
                    '--duration', '0.3',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes[0]).toContain('Idle -> Walk');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should remove a state', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'animator-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);

            try {
                const result = run_cli(['update', 'animator-state', file, '--remove-state', 'Walk', '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes[0]).toContain('removed state "Walk"');

                // Verify Walk is gone
                const content = readFileSync(file, 'utf-8');
                expect(content).not.toContain('m_Name: Walk');
                // Idle should still be there
                expect(content).toContain('m_Name: Idle');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should set default state', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'animator-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);

            try {
                const result = run_cli(['update', 'animator-state', file, '--set-default-state', 'Walk', '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);

                // Verify default state changed
                const content = readFileSync(file, 'utf-8');
                expect(content).toContain('m_DefaultState: {fileID: 1102000030}');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Sibling ordering ==========
    describe('update sibling-index', () => {
        it('should reorder siblings', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'sibling-'));
            const scene_fixture = resolve(fixtures_dir, 'external', 'SampleScene.unity');

            // Only run if external fixture exists
            if (!existsSync(scene_fixture)) {
                return;
            }

            const file = join(tmp, 'SampleScene.unity');
            cpSync(scene_fixture, file);

            try {
                const result = run_cli(['update', 'sibling-index', file, 'Main Camera', '0', '--json']);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json.new_index).toBe(0);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // ========== Bug fix regression tests ==========
    describe('bug fixes', () => {
        it('Bug 1: should reject invalid package version', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'pkg-bug1-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            try {
                run_cli(['create', 'package', 'com.test.bad', 'not-a-version', '--project', tmp, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('Invalid version');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 2: should reject duplicate map name', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ia-bug2-'));
            const file = join(tmp, 'test.inputactions');
            cpSync(resolve(fixtures_dir, 'test-input-actions.inputactions'), file);
            try {
                // "Player" already exists in fixture
                run_cli(['update', 'input-actions', file, '--add-map', 'Player', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('already exists');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 4: should reject duplicate curve', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-bug4-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                // Body/Mesh:m_Alpha already exists in the fixture
                const spec = JSON.stringify({
                    type: 'float', path: 'Body/Mesh', attribute: 'm_Alpha',
                    classID: 23, keyframes: [{ time: 0, value: 999 }]
                });
                run_cli(['update', 'animation-curves', file, '--add-curve', spec, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('already exists');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 5: should error on missing required fields in --add-curve', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-bug5-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                run_cli(['update', 'animation-curves', file, '--add-curve', '{"type":"float","path":"Body"}', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('Missing required field');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 6: should give specific error for non-existent curve removal', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-bug6-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                run_cli(['update', 'animation-curves', file, '--remove-curve', 'NonExistent:m_Foo', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('not found');
                expect(json.error).toContain('NonExistent');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 7: should reject non-.anim file for animation-curves', () => {
            try {
                run_cli([
                    'update', 'animation-curves',
                    resolve(fixtures_dir, 'test-animator.controller'),
                    '--add-curve', '{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":0}]}',
                    '--json'
                ]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('.anim');
            }
        });

        it('Bug 3: --set-keyframes should accept single JSON argument', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-bug3-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                const spec = JSON.stringify({
                    curve: 'Body:m_LocalPosition.x',
                    keyframes: [{ time: 0, value: 10 }, { time: 1, value: 20 }]
                });
                const result = run_cli(['update', 'animation-curves', file, '--set-keyframes', spec, '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes).toContain('set keyframes on Body:m_LocalPosition.x');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 8: should reject duplicate state name', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-bug8-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);
            try {
                // "Idle" already exists in fixture
                run_cli(['update', 'animator-state', file, '--add-state', 'Idle', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('already exists');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 1: should reject empty component name', () => {
            try {
                run_cli(['create', 'component', resolve(fixtures_dir, 'SampleScene.unity'), 'Main Camera', '', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('Component name must not be empty');
            }
        });

        it('Edge 2: should reject empty package name', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'pkg-edge2-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            try {
                run_cli(['create', 'package', '', '1.0.0', '--project', tmp, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('must not be empty');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 3: should reject package name with spaces', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'pkg-edge3-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            try {
                run_cli(['create', 'package', 'com.test package', '1.0.0', '--project', tmp, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('must not contain spaces');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 4: should reject NaN keyframe time', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-edge4-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                const spec = JSON.stringify({ curve: 'Body:m_LocalPosition.x', keyframes: [{ time: 'NaN', value: 0 }] });
                run_cli(['update', 'animation-curves', file, '--set-keyframes', spec, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('finite number');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 5: should reject boolean keyframe values', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'anim-edge5-'));
            const file = join(tmp, 'test.anim');
            cpSync(resolve(fixtures_dir, 'keyframe-test.anim'), file);
            try {
                const spec = JSON.stringify({ curve: 'Body:m_LocalPosition.x', keyframes: [{ time: true, value: false }] });
                run_cli(['update', 'animation-curves', file, '--set-keyframes', spec, '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('finite number');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 6: should reject non-numeric sample-rate', () => {
            try {
                run_cli(['create', 'animation', '/tmp/edge6-test.anim', 'Test', '--sample-rate', 'abc', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('sample-rate');
            }
        });

        it('Edge 7: should give specific error for empty map name', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ia-edge7-'));
            const file = join(tmp, 'test.inputactions');
            cpSync(resolve(fixtures_dir, 'test-input-actions.inputactions'), file);
            try {
                run_cli(['update', 'input-actions', file, '--add-map', '', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('must not be empty');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 8: should reject condition on non-existent parameter', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ctrl-edge8-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);
            try {
                run_cli(['update', 'animator-state', file, '--add-transition', 'Idle:Walk', '--condition', 'FakeParam,Greater,0.5', '--json']);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toContain('FakeParam');
                expect(json.error).toContain('not found');
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Bug 9: --add-parameter should report skipped on malformed controller', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ctrl-bug9-'));
            const file = join(tmp, 'test.controller');
            writeFileSync(file, [
                '%YAML 1.1',
                '%TAG !u! tag:unity3d.com,2011:',
                '--- !u!91 &9100000',
                'AnimatorController:',
                '  m_Name: Malformed',
                '  m_AnimatorParameters:',
                '  - m_Name: Existing',
                '    m_Type: 1',
                '',
            ].join('\n'));
            try {
                const result = run_cli(['update', 'animator', file, '--add-parameter', 'Speed', '--type', 'float', '--json']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes.some((c: string) => c.includes('(skipped)'))).toBe(true);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 10: should return exit code 1 for invalid grep regex', () => {
            try {
                run_cli(['grep', '[invalid(regex', '--project', resolve(fixtures_dir)]);
                expect.unreachable('Should have thrown');
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'Should have thrown') throw err;
                const execErr = err as { status: number; stdout: string };
                expect(execErr.status).toBeTruthy();
                const json = JSON.parse(execErr.stdout);
                expect(json.success).toBe(false);
                expect(json.error).toBeDefined();
            }
        });
    });

    describe('error suggestions', () => {
        it('create gameobject --name flag should work as alias', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );
            try {
                const result = run_cli([
                    'create', 'gameobject',
                    temp_fixture.temp_path,
                    '--name', 'TestNameFlag',
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('read scripts --filter should work as alias for --name', () => {
            try {
                run_cli(['read', 'scripts', '--project', fixtures_dir, '--filter', 'NonExistentType']);
            } catch {
                // May fail if native module is not available, but should not fail
                // due to --filter being an unknown option
            }
        });

    });

    describe('project path default behavior', () => {
        it('should default create build to cwd project', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'build-create-cwd-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            cpSync(join(external_fixtures, 'ProjectSettings', 'ProjectVersion.txt'), join(tmp, 'ProjectSettings', 'ProjectVersion.txt'));
            cpSync(join(external_fixtures, 'ProjectSettings', 'EditorBuildSettings.asset'), join(tmp, 'ProjectSettings', 'EditorBuildSettings.asset'));
            cpSync(join(external_fixtures, 'Assets', 'Scenes'), join(tmp, 'Assets', 'Scenes'), { recursive: true });
            cpSync(join(tmp, 'Assets', 'Scenes', 'Menu.unity'), join(tmp, 'Assets', 'Scenes', 'NewScene.unity'));
            cpSync(join(tmp, 'Assets', 'Scenes', 'Menu.unity.meta'), join(tmp, 'Assets', 'Scenes', 'NewScene.unity.meta'));

            try {
                const result = run_cli([
                    'create', 'build',
                    'Assets/Scenes/NewScene.unity',
                    '--json'
                ], tmp);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should default update build to cwd project', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'build-update-cwd-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            cpSync(join(external_fixtures, 'ProjectSettings', 'ProjectVersion.txt'), join(tmp, 'ProjectSettings', 'ProjectVersion.txt'));
            cpSync(join(external_fixtures, 'ProjectSettings', 'EditorBuildSettings.asset'), join(tmp, 'ProjectSettings', 'EditorBuildSettings.asset'));

            try {
                const result = run_cli([
                    'update', 'build',
                    'Assets/Scenes/Menu.unity',
                    '--disable',
                    '--json'
                ], tmp);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should default delete build to cwd project', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'build-delete-cwd-'));
            cpSync(resolve(fixtures_dir, 'test-manifest'), tmp, { recursive: true });
            cpSync(join(external_fixtures, 'ProjectSettings', 'ProjectVersion.txt'), join(tmp, 'ProjectSettings', 'ProjectVersion.txt'));
            cpSync(join(external_fixtures, 'ProjectSettings', 'EditorBuildSettings.asset'), join(tmp, 'ProjectSettings', 'EditorBuildSettings.asset'));

            try {
                const result = run_cli([
                    'delete', 'build',
                    'Assets/Scenes/Level.unity',
                    '--json'
                ], tmp);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should default version to cwd project', () => {
            const result = run_cli([
                'version',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('raw');
            expect(json).toHaveProperty('major');
        });

        it('should default read dependents to cwd project', () => {
            const result = run_cli([
                'read', 'dependents',
                '07d404ae2f2e9404ab61c78efb374629',
                '--json'
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('project_path', external_fixtures);
            expect(json).toHaveProperty('guid', '07d404ae2f2e9404ab61c78efb374629');
        });

        it('should default read unused to cwd project', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'unused-cwd-'));
            mkdirSync(join(tmp, 'Assets'), { recursive: true });
            mkdirSync(join(tmp, '.unity-agentic'), { recursive: true });
            writeFileSync(
                join(tmp, '.unity-agentic', 'guid-cache.json'),
                JSON.stringify({ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 'Assets/Test.asset' })
            );

            const result = run_cli([
                'read', 'unused',
                '--max', '5',
                '--json'
            ], tmp);
            const json = JSON.parse(result);
            expect(json.project_path).toContain('unused-cwd-');
            expect(json).toHaveProperty('potentially_unused', 1);
            rmSync(tmp, { recursive: true, force: true });
        });
    });
});
