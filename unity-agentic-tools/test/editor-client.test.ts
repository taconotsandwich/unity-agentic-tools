import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { call_editor, discover_editor_config, ping_editor, read_editor_config } from '../src/editor-client';

let original_websocket: typeof WebSocket | undefined;

interface MockRpcError {
    code: number;
    message: string;
}

interface MockPortBehavior {
    reachable?: boolean;
    reachable_sequence?: boolean[];
    bridge_info?: Record<string, unknown>;
    rpc_result?: unknown;
    rpc_error?: MockRpcError;
    rpc_error_sequence?: Array<MockRpcError | null>;
    close_before_response?: boolean;
    close_before_response_sequence?: boolean[];
}

function install_mock_websocket(port_behaviors: Record<number, MockPortBehavior>): void {
    const behavior_map = new Map<number, MockPortBehavior>(
        Object.entries(port_behaviors).map(([port, behavior]) => [Number(port), behavior]),
    );
    const connection_counts = new Map<number, number>();

    class MockWebSocket {
        public url: string;
        public onopen: (() => void) | null = null;
        public onmessage: ((event: { data: string }) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onclose: (() => void) | null = null;

        constructor(url: string) {
            this.url = url;
            const port = Number(new URL(url).port);
            const behavior = behavior_map.get(port);
            const connection_count = (connection_counts.get(port) ?? 0) + 1;
            connection_counts.set(port, connection_count);
            const reachable = resolve_reachable(behavior, connection_count);

            setTimeout(() => {
                if (reachable && behavior) {
                    this.onopen?.();
                    return;
                }

                this.onerror?.({ type: 'error' } as Event);
                this.onclose?.();
            }, 0);
        }

        public send(data: string): void {
            const port = Number(new URL(this.url).port);
            const behavior = behavior_map.get(port);
            if (!behavior) {
                return;
            }

            const request = JSON.parse(data) as { id: string; method: string };
            const connection_count = connection_counts.get(port) ?? 1;
            setTimeout(() => {
                const close_before_response = resolve_sequence_value(
                    behavior.close_before_response_sequence,
                    behavior.close_before_response ?? false,
                    connection_count,
                );
                if (close_before_response) {
                    this.onclose?.();
                    return;
                }

                if (request.method === 'editor.bridge.getInfo') {
                    if (behavior.bridge_info) {
                        this.onmessage?.({
                            data: JSON.stringify({
                                jsonrpc: '2.0',
                                id: request.id,
                                result: behavior.bridge_info,
                            }),
                        });
                        return;
                    }

                    this.onmessage?.({
                        data: JSON.stringify({
                            jsonrpc: '2.0',
                            id: request.id,
                            error: { code: -32601, message: 'Method not found: editor.bridge.getInfo' },
                        }),
                    });
                    return;
                }

                const rpc_error = resolve_sequence_value(
                    behavior.rpc_error_sequence,
                    behavior.rpc_error ?? null,
                    connection_count,
                );
                if (rpc_error) {
                    this.onmessage?.({
                        data: JSON.stringify({
                            jsonrpc: '2.0',
                            id: request.id,
                            error: rpc_error,
                        }),
                    });
                    return;
                }

                this.onmessage?.({
                    data: JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: behavior.rpc_result ?? { ok: true, port },
                    }),
                });
            }, 0);
        }

        public close(): void {
            this.onclose?.();
        }
    }

    original_websocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
}

function resolve_reachable(behavior: MockPortBehavior | undefined, connection_count: number): boolean {
    if (!behavior) {
        return false;
    }

    return resolve_sequence_value(behavior.reachable_sequence, behavior.reachable !== false, connection_count) !== false;
}

function resolve_sequence_value<T>(sequence: T[] | undefined, fallback: T, connection_count: number): T {
    if (sequence && sequence.length > 0) {
        const index = Math.min(connection_count - 1, sequence.length - 1);
        return sequence[index] as T;
    }

    return fallback;
}

