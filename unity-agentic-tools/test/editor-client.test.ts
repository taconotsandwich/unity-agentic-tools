import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { read_editor_config } from '../src/editor-client';

describe('editor-client', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'editor-client-test-'));
    });

    afterEach(() => {
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    describe('read_editor_config', () => {
        test('returns error when editor.json does not exist', () => {
            const result = read_editor_config(tmp_dir);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Editor bridge not found');
            }
        });

        test('returns error when editor.json is invalid JSON', () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), 'not json', 'utf-8');

            const result = read_editor_config(tmp_dir);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('Failed to parse');
            }
        });

        test('returns error when port or pid is missing', () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({ version: "0.1.0" }), 'utf-8');

            const result = read_editor_config(tmp_dir);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('missing port or pid');
            }
        });

        test('returns error when PID is not alive', () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53782,
                pid: 999999999,
                version: "0.1.0",
            }), 'utf-8');

            const result = read_editor_config(tmp_dir);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('not running');
            }
        });

        test('returns config when PID is alive (current process)', () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53782,
                pid: process.pid,
                version: "0.1.0",
            }), 'utf-8');

            const result = read_editor_config(tmp_dir);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.port).toBe(53782);
                expect(result.pid).toBe(process.pid);
                expect(result.version).toBe("0.1.0");
            }
        });
    });
});
