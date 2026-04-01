import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { add_package, remove_package } from '../src/packages';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'test-manifest');
const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

describe('cmd-editor', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'cmd-editor-test-'));
        cpSync(FIXTURE_DIR, tmp_dir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    describe('install (add_package)', () => {
        test('adds bridge package to manifest.json', () => {
            const result = add_package(tmp_dir, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.name).toBe(BRIDGE_PACKAGE_NAME);
            }

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(BRIDGE_PACKAGE_VERSION);
        });

        test('updates bridge package if already installed', () => {
            add_package(tmp_dir, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            const result = add_package(tmp_dir, BRIDGE_PACKAGE_NAME, 'https://example.com/new-url.git');
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('updated');
            }
        });
    });

    describe('uninstall (remove_package)', () => {
        test('removes bridge package from manifest.json', () => {
            add_package(tmp_dir, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            const result = remove_package(tmp_dir, BRIDGE_PACKAGE_NAME);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.name).toBe(BRIDGE_PACKAGE_NAME);
            }

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBeUndefined();
        });

        test('returns error when bridge package not installed', () => {
            const result = remove_package(tmp_dir, BRIDGE_PACKAGE_NAME);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('not found');
            }
        });
    });

    describe('install with missing manifest', () => {
        test('returns error when manifest.json not found', () => {
            const empty_dir = mkdtempSync(join(tmpdir(), 'cmd-editor-empty-'));
            const result = add_package(empty_dir, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('manifest.json not found');
            }
            rmSync(empty_dir, { recursive: true, force: true });
        });
    });
});
