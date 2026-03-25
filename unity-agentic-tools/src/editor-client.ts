import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
    EditorConfig,
    CallEditorOptions,
    StreamEditorOptions,
    RpcRequest,
    RpcResponse,
    RpcEvent,
} from './types';

/**
 * Read and validate the editor bridge lockfile.
 * Returns the config if valid, or an object with an error string.
 */
export function read_editor_config(project_path: string): EditorConfig | { error: string } {
    const config_path = join(project_path, '.unity-agentic', 'editor.json');

    if (!existsSync(config_path)) {
        return { error: `Editor bridge not found at ${config_path}. Is the Unity Editor running with the bridge package installed?` };
    }

    let config: EditorConfig;
    try {
        const raw = readFileSync(config_path, 'utf-8');
        config = JSON.parse(raw) as EditorConfig;
    } catch (err: unknown) {
        return { error: `Failed to parse editor.json: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (typeof config.port !== 'number' || typeof config.pid !== 'number') {
        return { error: 'Invalid editor.json: missing port or pid' };
    }

    if (!is_pid_alive(config.pid)) {
        return { error: `Unity Editor process (PID ${config.pid}) is not running. The editor may have been closed.` };
    }

    return config;
}

/** Error codes that indicate transient connection issues (server restarting after reload). */
const RETRYABLE_CODES = new Set([-32000, -32002, -32003]);

/** Delay schedule for retries (ms). Index = attempt number starting from 0. */
const RETRY_DELAYS = [500, 1000, 2000];

/**
 * Send a single JSON-RPC request to the Unity Editor and return the result.
 * Automatically retries on transient connection errors (e.g., server restarting after assembly reload).
 */
export async function call_editor(options: CallEditorOptions): Promise<RpcResponse> {
    const maxRetries = options.retries ?? 2;

    let lastResponse: RpcResponse | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        lastResponse = await call_editor_once(options);

        if (!lastResponse.error || !RETRYABLE_CODES.has(lastResponse.error.code)) {
            return lastResponse;
        }

        if (attempt < maxRetries) {
            const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
            await new Promise<void>(r => setTimeout(r, delay));
        }
    }

    return lastResponse!;
}

/**
 * Single-attempt JSON-RPC request to the Unity Editor.
 */
function call_editor_once(options: CallEditorOptions): Promise<RpcResponse> {
    const { method, params, timeout = 10000 } = options;

    const config = resolve_config(options);
    if ('error' in config) {
        return Promise.resolve({
            jsonrpc: "2.0" as const,
            id: "0",
            error: { code: -32000, message: config.error },
        });
    }

    const url = `ws://127.0.0.1:${config.port}/unity-agentic`;
    const request_id = generate_id();

    const request: RpcRequest = {
        jsonrpc: "2.0",
        id: request_id,
        method,
        ...(params ? { params } : {}),
    };

    return new Promise<RpcResponse>((resolve) => {
        let resolved = false;
        let ws: WebSocket;

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                try { ws?.close(); } catch {}
                resolve({
                    jsonrpc: "2.0",
                    id: request_id,
                    error: { code: -32001, message: `Timeout after ${timeout}ms waiting for response to ${method}` },
                });
            }
        }, timeout);

        try {
            ws = new WebSocket(url);

            ws.onopen = () => {
                ws.send(JSON.stringify(request));
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(String(event.data)) as RpcResponse;
                    if (data.id === request_id) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            ws.close();
                            resolve(data);
                        }
                    }
                } catch {}
            };

            ws.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve({
                        jsonrpc: "2.0",
                        id: request_id,
                        error: { code: -32002, message: `WebSocket connection failed to ${url}. Is the Unity Editor running?` },
                    });
                }
            };

            ws.onclose = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve({
                        jsonrpc: "2.0",
                        id: request_id,
                        error: { code: -32003, message: 'WebSocket connection closed before response received' },
                    });
                }
            };
        } catch (err: unknown) {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({
                    jsonrpc: "2.0",
                    id: request_id,
                    error: { code: -32002, message: `Failed to connect: ${err instanceof Error ? err.message : String(err)}` },
                });
            }
        }
    });
}

/**
 * Open a persistent WebSocket connection for streaming events (e.g., console-follow).
 * Sends the initial RPC request, then calls on_event for each notification received.
 * Returns a cleanup function to close the connection.
 */
export async function stream_editor(options: StreamEditorOptions): Promise<{ close: () => void }> {
    const { method, params, timeout = 30000, on_event } = options;

    const config = resolve_config(options);
    if ('error' in config) {
        throw new Error(config.error);
    }

    const url = `ws://127.0.0.1:${config.port}/unity-agentic`;
    const request_id = generate_id();

    const request: RpcRequest = {
        jsonrpc: "2.0",
        id: request_id,
        method,
        ...(params ? { params } : {}),
    };

    return new Promise<{ close: () => void }>((resolve, reject) => {
        let connected = false;

        const timer = setTimeout(() => {
            if (!connected) {
                reject(new Error(`Timeout connecting to ${url}`));
            }
        }, timeout);

        const ws = new WebSocket(url);

        ws.onopen = () => {
            connected = true;
            clearTimeout(timer);
            ws.send(JSON.stringify(request));
            resolve({ close: () => ws.close() });
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(String(event.data));
                if ('method' in data && !('id' in data)) {
                    on_event(data as RpcEvent);
                }
            } catch {}
        };

        ws.onerror = () => {
            if (!connected) {
                clearTimeout(timer);
                reject(new Error(`WebSocket connection failed to ${url}`));
            }
        };
    });
}

function resolve_config(options: CallEditorOptions): EditorConfig | { error: string } {
    if (options.port) {
        return { port: options.port, pid: 0, version: "unknown" };
    }
    return read_editor_config(options.project_path);
}

function is_pid_alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function generate_id(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
