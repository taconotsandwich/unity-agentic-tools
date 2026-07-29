import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discover_editor_config, ping_editor, read_editor_config } from '../src/editor-client';
import { install_mock_websocket, restore_websocket } from './editor-websocket-mock';

describe('editor-discovery', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'editor-discovery-test-'));
    });

    afterEach(() => {
        restore_websocket();
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

        test('treats EPERM from process.kill(pid, 0) as a live process', () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53782,
                pid: 424242,
                version: "0.1.0",
            }), 'utf-8');

            const original_kill = process.kill;
            process.kill = (((pid: number, signal?: NodeJS.Signals | number) => {
                if (pid === 424242 && signal === 0) {
                    const err = Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
                    throw err;
                }

                return original_kill(pid, signal);
            }) as typeof process.kill);

            try {
                const result = read_editor_config(tmp_dir);
                expect('error' in result).toBe(false);
                if (!('error' in result)) {
                    expect(result.port).toBe(53782);
                    expect(result.pid).toBe(424242);
                    expect(result.version).toBe("0.1.0");
                }
            } finally {
                process.kill = original_kill;
            }
        });
    });

    describe('discover_editor_config', () => {
        test('discovers a live bridge when editor.json is missing', async () => {
            install_mock_websocket({
                53784: {
                    bridge_info: {
                        port: 53784,
                        pid: 4242,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                        unity_version: '6000.4.0f1',
                    },
                },
            });

            const result = await discover_editor_config(tmp_dir, 20);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.port).toBe(53784);
                expect(result.pid).toBe(4242);
                expect(result.version).toBe('0.1.0');
                expect(result.project_path).toBe(tmp_dir);
                expect(result.source).toBe('discovered');
            }
            expect(readFileSync(join(tmp_dir, '.gitignore'), 'utf-8')).toBe('.unity-agentic/\n');
        });

        test('falls back to a discovered port when editor.json points to a dead port', async () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53782,
                pid: process.pid,
                version: '0.1.0',
            }), 'utf-8');

            install_mock_websocket({
                53784: {
                    bridge_info: {
                        port: 53784,
                        pid: 5151,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                },
            });

            const result = await discover_editor_config(tmp_dir, 20);
            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.port).toBe(53784);
                expect(result.pid).toBe(5151);
                expect(result.version).toBe('0.1.0');
                expect(result.source).toBe('discovered');
            }
        });

        test('ignores bridges from other projects and asks for manual port fallback instead of guessing', async () => {
            install_mock_websocket({
                53784: {
                    bridge_info: {
                        port: 53784,
                        pid: 4242,
                        version: '0.1.0',
                        project_path: join(tmp_dir, '..', 'other-project'),
                        project_name: 'other-project',
                    },
                },
            });

            const result = await discover_editor_config(tmp_dir, 20);
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('different projects');
                expect(result.error).toContain('--port <n>');
            }
        });

        test('does not return an unreachable cached project bridge', async () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53785,
                pid: process.pid,
                version: '0.1.0',
            }), 'utf-8');

            install_mock_websocket({
                53785: {
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                },
            });

            const initial = await discover_editor_config(tmp_dir, 20);
            expect('error' in initial).toBe(false);

            unlinkSync(join(config_dir, 'editor.json'));
            install_mock_websocket({
                53785: {
                    reachable: false,
                },
            });

            const cached = await discover_editor_config(tmp_dir, 20);
            expect('error' in cached).toBe(true);
            if ('error' in cached) {
                expect(cached.error).toContain('Cached bridge port 53785 was also unreachable');
            }

            expect(existsSync(join(config_dir, 'editor.last.json'))).toBe(false);
        });

        test('ping_editor reports a readable websocket failure instead of ErrorEvent', async () => {
            install_mock_websocket({
                53785: {
                    reachable: false,
                },
            });

            const result = await ping_editor(53785, 20);
            expect(result.reachable).toBe(false);
            expect(result.error).toContain('WebSocket connection failed to ws://127.0.0.1:53785/unity-agentic');
            expect(result.error).not.toBe('[object ErrorEvent]');
        });
    });
});
