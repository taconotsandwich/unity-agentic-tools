import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

let original_websocket: typeof WebSocket | undefined;

export interface MockRpcError {
    code: number;
    message: string;
}

export interface MockWindow {
    start: number;
    end: number;
}

/** Lets a test assert which socket a close() actually reached. */
export interface MockSocketRecord {
    port: number;
    opened: boolean;
    closed: boolean;
}

export interface MockPortBehavior {
    reachable?: boolean;
    reachable_sequence?: boolean[];
    /**
     * Unreachable until this many ms after the mock is installed, then reachable.
     * Models a domain reload. Prefer this over reachable_sequence when the assertion
     * is about how long the client waits: discovery opens a variable number of
     * connections per attempt, so a count-based sequence cannot express a duration.
     */
    reachable_after_ms?: number;
    bridge_info?: Record<string, unknown>;
    rpc_result?: unknown;
    rpc_error?: MockRpcError;
    rpc_error_sequence?: Array<MockRpcError | null>;
    close_before_response?: boolean;
    close_before_response_sequence?: boolean[];
    /**
     * Models a domain reload, measured from mock install: already-open sockets are
     * closed at `start`, connections attempted inside the window fail, and the port
     * behaves normally again after `end`.
     */
    reload_window_ms?: MockWindow;
    /**
     * Sockets opened inside this window never fire open, error, or close -- the case
     * that only a per-attempt connecting timeout can break out of.
     */
    hang_window_ms?: MockWindow;
    /** Notification pushed to the client after a non-getInfo request is answered. */
    stream_event?: Record<string, unknown>;
}

export function install_mock_websocket(port_behaviors: Record<number, MockPortBehavior>): MockSocketRecord[] {
    const behavior_map = new Map<number, MockPortBehavior>(
        Object.entries(port_behaviors).map(([port, behavior]) => [Number(port), behavior]),
    );
    const connection_counts = new Map<number, number>();
    const sockets: MockSocketRecord[] = [];
    const installed_at = Date.now();

    class MockWebSocket {
        public url: string;
        public onopen: (() => void) | null = null;
        public onmessage: ((event: { data: string }) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onclose: (() => void) | null = null;

        private record: MockSocketRecord;

        constructor(url: string) {
            this.url = url;
            const port = Number(new URL(url).port);
            const behavior = behavior_map.get(port);
            const connection_count = (connection_counts.get(port) ?? 0) + 1;
            connection_counts.set(port, connection_count);
            const elapsed = Date.now() - installed_at;
            const reload = behavior?.reload_window_ms;
            const reachable = !in_window(reload, elapsed)
                && resolve_reachable(behavior, connection_count, installed_at);

            this.record = { port, opened: false, closed: false };
            sockets.push(this.record);

            if (in_window(behavior?.hang_window_ms, elapsed)) {
                return;
            }

            setTimeout(() => {
                if (reachable && behavior) {
                    this.record.opened = true;
                    this.onopen?.();

                    if (reload && elapsed < reload.start) {
                        setTimeout(() => this.close(), reload.start - elapsed);
                    }

                    return;
                }

                this.onerror?.({ type: 'error' } as Event);
                this.close();
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
                    this.close();
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

                if (behavior.stream_event) {
                    this.onmessage?.({ data: JSON.stringify(behavior.stream_event) });
                }
            }, 0);
        }

        public close(): void {
            if (this.record.closed) {
                return;
            }

            this.record.closed = true;
            this.onclose?.();
        }
    }

    original_websocket ??= globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    return sockets;
}

export function restore_websocket(): void {
    if (original_websocket) {
        globalThis.WebSocket = original_websocket;
        original_websocket = undefined;
    }
}

function in_window(window: MockWindow | undefined, elapsed: number): boolean {
    return window !== undefined && elapsed >= window.start && elapsed < window.end;
}

function resolve_reachable(
    behavior: MockPortBehavior | undefined,
    connection_count: number,
    installed_at: number,
): boolean {
    if (!behavior) {
        return false;
    }

    if (behavior.reachable_after_ms !== undefined) {
        return Date.now() - installed_at >= behavior.reachable_after_ms;
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

/** Above macOS's default maximum pid, so process.kill(pid, 0) always reports ESRCH. */
export const DEAD_PID = 999_999;

/**
 * Longer than the default profile's fixed retry budget (500 + 1000ms of backoff),
 * so only the reload-tolerance path can outlast it.
 */
export const RELOAD_WINDOW_MS = 2_500;

export function write_lockfile(dir: string, port: number, pid: number): void {
    const config_dir = join(dir, '.unity-agentic');
    mkdirSync(config_dir, { recursive: true });
    writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({ port, pid, version: '0.1.0' }), 'utf-8');
}

/** Mirrors what cli.ts sends: the real target lives inside params.args, not the method. */
export function registry_run_params(target: string, args: string[] = []): Record<string, unknown> {
    return {
        type: 'UnityAgenticTools.Commands.Registry',
        member: 'Run',
        args: JSON.stringify([target, JSON.stringify(args)]),
    };
}
