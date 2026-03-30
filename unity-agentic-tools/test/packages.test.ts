import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { load_manifest, save_manifest, list_packages, add_package, remove_package } from '../src/packages';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'test-manifest');

describe('packages', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'pkg-test-'));
        cpSync(FIXTURE_DIR, tmp_dir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    describe('load_manifest', () => {
        test('loads valid manifest', () => {
            const result = load_manifest(tmp_dir);
            expect('manifest' in result).toBe(true);
            if ('manifest' in result) {
                expect(result.manifest.dependencies).toBeDefined();
                expect(Object.keys(result.manifest.dependencies).length).toBe(4);
            }
        });

        test('returns error for missing manifest', () => {
            const result = load_manifest('/tmp/nonexistent-dir');
            expect('error' in result).toBe(true);
        });

        test('returns error for invalid JSON', () => {
            const bad_dir = mkdtempSync(join(tmpdir(), 'pkg-bad-'));
            mkdirSync(join(bad_dir, 'Packages'), { recursive: true });
            require('fs').writeFileSync(join(bad_dir, 'Packages', 'manifest.json'), 'not json', 'utf-8');
            const result = load_manifest(bad_dir);
            expect('error' in result).toBe(true);
            rmSync(bad_dir, { recursive: true, force: true });
        });
    });

    describe('list_packages', () => {
        test('lists all packages', () => {
            const result = list_packages(tmp_dir);
            expect('packages' in result).toBe(true);
            if ('packages' in result) {
                expect(result.count).toBe(4);
                expect(result.packages.some(p => p.name === 'com.unity.ugui')).toBe(true);
            }
        });

        test('filters by search pattern', () => {
            const result = list_packages(tmp_dir, 'render');
            expect('packages' in result).toBe(true);
            if ('packages' in result) {
                expect(result.count).toBe(1);
                expect(result.packages[0].name).toBe('com.unity.render-pipelines.universal');
            }
        });

        test('returns empty for no match', () => {
            const result = list_packages(tmp_dir, 'nonexistent');
            expect('packages' in result).toBe(true);
            if ('packages' in result) {
                expect(result.count).toBe(0);
            }
        });
    });

    describe('add_package', () => {
        test('adds new package', () => {
            const result = add_package(tmp_dir, 'com.unity.cinemachine', '2.9.7');
            expect('success' in result).toBe(true);
            if ('success' in result) {
                expect(result.action).toBe('added');
                expect(result.name).toBe('com.unity.cinemachine');
            }

            // Verify it was written
            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies['com.unity.cinemachine']).toBe('2.9.7');
        });

        test('updates existing package', () => {
            const result = add_package(tmp_dir, 'com.unity.ugui', '2.0.0');
            expect('success' in result).toBe(true);
            if ('success' in result) {
                expect(result.action).toBe('updated');
            }

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies['com.unity.ugui']).toBe('2.0.0');
        });

        test('rejects invalid version', () => {
            const result = add_package(tmp_dir, 'com.unity.bad', 'not-a-version');
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Invalid version');
            }
        });

        test('accepts git URL version', () => {
            const result = add_package(tmp_dir, 'com.unity.git-pkg', 'https://github.com/user/repo.git');
            expect('success' in result).toBe(true);
        });

        test('accepts file: path version', () => {
            const result = add_package(tmp_dir, 'com.unity.local-pkg', 'file:../local-package');
            expect('success' in result).toBe(true);
        });

        test('rejects empty package name', () => {
            const result = add_package(tmp_dir, '', '1.0.0');
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('must not be empty');
            }
        });

        test('rejects package name with spaces', () => {
            const result = add_package(tmp_dir, 'com.test package', '1.0.0');
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('must not contain spaces');
            }
        });

        test('preserves original key order', () => {
            add_package(tmp_dir, 'com.unity.aaaa', '1.0.0');
            const raw = readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8');
            const deps = Object.keys(JSON.parse(raw).dependencies);
            // New package appended at end, existing order preserved
            expect(deps[deps.length - 1]).toBe('com.unity.aaaa');
        });
    });

    describe('remove_package', () => {
        test('removes existing package', () => {
            const result = remove_package(tmp_dir, 'com.unity.ugui');
            expect('success' in result).toBe(true);

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies['com.unity.ugui']).toBeUndefined();
        });

        test('returns error for non-existent package', () => {
            const result = remove_package(tmp_dir, 'com.unity.fake');
            expect('error' in result).toBe(true);
        });
    });

    describe('save_manifest', () => {
        test('writes with 2-space indent and trailing newline', () => {
            const result = load_manifest(tmp_dir);
            if ('manifest' in result) {
                save_manifest(result.path, result.manifest);
                const raw = readFileSync(result.path, 'utf-8');
                expect(raw.startsWith('{')).toBe(true);
                expect(raw.endsWith('}\n')).toBe(true);
                expect(raw).toContain('  "dependencies"');
            }
        });
    });
});
