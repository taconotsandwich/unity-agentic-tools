import { is_record } from './util';
import type {
    RpcRequest,
    RpcResponse,
} from './types';

/**
 * Default per-request timeout shared between the orchestration layer
 * (`call_editor` in editor-client.ts) and the wire layer (`request_editor_at_port`).
 * When a caller leaves the timeout at the default we omit the `_timeout` hint;
 * any non-default value is forwarded so the server can honor it.
 */
export const DEFAULT_EDITOR_REQUEST_TIMEOUT_MS = 10000;

export interface EditorPortRequestOptions {
    port: number;
    method: string;
    params?: Record<string, unknown>;
    timeout: number;
    no_wait?: boolean;
}

export interface EditorPingResult {
    reachable: boolean;
    error?: string;
}

/**
 * Send a JSON-RPC request directly to a known editor bridge port.
 */
export async function request_editor_at_port(options: EditorPortRequestOptions): Promise<RpcResponse> {
    const { port, method, params, timeout, no_wait } = options;
    const url = `ws://127.0.0.1:${port}/unity-agentic`;
    const request_id = generate_editor_request_id();

    const wire_params: Record<string, unknown> = { ...params };
    if (timeout !== DEFAULT_EDITOR_REQUEST_TIMEOUT_MS) wire_params._timeout = timeout;
    if (no_wait) wire_params.no_wait = true;

    const request: RpcRequest = {
        jsonrpc: "2.0",
        id: request_id,
        method,
        ...(Object.keys(wire_params).length > 0 ? { params: wire_params } : {}),
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
                if (no_wait && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    setTimeout(() => { try { ws.close(); } catch {} }, 200);
                    resolve({
                        jsonrpc: "2.0",
                        id: request_id,
                        result: { queued: true },
                    });
                }
            };

            ws.onmessage = (event: MessageEvent) => {
                // Ignore non-JSON or partial frames; the bridge may interleave event
                // notifications with the response we are awaiting.
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
 * Quick connectivity check: attempts a WebSocket handshake and immediately closes.
 * Returns whether the bridge is reachable within the timeout.
 */
export async function ping_editor(port: number, timeout_ms: number = 2000): Promise<EditorPingResult> {
    const url = `ws://127.0.0.1:${port}/unity-agentic`;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ reachable: false, error: `Timeout after ${timeout_ms}ms` });
        }, timeout_ms);

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                clearTimeout(timer);
                try { ws.close(); } catch {}
                resolve({ reachable: true });
            };

            ws.onerror = (err: Event) => {
                clearTimeout(timer);
                resolve({ reachable: false, error: describe_websocket_error(err, `WebSocket connection failed to ${url}`) });
            };
        } catch (err) {
            clearTimeout(timer);
            resolve({ reachable: false, error: describe_websocket_error(err, `WebSocket connection failed to ${url}`) });
        }
    });
}

export function generate_editor_request_id(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function describe_websocket_error(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message.trim().length > 0) {
        return err.message;
    }

    if (is_record(err)) {
        if (typeof err.message === 'string' && err.message.trim().length > 0) {
            return err.message;
        }

        if (err.error instanceof Error && err.error.message.trim().length > 0) {
            return err.error.message;
        }

        if (typeof err.type === 'string' && err.type.trim().length > 0) {
            return `${fallback} (${err.type})`;
        }
    }

    const stringified = String(err);
    if (stringified && stringified !== '[object Event]' && stringified !== '[object ErrorEvent]') {
        return stringified;
    }

    return fallback;
}