describe('editor-client', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'editor-client-test-'));
    });

    afterEach(() => {
        if (original_websocket) {
            globalThis.WebSocket = original_websocket;
            original_websocket = undefined;
        }
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

        test('call_editor recovers without editor.json and sends the request to the matching discovered bridge', async () => {
            install_mock_websocket({
                53784: {
                    bridge_info: {
                        port: 53784,
                        pid: 1111,
                        version: '0.1.0',
                        project_path: join(tmp_dir, '..', 'other-project'),
                        project_name: 'other-project',
                    },
                    rpc_result: { ok: true, port: 53784 },
                },
                53785: {
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                    rpc_result: { ok: true, port: 53785 },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.playMode.getState',
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ ok: true, port: 53785 });
        });

        test('call_editor still allows explicit manual port fallback', async () => {
            install_mock_websocket({
                53786: {
                    rpc_result: { ok: true, port: 53786 },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.playMode.getState',
                timeout: 100,
                port: 53786,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ ok: true, port: 53786 });
        });

        test('transition-tolerant read actions keep retrying through temporary discovery loss', async () => {
            install_mock_websocket({
                53785: {
                    reachable_sequence: [false, false, false, true, true],
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                    rpc_result: { state: 'Playing' },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.playMode.getState',
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ state: 'Playing' });
        });

        test('command actions keep the shorter default recovery window', async () => {
            install_mock_websocket({
                53785: {
                    reachable_sequence: [false, false, false, true, true],
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                    rpc_result: { success: true },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.playMode.enter',
                timeout: 100,
            });

            expect(response.result).toBeUndefined();
            expect(response.error).toBeDefined();
            expect(response.error?.message).toContain('Autodiscovery could not find a matching Unity project bridge');
        });

        test('EditorApplication.isPlaying invoke gets transition-tolerant retries for play-mode entry', async () => {
            install_mock_websocket({
                53785: {
                    reachable_sequence: [false, false, false, true, true, true],
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                    rpc_result: { success: true },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.invoke',
                params: {
                    type: 'UnityEditor.EditorApplication',
                    member: 'isPlaying',
                    set: 'true',
                },
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ success: true });
        });

        test('EditorApplication.isPlaying invoke retries clean socket closes during play-mode entry', async () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53785,
                pid: process.pid,
                version: '0.1.0',
            }), 'utf-8');

            install_mock_websocket({
                53785: {
                    close_before_response_sequence: [false, true, false, false],
                    rpc_result: { success: true },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.invoke',
                params: {
                    type: 'UnityEditor.EditorApplication',
                    member: 'isPlaying',
                    set: 'true',
                },
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ success: true });
        });

        test('UnityAgenticTools.Util.PlayMode.GetState invoke gets transition-tolerant retries during play-mode transition', async () => {
            install_mock_websocket({
                53785: {
                    reachable_sequence: [false, false, false, true, true, true],
                    bridge_info: {
                        port: 53785,
                        pid: 2222,
                        version: '0.1.0',
                        project_path: tmp_dir,
                        project_name: 'editor-client-test',
                    },
                    rpc_result: { success: true },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.invoke',
                params: {
                    type: 'UnityAgenticTools.Util.PlayMode',
                    member: 'GetState',
                },
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ success: true });
        });

        test('UnityAgenticTools.Util.PlayMode.GetState invoke retries clean socket closes during play-mode transition', async () => {
            const config_dir = join(tmp_dir, '.unity-agentic');
            mkdirSync(config_dir, { recursive: true });
            writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
                port: 53785,
                pid: process.pid,
                version: '0.1.0',
            }), 'utf-8');

            install_mock_websocket({
                53785: {
                    close_before_response_sequence: [false, true, false, false],
                    rpc_result: { success: true },
                },
            });

            const response = await call_editor({
                project_path: tmp_dir,
                method: 'editor.invoke',
                params: {
                    type: 'UnityAgenticTools.Util.PlayMode',
                    member: 'GetState',
                },
                timeout: 100,
            });

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual({ success: true });
        });

        test('discover_editor_config does not return an unreachable cached project bridge', async () => {
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
