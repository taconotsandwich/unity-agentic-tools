import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, cpSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { add_package, remove_package } from '../src/packages';
import { collect_command_entries } from '../src/cmd-editor';

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

    describe('collect_command_entries', () => {
        test('returns compact output by default flags behavior', () => {
            const root = new Command('unity-agentic-tools');
            const read_cmd = new Command('read').description('Read data');
            read_cmd.command('scene <file>').description('Read scene').option('--json', 'Output json');
            root.addCommand(read_cmd);

            const entries = collect_command_entries(root, {
                scope: 'all',
                show_options: false,
                show_args: false,
                show_desc: false,
            });

            expect(entries).toEqual([
                { path: 'read' },
                { path: 'read scene' },
            ]);
        });

        test('includes options, args, and descriptions when enabled', () => {
            const root = new Command('unity-agentic-tools');
            const editor_cmd = new Command('editor').description('Editor bridge').option('--port <n>', 'Port override', '3000');
            editor_cmd.command('invoke <type> <member> [args...]')
                .description('Invoke method')
                .option('--args <json>', 'Argument json');
            root.addCommand(editor_cmd);

            const entries = collect_command_entries(root, {
                scope: 'editor',
                show_options: true,
                show_args: true,
                show_desc: true,
            });

            expect(entries[0].path).toBe('editor');
            expect(entries[0].description).toBe('Editor bridge');
            expect(entries[0].options?.some((o) => o.long === '--port')).toBe(true);

            const invoke_entry = entries.find((e) => e.path === 'editor invoke');
            expect(invoke_entry).toBeTruthy();
            expect(invoke_entry?.description).toBe('Invoke method');
            expect(invoke_entry?.args?.map((a) => a.name)).toEqual(['type', 'member', 'args']);
            expect(invoke_entry?.options?.some((o) => o.long === '--args')).toBe(true);
        });

        test('limits to top-level commands when scope is top', () => {
            const root = new Command('unity-agentic-tools');
            const create_cmd = new Command('create').description('Create things');
            create_cmd.command('scene <file>').description('Create scene');
            root.addCommand(create_cmd);
            root.addCommand(new Command('editor').description('Editor bridge'));

            const entries = collect_command_entries(root, {
                scope: 'top',
                show_options: false,
                show_args: false,
                show_desc: true,
            });

            expect(entries.map((e) => e.path)).toEqual(['create', 'editor']);
            expect(entries.some((e) => e.path === 'create scene')).toBe(false);
        });
    });
});
