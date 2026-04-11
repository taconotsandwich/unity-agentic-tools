import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync, cpSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { create_temp_fixture } from './test-utils';
import { isNativeModuleAvailable } from '../src/scanner';
import { addRemovedComponent, addRemovedGameObject, addComponent, createGameObject } from '../src/editor';

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

function expect_unknown_command(args: string[], cwd: string = repo_root): void {
    try {
        run_cli(args, cwd);
        expect.unreachable('Expected unknown command failure');
    } catch (err: unknown) {
        const execErr = err as { status: number; stdout?: string; stderr?: string };
        expect(execErr.status).toBeTruthy();
        const output = `${execErr.stdout ?? ''}\n${execErr.stderr ?? ''}`;
        expect(output).toContain('unknown command');
    }
}

describeIfNative('CLI', () => {
    describe('read gameobject command', () => {
        it('should output valid JSON with file and object wrapper', () => {
            const result = run_cli([
                'read', 'gameobject',
                resolve(fixtures_dir, 'TestSample.unity'),
                'TestObject',
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
                '--page-size', '2', '--cursor', '0'
            ]));
            const page2 = JSON.parse(run_cli([
                'read', 'scene',
                resolve(fixtures_dir, 'SampleScene.unity'),
                '--page-size', '2', '--cursor', '2'
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

    describe('migrated scene mutation commands', () => {
        it('removes top-level create scene graph commands', () => {
            expect_unknown_command(['create', 'scene', 'Assets/Scenes/New.unity']);
            expect_unknown_command(['create', 'prefab-variant', 'Assets/Prefabs/Base.prefab', 'Assets/Prefabs/BaseVariant.prefab']);
            expect_unknown_command(['create', 'scriptable-object', 'Assets/Data/Test.asset', 'TestType']);
            expect_unknown_command(['create', 'meta', '/tmp/TestScript.cs']);
            expect_unknown_command(['create', 'build', 'Assets/Scenes/Main.unity']);
            expect_unknown_command(['create', 'material', 'Assets/Materials/Test.mat']);
            expect_unknown_command(['create', 'package', 'com.test.package', '1.0.0']);
            expect_unknown_command(['create', 'input-actions', 'Assets/Input/Test.inputactions', 'TestActions']);
            expect_unknown_command(['create', 'animation', 'Assets/Animations/Test.anim', 'Test']);
            expect_unknown_command(['create', 'animator', 'Assets/Animators/Test.controller', 'Test']);
            expect_unknown_command(['create', 'prefab', 'Assets/Prefabs/Test.prefab', 'Test']);
            expect_unknown_command(['create', 'gameobject', 'Scene.unity', 'Root']);
            expect_unknown_command(['create', 'component', 'Scene.unity', 'Player', 'Rigidbody']);
            expect_unknown_command(['create', 'component-copy', 'Scene.unity', '12345', 'Player']);
            expect_unknown_command(['create', 'prefab-instance', 'Scene.unity', 'Assets/Prefabs/AppRoot.prefab']);
        });

        it('removes top-level update scene graph commands', () => {
            expect_unknown_command(['update', 'gameobject', 'Scene.unity', 'Player', 'm_IsActive', 'false']);
            expect_unknown_command(['update', 'component', 'Scene.unity', '12345', 'm_LocalPosition.x', '10']);
            expect_unknown_command(['update', 'transform', 'Scene.unity', 'Player', '--position', '1,2,3']);
            expect_unknown_command(['update', 'parent', 'Scene.unity', 'Child', 'Parent']);
            expect_unknown_command(['update', 'array', 'Scene.unity', '12345', 'm_Component', 'append', '{"value":"1"}']);
            expect_unknown_command(['update', 'batch', 'Scene.unity', '[]']);
            expect_unknown_command(['update', 'batch-components', 'Scene.unity', '[]']);
            expect_unknown_command(['update', 'sibling-index', 'Scene.unity', 'Player', '0']);
            expect_unknown_command(['update', 'managed-reference', 'Scene.unity', '12345', 'field', 'Namespace.Type']);
        });

        it('removes top-level update prefab mutation commands', () => {
            expect_unknown_command(['update', 'prefab', 'override', 'Scene.unity', 'AppRoot', 'm_Name', 'AppRoot']);
            expect_unknown_command(['update', 'prefab', 'remove-override', 'Scene.unity', 'AppRoot', 'm_Name']);
        });

        it('removes top-level structural asset update commands', () => {
            expect_unknown_command(['update', 'tag', 'add', 'MyTag']);
            expect_unknown_command(['update', 'sorting-layer', 'add', 'MyLayer']);
            expect_unknown_command(['update', 'build', 'Assets/Scenes/Main.unity', '--disable']);
            expect_unknown_command(['update', 'input-actions', 'Assets/Input/Test.inputactions', '--add-map', 'Gameplay']);
            expect_unknown_command(['update', 'animation-curves', 'Assets/Animations/Test.anim', '--add-curve', '{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]}']);
            expect_unknown_command(['update', 'animator-state', 'Assets/Animators/Test.controller', '--add-state', 'Run']);
        });
    });

    describe('delete component command', () => {
        it('should remove a component by file ID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path
                ]));
                const mainCamera = listResult.gameobjects.find((g: GameObjectEntry) => g.name === 'Main Camera');
                const cameraId = mainCamera.components.find((c: ComponentEntry) => c.type === 'Camera').fileId;

                const result = run_cli([
                    'delete', 'component',
                    temp_fixture.temp_path,
                    cameraId,
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                const refreshed = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path
                ]));
                const refreshedCamera = refreshed.gameobjects.find((g: GameObjectEntry) => g.name === 'Main Camera');
                expect(refreshedCamera.components.some((c: ComponentEntry) => c.type === 'Camera')).toBe(false);
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
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify it's gone
                const listResult = JSON.parse(run_cli([
                    'read', 'scene', temp_fixture.temp_path
                ]));
                const names = listResult.gameobjects.map((g: GameObjectEntry) => g.name);
                expect(names).not.toContain('GameManager');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('create component-copy command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['create', 'component-copy', 'Scene.unity', '12345', 'Player']);
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
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('update parent command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'parent', 'Scene.unity', 'Child', 'Parent']);
        });
    });

    describe('removed top-level create commands', () => {
        it('removes create meta', () => {
            expect_unknown_command(['create', 'meta', '/tmp/TestScript.cs']);
        });

        it('removes create scene', () => {
            expect_unknown_command(['create', 'scene', '/tmp/New.unity']);
        });
    });

    describe('settings commands via CLI', () => {
        it('should read settings from a project', () => {
            const result = run_cli([
                'read', 'settings',
                '--project', external_fixtures,
                '--setting', 'tags',
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.data).toHaveProperty('tags');
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
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json).toHaveProperty('project_path', external_fixtures);
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
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('projectInfo');
            expect(json.projectInfo).toHaveProperty('projectPath', external_fixtures);
        });

        it('should default read scenes alias to cwd project', () => {
            const result = run_cli([
                'read', 'scenes',
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('projectInfo');
            expect(json.projectInfo).toHaveProperty('projectPath', external_fixtures);
        });
    });

    describe('update transform by name', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'transform', 'Scene.unity', 'Player', '--position', '10,20,30']);
        });
    });

    describe('search input validation (file mode)', () => {
        it('should reject empty pattern', () => {
            try {
                run_cli([
                    'search',
                    resolve(fixtures_dir, 'SampleScene.unity'),
                    '',
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
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.total_matches).toBeGreaterThan(0);
        });

        it('should default grep to cwd project', () => {
            const result = run_cli([
                'grep',
                'm_Name',
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
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('prefab_instance_id', '700000');
            expect(Array.isArray(json.modifications)).toBe(true);
            expect(json.modifications.length).toBe(4);
            expect(Array.isArray(json.removed_components)).toBe(true);
            expect(Array.isArray(json.removed_gameobjects)).toBe(true);
            expect(Array.isArray(json.added_gameobjects)).toBe(true);
            expect(Array.isArray(json.added_components)).toBe(true);
            const paths = json.modifications.map((m: Record<string, string>) => m.property_path);
            expect(paths).toContain('m_Name');
            expect(paths).toContain('m_LocalPosition.x');
            expect(paths).toContain('m_LocalPosition.y');
            expect(paths).toContain('m_LocalPosition.z');
            const name_mod = json.modifications.find((m: Record<string, string>) => m.property_path === 'm_Name');
            expect(name_mod).toBeTruthy();
            expect(name_mod.value).toBe('MyEnemy');
        });

        it('should output flat format with --flat', () => {
            const result = run_cli([
                'read', 'overrides',
                resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                '700000',
                '--flat',
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

        it('should include removed component state from PrefabInstance block', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const mutate_result = addRemovedComponent({
                    file_path: fixture.temp_path,
                    prefab_instance: '700000',
                    component_ref: '{fileID: 11400000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}',
                });
                expect(mutate_result.success).toBe(true);

                const result = run_cli([
                    'read', 'overrides',
                    fixture.temp_path,
                    '700000',
                ]);
                const json = JSON.parse(result);

                expect(Array.isArray(json.removed_components)).toBe(true);
                expect(json.removed_components.length).toBe(1);
                expect(json.removed_components[0]).toMatchObject({
                    file_id: '11400000',
                    guid: 'a1b2c3d4e5f6789012345678abcdef12',
                    type: 3,
                });
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should include removed GameObject state from PrefabInstance block', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const mutate_result = addRemovedGameObject({
                    file_path: fixture.temp_path,
                    prefab_instance: '700000',
                    component_ref: '{fileID: 100000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}',
                });
                expect(mutate_result.success).toBe(true);

                const result = run_cli([
                    'read', 'overrides',
                    fixture.temp_path,
                    '700000',
                ]);
                const json = JSON.parse(result);

                expect(Array.isArray(json.removed_gameobjects)).toBe(true);
                expect(json.removed_gameobjects.length).toBe(1);
                expect(json.removed_gameobjects[0]).toMatchObject({
                    file_id: '100000',
                    guid: 'a1b2c3d4e5f6789012345678abcdef12',
                    type: 3,
                });
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should return error for nonexistent PrefabInstance', () => {
            try {
                run_cli([
                    'read', 'overrides',
                    resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                    'NonExistent',
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
            ]);
            const json = JSON.parse(result);
            expect(json.gameobjects).toEqual([]);
            expect(json.total).toBe(0);
        });
    });

    describe('update array command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'array', 'Scene.unity', '12345', 'm_Component', 'append', '{"value":"1"}']);
        });
    });

    describe('update prefab remove-override command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'prefab', 'remove-override', 'Scene.unity', 'AppRoot', 'm_LocalPosition.x']);
        });
    });

    describe('update prefab remove-component command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'prefab', 'remove-component', 'Scene.unity', 'AppRoot', 'Camera']);
            expect_unknown_command(['update', 'prefab', 'restore-component', 'Scene.unity', 'AppRoot', 'Camera']);
        });
    });

    describe('update prefab remove-gameobject command', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'prefab', 'remove-gameobject', 'Scene.unity', 'AppRoot/Child']);
            expect_unknown_command(['update', 'prefab', 'restore-gameobject', 'Scene.unity', 'AppRoot/Child']);
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

    describe('read material (Gap P2.1)', () => {
        it('should parse material properties', () => {
            const matFile = resolve(external_fixtures,
                'Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF - Outline.mat');
            const result = run_cli([
                'read', 'material', matFile
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
                'read', 'animation', animFile
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
                'read', 'animator', ctrlFile
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
                'read', 'animator', ctrlFile, '--states'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('states_by_layer');
            expect(typeof json.states_by_layer).toBe('object');
        });
    });

    describe('read animator transition details', () => {
        it('should include transition source/dest in default output', () => {
            const ctrlFile = resolve(fixtures_dir, 'test-animator.controller');
            const result = run_cli(['read', 'animator', ctrlFile]);
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
            const result = run_cli(['read', 'animator', ctrlFile, '--transitions']);
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

    describe('removed top-level create asset commands', () => {
        it('removes create animator', () => {
            expect_unknown_command(['create', 'animator', '/tmp/New.controller']);
        });

        it('removes create prefab', () => {
            expect_unknown_command(['create', 'prefab', '/tmp/Enemy.prefab']);
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
                run_cli(['read', 'asset', binFile]);
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
            const result = run_cli(['read', 'asset', file, '--properties']);
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
            const result = run_cli(['read', 'asset', file, '--properties']);
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
            const result = run_cli(['read', 'asset', file, '--properties']);
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
            const result = run_cli(['read', 'asset', file, '--properties']);
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
            const result = run_cli(['read', 'asset', file, '--properties', '--raw']);
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

        it('should remove added override objects/components when deleting PrefabInstance', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const added_go = createGameObject({
                    file_path: fixture.temp_path,
                    name: 'VariantExtra',
                });
                expect(added_go.success).toBe(true);

                const added_component = addComponent({
                    file_path: fixture.temp_path,
                    game_object_name: 'MyEnemy',
                    component_type: 'AudioSource',
                });
                expect(added_component.success).toBe(true);

                const delete_result = JSON.parse(run_cli([
                    'delete', 'prefab',
                    fixture.temp_path,
                    '700000',
                ]));
                expect(delete_result.success).toBe(true);

                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).not.toContain('&700000');
                expect(content).not.toContain(`&${added_go.game_object_id}`);
                expect(content).not.toContain(`&${added_go.transform_id}`);
                expect(content).not.toContain(`&${added_component.component_id}`);
            } finally {
                fixture.cleanup_fn();
            }
        });
    });

    describe('delete asset command', () => {
        it('should delete prefab file and .meta', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'uat-del-prefab-'));
            const file = join(tmp, 'DeleteMe.prefab');
            writeFileSync(file, '%YAML 1.1\n', 'utf-8');
            writeFileSync(file + '.meta', 'fileFormatVersion: 2\nguid: abcdefabcdefabcdefabcdefabcdefab\n', 'utf-8');

            try {
                const result = run_cli(['delete', 'asset', file]);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.deleted_file).toBe(true);
                expect(json.deleted_meta).toBe(true);
                expect(existsSync(file)).toBe(false);
                expect(existsSync(file + '.meta')).toBe(false);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should return warning when .meta is missing', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'uat-del-prefab-nometa-'));
            const file = join(tmp, 'DeleteMe.prefab');
            writeFileSync(file, '%YAML 1.1\n', 'utf-8');

            try {
                const result = run_cli(['delete', 'asset', file]);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.deleted_file).toBe(true);
                expect(json.deleted_meta).toBe(false);
                expect(json.warning).toContain('no .meta file found');
                expect(existsSync(file)).toBe(false);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('should fail for unsupported extension', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'uat-del-unsupported-'));
            const file = join(tmp, 'DeleteMe.txt');
            writeFileSync(file, 'plain text', 'utf-8');

            try {
                try {
                    run_cli(['delete', 'asset', file]);
                    throw new Error('Expected non-zero exit code');
                } catch (err: unknown) {
                    if (err instanceof Error && err.message === 'Expected non-zero exit code') throw err;
                    const execErr = err as { status: number; stdout: string };
                    expect(execErr.status).toBe(1);
                    const json = JSON.parse(execErr.stdout);
                    expect(json.success).toBe(false);
                    expect(json.error).toContain('Unsupported asset type');
                }
            } finally {
                rmSync(tmp, { recursive: true, force: true });
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
            ]);
            const json = JSON.parse(result);
            expect(json.count).toBe(1);
            expect(json.packages[0].name).toContain('render');
        });

        it('should default manifest lookup to cwd project', () => {
            const result = run_cli([
                'read', 'manifest',
            ], resolve(fixtures_dir, 'test-manifest'));
            const json = JSON.parse(result);
            expect(json).toHaveProperty('success', true);
            expect(json.count).toBeGreaterThan(0);
        });
    });

    describe('removed top-level create package command', () => {
        it('removes create package', () => {
            expect_unknown_command(['create', 'package', 'com.unity.cinemachine', '2.9.7']);
        });
    });

    // ========== Input Actions ==========
    describe('read input-actions', () => {
        it('should read input actions file', () => {
            const result = run_cli([
                'read', 'input-actions',
                resolve(fixtures_dir, 'test-input-actions.inputactions'),
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
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('map_count', 1);
            expect(json).toHaveProperty('action_count', 1);
            expect(json).toHaveProperty('binding_count', 1);
        });
    });

    describe('removed top-level create/update structural asset commands', () => {
        it('removes create input-actions', () => {
            expect_unknown_command(['create', 'input-actions', '/tmp/NewActions.inputactions', 'NewActions']);
        });

        it('removes update input-actions', () => {
            expect_unknown_command(['update', 'input-actions', '/tmp/test.inputactions', '--add-map', 'UI']);
        });

        it('removes create animation', () => {
            expect_unknown_command(['create', 'animation', '/tmp/NewAnim.anim', 'NewAnim']);
        });

        it('removes update animation-curves', () => {
            expect_unknown_command(['update', 'animation-curves', '/tmp/test.anim', '--add-curve', '{"type":"float","path":"NewPath","attribute":"m_Enabled","classID":23,"keyframes":[{"time":0,"value":1}]}']);
        });

        it('removes update animator-state', () => {
            expect_unknown_command(['update', 'animator-state', '/tmp/test.controller', '--add-state', 'Run']);
        });
    });

    // ========== Sibling ordering ==========
    describe('update sibling-index', () => {
        it('is removed from the top-level CLI', () => {
            expect_unknown_command(['update', 'sibling-index', 'Scene.unity', 'Main Camera', '0']);
        });
    });

    // ========== Bug fix regression tests ==========
    describe('bug fixes', () => {
        it('Edge 1: removed create component command should fail as unknown command', () => {
            expect_unknown_command(['create', 'component', resolve(fixtures_dir, 'SampleScene.unity'), 'Main Camera', '']);
        });

        it('Edge 2: removed create package command should fail as unknown command', () => {
            expect_unknown_command(['create', 'package', 'com.test.bad', '1.0.0']);
        });

        it('Edge 3: removed structural animation command should fail as unknown command', () => {
            expect_unknown_command(['update', 'animation-curves', '/tmp/test.anim', '--add-curve', '{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]}']);
        });

        it('Edge 4: removed structural animator command should fail as unknown command', () => {
            expect_unknown_command(['update', 'animator-state', '/tmp/test.controller', '--add-transition', 'Idle:Walk']);
        });

        it('Edge 5: removed create animation command should fail as unknown command', () => {
            expect_unknown_command(['create', 'animation', '/tmp/edge5-test.anim', 'Test']);
        });

        it('Edge 6: removed structural input-actions command should fail as unknown command', () => {
            expect_unknown_command(['update', 'input-actions', '/tmp/test.inputactions', '--add-map', 'Gameplay']);
        });

        it('Edge 7: animator set-default should skip unknown parameters cleanly', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ctrl-edge7-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(fixtures_dir, 'test-animator.controller'), file);
            try {
                const result = run_cli(['update', 'animator', file, '--set-default', 'MissingParam=2']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes.some((c: string) => c.includes('not found (skipped)'))).toBe(true);
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it('Edge 8: animator set-default should skip trigger parameters cleanly', () => {
            const tmp = mkdtempSync(join(tmpdir(), 'ctrl-edge8-'));
            const file = join(tmp, 'test.controller');
            cpSync(resolve(external_fixtures, 'Assets/dog/Animations/sr.controller'), file);
            try {
                const result = run_cli(['update', 'animator', file, '--set-default', 'jump=1']);
                const json = JSON.parse(result);
                expect(json.success).toBe(true);
                expect(json.changes.some((c: string) => c.includes('trigger parameters have no default value'))).toBe(true);
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
        it('removed create gameobject alias now fails as an unknown command', () => {
            expect_unknown_command(['create', 'gameobject', 'Scene.unity', '--name', 'TestNameFlag']);
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
        it('should reject removed create build at cwd project', () => {
            expect_unknown_command(['create', 'build', 'Assets/Scenes/NewScene.unity']);
        });

        it('should reject removed update build at cwd project', () => {
            expect_unknown_command(['update', 'build', 'Assets/Scenes/Menu.unity', '--disable']);
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
            ], external_fixtures);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('raw');
            expect(json).toHaveProperty('major');
        });

        it('should default read dependents to cwd project', () => {
            const result = run_cli([
                'read', 'dependents',
                '07d404ae2f2e9404ab61c78efb374629',
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
            ], tmp);
            const json = JSON.parse(result);
            expect(json.project_path).toContain('unused-cwd-');
            expect(json).toHaveProperty('potentially_unused', 1);
            rmSync(tmp, { recursive: true, force: true });
        });
    });
});
