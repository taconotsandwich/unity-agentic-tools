import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { add_package, remove_package } from '../src/packages';
import { install_bridge_package } from '../src/bridge-install';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'test-manifest');
const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const REMOTE_BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';
const LOCAL_BRIDGE_PACKAGE_PATH = join(__dirname, '..', '..', 'unity-package');
const LOCAL_BRIDGE_PACKAGE_VERSION = `file:${LOCAL_BRIDGE_PACKAGE_PATH.replace(/\\/g, '/')}`;

interface TestManifest {
    dependencies: Record<string, string>;
}

function read_test_manifest(project_path: string): TestManifest {
    return JSON.parse(readFileSync(join(project_path, 'Packages', 'manifest.json'), 'utf-8')) as TestManifest;
}

function write_test_package(package_path: string, name: string = BRIDGE_PACKAGE_NAME): void {
    mkdirSync(package_path, { recursive: true });
    writeFileSync(join(package_path, 'package.json'), JSON.stringify({ name }), 'utf-8');
}

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
        test('adds remote bridge package to manifest.json by default', () => {
            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.name).toBe(BRIDGE_PACKAGE_NAME);
                expect(result.version).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
            }

            const manifest = read_test_manifest(tmp_dir);
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
        });

        test('updates bridge package to remote URL if already installed from a non-local source', () => {
            add_package(tmp_dir, BRIDGE_PACKAGE_NAME, 'https://example.com/old-url.git');
            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('updated');
                expect(result.version).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
            }

            const manifest = read_test_manifest(tmp_dir);
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
        });

        test('preserves an existing local file bridge dependency', () => {
            const manifest_path = join(tmp_dir, 'Packages', 'manifest.json');
            write_test_package(join(tmp_dir, 'local-bridge'));
            const manifest = read_test_manifest(tmp_dir);
            manifest.dependencies[BRIDGE_PACKAGE_NAME] = 'file:../local-bridge';
            writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            const result = install_bridge_package(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('preserved');
                expect(result.version).toBe('file:../local-bridge');
            }

            const updated_manifest = read_test_manifest(tmp_dir);
            expect(updated_manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe('file:../local-bridge');
        });

        test('preserves an existing local tarball bridge dependency', () => {
            const manifest_path = join(tmp_dir, 'Packages', 'manifest.json');
            const tarball_path = join(tmp_dir, 'local-bridge.tgz');
            writeFileSync(tarball_path, 'archive fixture', 'utf-8');
            const manifest = read_test_manifest(tmp_dir);
            manifest.dependencies[BRIDGE_PACKAGE_NAME] = 'file:../local-bridge.tgz';
            writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            const result = install_bridge_package(tmp_dir);

            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.action).toBe('preserved');
                expect(result.version).toBe('file:../local-bridge.tgz');
            }
        });

        test('rejects an existing local file bridge dependency whose path is missing', () => {
            const manifest_path = join(tmp_dir, 'Packages', 'manifest.json');
            const manifest = read_test_manifest(tmp_dir);
            manifest.dependencies[BRIDGE_PACKAGE_NAME] = 'file:../missing-bridge';
            writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            const result = install_bridge_package(tmp_dir);

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Existing local bridge dependency');
                expect(result.error).toContain('--local <path>');
                expect(result.error).toContain('--remote');
            }
            expect(read_test_manifest(tmp_dir).dependencies[BRIDGE_PACKAGE_NAME]).toBe('file:../missing-bridge');
        });

        test('rejects an existing local file dependency for a different package', () => {
            const manifest_path = join(tmp_dir, 'Packages', 'manifest.json');
            write_test_package(join(tmp_dir, 'wrong-package'), 'com.example.wrong-package');
            const manifest = read_test_manifest(tmp_dir);
            manifest.dependencies[BRIDGE_PACKAGE_NAME] = 'file:../wrong-package';
            writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

            const result = install_bridge_package(tmp_dir);

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain(`declare name "${BRIDGE_PACKAGE_NAME}"`);
            }
            expect(read_test_manifest(tmp_dir).dependencies[BRIDGE_PACKAGE_NAME]).toBe('file:../wrong-package');
        });

        test('forces remote bridge package when requested', () => {
            const result = install_bridge_package(tmp_dir, { remote: true });
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.version).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
            }

            const manifest = read_test_manifest(tmp_dir);
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(REMOTE_BRIDGE_PACKAGE_VERSION);
        });

        test('uses explicit local package path when requested', () => {
            const result = install_bridge_package(tmp_dir, { local_package_path: LOCAL_BRIDGE_PACKAGE_PATH });
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.version).toBe(LOCAL_BRIDGE_PACKAGE_VERSION);
            }

            const manifest = read_test_manifest(tmp_dir);
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(LOCAL_BRIDGE_PACKAGE_VERSION);
        });

        test('auto-detects source checkout when local install is requested without a path', () => {
            const result = install_bridge_package(tmp_dir, { require_local: true });
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.action).toBe('added');
                expect(result.version).toBe(LOCAL_BRIDGE_PACKAGE_VERSION);
            }

            const manifest = read_test_manifest(tmp_dir);
            expect(manifest.dependencies[BRIDGE_PACKAGE_NAME]).toBe(LOCAL_BRIDGE_PACKAGE_VERSION);
        });

        test('accepts repo root as explicit local package path', () => {
            const result = install_bridge_package(tmp_dir, { local_package_path: join(__dirname, '..', '..') });
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.version).toBe(LOCAL_BRIDGE_PACKAGE_VERSION);
            }
        });

        test('returns error when explicit local package path is invalid', () => {
            const result = install_bridge_package(tmp_dir, { local_package_path: join(tmp_dir, 'missing') });
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Local bridge package not found');
            }
        });

        test('returns error when local and remote are both requested', () => {
            const result = install_bridge_package(tmp_dir, {
                local_package_path: LOCAL_BRIDGE_PACKAGE_PATH,
                remote: true,
            });
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Use either --local or --remote');
            }
        });
    });

    describe('uninstall (remove_package)', () => {
        test('removes bridge package from manifest.json', () => {
            add_package(tmp_dir, BRIDGE_PACKAGE_NAME, REMOTE_BRIDGE_PACKAGE_VERSION);
            const result = remove_package(tmp_dir, BRIDGE_PACKAGE_NAME);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.success).toBe(true);
                expect(result.name).toBe(BRIDGE_PACKAGE_NAME);
            }

            const manifest = read_test_manifest(tmp_dir);
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
            const result = add_package(empty_dir, BRIDGE_PACKAGE_NAME, REMOTE_BRIDGE_PACKAGE_VERSION);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('manifest.json not found');
            }
            rmSync(empty_dir, { recursive: true, force: true });
        });
    });

});
