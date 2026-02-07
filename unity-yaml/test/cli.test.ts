import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { create_temp_fixture } from './test-utils';
import { isNativeModuleAvailable } from '../src/scanner';

const repo_root = resolve(__dirname, '..');
const fixtures_dir = resolve(__dirname, 'fixtures');

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
});
