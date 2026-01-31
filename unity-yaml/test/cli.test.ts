import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { create_temp_fixture } from './test-utils';

const repo_root = resolve(__dirname, '..');
const fixtures_dir = resolve(__dirname, 'fixtures');

function run_cli(args: string[]): string {
    return execFileSync('bun', ['dist/cli.js', ...args], {
        cwd: repo_root,
        encoding: 'utf-8'
    });
}

describe('CLI', () => {
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
        it('should list all GameObjects', () => {
            const result = run_cli([
                'list',
                resolve(fixtures_dir, 'TestSample.unity'),
                '--json'
            ]);
            const json = JSON.parse(result);
            expect(json).toHaveProperty('file');
            expect(json).toHaveProperty('count');
            expect(json).toHaveProperty('objects');
            expect(Array.isArray(json.objects)).toBe(true);
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
