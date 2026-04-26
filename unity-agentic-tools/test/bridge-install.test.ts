import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { add_package, remove_package } from '../src/packages';
import { install_bridge_package } from '../src/bridge-install';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'test-manifest');
const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

describe('bridge install helpers', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'bridge-install-test-'));
        cpSync(FIXTURE_DIR, tmp_dir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    describe('install (add_package)', () => {
        test('adds bridge package to manifest.json', () => {
            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.name).toBe(BRIDGE_PACKAGE_NAME);
            }

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(BRIDGE_PACKAGE_VERSION);
        });

        test('updates bridge package if already installed from a non-local source', () => {
            add_package(tmp_dir, BRIDGE_PACKAGE_NAME, 'https://example.com/old-url.git');
            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('updated');
            }

            const manifest = JSON.parse(readFileSync(join(tmp_dir, 'Packages', 'manifest.json'), 'utf-8'));
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(BRIDGE_PACKAGE_VERSION);
        });

        test('preserves an existing local file bridge dependency', () => {
            const manifest_path = join(tmp_dir, 'Packages', 'manifest.json');
            const manifest = JSON.parse(readFileSync(manifest_path, 'utf-8'));
            manifest.dependencies[BRIDGE_PACKAGE_NAME] = 'file:../../unity-agentic-tools/unity-package';
            writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('preserved');
                expect(result.version).toBe('file:../../unity-agentic-tools/unity-package');
            }

            const updated_manifest = JSON.parse(readFileSync(manifest_path, 'utf-8'));
            expect(updated_manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe('file:../../unity-agentic-tools/unity-package');
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
            const empty_dir = mkdtempSync(join(tmpdir(), 'bridge-install-empty-'));
            const result = add_package(empty_dir, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('manifest.json not found');
            }
            rmSync(empty_dir, { recursive: true, force: true });
        });
    });

});
