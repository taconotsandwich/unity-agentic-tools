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
    describe('read gameobject command (single object)', () => {
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

    describe('read gameobject command', () => {
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
            expect(json.components.every((c: any) => c.type === 'MonoBehaviour')).toBe(true);
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
            const go = json.gameobjects.find((g: any) =>
                g.components?.some((c: any) => c.properties)
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
                const player = listResult.gameobjects.find((g: any) => g.name === 'Player');
                const transformId = player.components.find((c: any) => c.type === 'Transform').fileId;

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
            } catch (err: any) {
                // CLI exits with error for invalid vector
                expect(err.status).toBeTruthy();
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
                const result = run_cli([
                    'create', 'component',
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
                const player = listResult.gameobjects.find((g: any) => g.name === 'Player');
                const transformId = player.components.find((c: any) => c.type === 'Transform').fileId;

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
                const result = run_cli([
                    'update', 'component',
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
                const names = listResult.gameobjects.map((g: any) => g.name);
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
                const camera = listResult.gameobjects.find((g: any) => g.name === 'Main Camera');
                const cameraComp = camera.components.find((c: any) => c.type === 'Camera');

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
                external_fixtures,
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
                    temp_dir,
                    'add',
                    'CLITestTag',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);

                // Verify the tag was added
                const readResult = JSON.parse(run_cli([
                    'read', 'settings', temp_dir, '--setting', 'tags', '--json'
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

        it('should still accept numeric transform fileID', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                // 1847675924 is Player's transform fileID
                const result = run_cli([
                    'update', 'transform',
                    temp_fixture.temp_path,
                    '1847675924',
                    '--position', '5,6,7',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
            } finally {
                temp_fixture.cleanup_fn();
            }
        });

        it('should return error for nonexistent GameObject name', () => {
            const temp_fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SampleScene.unity')
            );

            try {
                const result = run_cli([
                    'update', 'transform',
                    temp_fixture.temp_path,
                    'NonExistentObject',
                    '--position', '1,2,3',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json.success).toBe(false);
                expect(json.error).toContain('Could not resolve');
            } finally {
                temp_fixture.cleanup_fn();
            }
        });
    });

    describe('find input validation', () => {
        it('should reject empty pattern', () => {
            try {
                run_cli([
                    'find',
                    resolve(fixtures_dir, 'SampleScene.unity'),
                    '',
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: any) {
                expect(err.status).toBeTruthy();
            }
        });

        it('should error on non-existent file', () => {
            try {
                run_cli([
                    'find',
                    '/nonexistent/file.unity',
                    'Camera',
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: any) {
                expect(err.status).toBeTruthy();
            }
        });
    });

    describe('grep input validation', () => {
        it('should reject empty pattern', () => {
            try {
                run_cli([
                    'grep',
                    external_fixtures,
                    '',
                    '--json'
                ]);
                expect.unreachable('Should have exited with error');
            } catch (err: any) {
                expect(err.status).toBeTruthy();
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

    describe('read overrides command', () => {
        it('should read PrefabInstance overrides by fileID', () => {
            const result = run_cli([
                'read', 'overrides',
                resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                '700000',
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
        });

        it('should read PrefabInstance overrides by name', () => {
            const result = run_cli([
                'read', 'overrides',
                resolve(fixtures_dir, 'SceneWithPrefab.unity'),
                'MyEnemy',
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(Array.isArray(json)).toBe(true);
            expect(json.length).toBe(4);
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

    describe('update remove-override command', () => {
        it('should remove prefab override', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'update', 'remove-override',
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

    describe('update prefab-remove-component command', () => {
        it('should add component to m_RemovedComponents', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'update', 'prefab-remove-component',
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

    describe('delete prefab-instance command', () => {
        it('should delete PrefabInstance by fileID', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'delete', 'prefab-instance',
                    fixture.temp_path,
                    '700000',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('deleted_count');
                // Deletes PrefabInstance block + all stripped blocks referencing it
                expect(json.deleted_count).toBeGreaterThanOrEqual(3);

                // Verify PrefabInstance is gone from file
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).not.toContain('&700000');
            } finally {
                fixture.cleanup_fn();
            }
        });

        it('should delete PrefabInstance by name', () => {
            const fixture = create_temp_fixture(
                resolve(fixtures_dir, 'SceneWithPrefab.unity')
            );

            try {
                const result = run_cli([
                    'delete', 'prefab-instance',
                    fixture.temp_path,
                    'MyEnemy',
                    '--json'
                ]);
                const json = JSON.parse(result);
                expect(json).toHaveProperty('success', true);
                expect(json).toHaveProperty('deleted_count');
                expect(json.deleted_count).toBeGreaterThanOrEqual(3);

                // Verify MyEnemy PrefabInstance is gone
                const content = readFileSync(fixture.temp_path, 'utf-8');
                expect(content).not.toContain('MyEnemy');
            } finally {
                fixture.cleanup_fn();
            }
        });
    });
});
