import {
    discover_editor_config,
} from './editor-discovery';
import {
    DEFAULT_EDITOR_REQUEST_TIMEOUT_MS,
    generate_editor_request_id,
    request_editor_at_port,
} from './editor-transport';
import type {
    CallEditorOptions,
    EditorConfig,
    RpcEvent,
    RpcRequest,
    RpcResponse,
    StreamEditorOptions,
} from './types';

export { discover_editor_config, read_editor_config } from './editor-discovery';
export { ping_editor } from './editor-transport';

interface EditorActionSemantics {
    kind: 'read' | 'command' | 'stream';
    default_retries: number;
    retry_delays_ms: number[];
    discovery_timeout_ms: number;
}

const CLIENT_DISCOVERY_UNAVAILABLE_CODE = -32010;

const DEFAULT_ACTION_SEMANTICS: EditorActionSemantics = {
    kind: 'command',
    default_retries: 2,
    retry_delays_ms: [500, 1000, 2000],
    discovery_timeout_ms: 350,
};

const TRANSITION_TOLERANT_READ_SEMANTICS: EditorActionSemantics = {
    kind: 'read',
    default_retries: 6,
    retry_delays_ms: [250, 500, 1000, 1500, 1500, 1500],
    discovery_timeout_ms: 250,
};

const TRANSITION_TOLERANT_COMMAND_SEMANTICS: EditorActionSemantics = {
    kind: 'command',
    default_retries: 5,
    retry_delays_ms: [250, 500, 1000, 1500, 2000],
    discovery_timeout_ms: 250,
};

const TRANSITION_TOLERANT_READ_METHODS = new Set<string>([
    'editor.playMode.getState',
    'editor.console.getLogs',
    'editor.hierarchy.snapshot',
    'editor.hierarchy.query',
    'editor.ui.snapshot',
    'editor.ui.query',
    'editor.input.map',
]);

const PLAY_MODE_RUN_TARGETS = new Set<string>([
    'play.enter',
    'play.exit',
    'play.pause',
    'play.step',
    'play.state',
    'UnityAgenticTools.Util.PlayMode.Enter',
    'UnityAgenticTools.Util.PlayMode.Exit',
    'UnityAgenticTools.Util.PlayMode.Pause',
    'UnityAgenticTools.Util.PlayMode.Step',
    'UnityAgenticTools.Util.PlayMode.GetState',
    'UnityEditor.EditorApplication.isPlaying',
]);

/** Error codes that indicate transient connection issues (server restarting after reload). */
const READ_RETRYABLE_CODES = new Set([-32000, -32002, -32003, CLIENT_DISCOVERY_UNAVAILABLE_CODE]);
const COMMAND_RETRYABLE_CODES = new Set([-32002, CLIENT_DISCOVERY_UNAVAILABLE_CODE]);
const TRANSITION_TOLERANT_COMMAND_RETRYABLE_CODES = new Set([-32000, -32002, -32003, CLIENT_DISCOVERY_UNAVAILABLE_CODE]);

/**
 * Send a single JSON-RPC request to the Unity Editor and return the result.
 * Automatically retries on transient connection errors (e.g., server restarting after assembly reload).
 */
export async function call_editor(options: CallEditorOptions): Promise<RpcResponse> {
    const semantics = get_action_semantics(options.method, 'unary', options.params);
    const maxRetries = options.retries ?? semantics.default_retries;

    let lastResponse: RpcResponse | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        lastResponse = await call_editor_once(options, semantics);

        if (!should_retry_response(lastResponse, semantics)) {
            return lastResponse;
        }

        if (attempt < maxRetries) {
            const delay = semantics.retry_delays_ms[Math.min(attempt, semantics.retry_delays_ms.length - 1)];
            await new Promise<void>(r => setTimeout(r, delay));
        }
    }

    return lastResponse!;
}

/**
 * Open a persistent WebSocket connection for streaming events (e.g., stream console).
 * Sends the initial RPC request, then calls on_event for each notification received.
 * Returns a cleanup function to close the connection.
 * Automatically reconnects when the server restarts (e.g., after domain reload).
 */
export async function stream_editor(options: StreamEditorOptions): Promise<{ close: () => void }> {
    const { method, params, timeout = 30000, on_event } = options;

    const semantics = get_action_semantics(method, 'stream', params);
    const config = await resolve_config(options, semantics.discovery_timeout_ms);
    if ('error' in config) {
        throw new Error(config.error);
    }

    const MAX_RECONNECTS = 5;
    let reconnect_count = 0;
    let stopped = false;

    return new Promise<{ close: () => void }>((resolve, reject) => {
        let resolved = false;

        function connect(url: string): void {
            const ws = new WebSocket(url);
            const request_id = generate_editor_request_id();
            const request: RpcRequest = {
                jsonrpc: "2.0",
                id: request_id,
                method,
                ...(params ? { params } : {}),
            };

            let connected = false;
            const timer = !resolved
                ? setTimeout(() => {
                    if (!connected && !resolved) {
                        reject(new Error(`Timeout connecting to ${url}`));
                    }
                }, timeout)
                : null;

            ws.onopen = () => {
                connected = true;
                if (timer) clearTimeout(timer);
                reconnect_count = 0;
                ws.send(JSON.stringify(request));
                if (!resolved) {
                    resolved = true;
                    resolve({ close: () => { stopped = true; ws.close(); } });
                }
            };

            ws.onmessage = (event: MessageEvent) => {
                // Ignore non-JSON or partial frames; the bridge may interleave the
                // initial response with subsequent event notifications we forward.
                try {
                    const data = JSON.parse(String(event.data));
                    if ('method' in data && !('id' in data)) {
                        on_event(data as RpcEvent);
                    }
                } catch {}
            };

            ws.onerror = () => {
                if (!connected && !resolved) {
                    if (timer) clearTimeout(timer);
                    reject(new Error(`WebSocket connection failed to ${url}`));
                }
            };

            ws.onclose = () => {
                if (stopped) return;
                if (!connected && !resolved) return;
                if (reconnect_count >= MAX_RECONNECTS) return;
                reconnect_count++;
                const delay = Math.min(500 * reconnect_count, 3000);
                setTimeout(async () => {
                    if (stopped) return;
                    const fresh_config = await resolve_config(options, semantics.discovery_timeout_ms);
                    if ('error' in fresh_config) return;
                    connect(`ws://127.0.0.1:${fresh_config.port}/unity-agentic`);
                }, delay);
            };
        }

        connect(`ws://127.0.0.1:${config.port}/unity-agentic`);
    });
}

/**
 * Single-attempt JSON-RPC request to the Unity Editor.
 */
async function call_editor_once(options: CallEditorOptions, semantics: EditorActionSemantics): Promise<RpcResponse> {
    const { method, params, timeout = DEFAULT_EDITOR_REQUEST_TIMEOUT_MS, no_wait } = options;

    const config = await resolve_config(options, semantics.discovery_timeout_ms);
    if ('error' in config) {
        return Promise.resolve({
            jsonrpc: "2.0" as const,
            id: "0",
            error: { code: CLIENT_DISCOVERY_UNAVAILABLE_CODE, message: config.error },
        });
    }

    return request_editor_at_port({
        port: config.port,
        method,
        params,
        timeout,
        no_wait,
    });
}

async function resolve_config(options: CallEditorOptions, discovery_timeout_ms: number): Promise<EditorConfig | { error: string }> {
    if (options.port) {
        return { port: options.port, pid: 0, version: "manual", source: 'manual' };
    }

    return discover_editor_config(options.project_path, discovery_timeout_ms);
}

function get_action_semantics(
    method: string,
    kind: 'unary' | 'stream' = 'unary',
    params?: Record<string, unknown>,
): EditorActionSemantics {
    if (kind === 'stream') {
        return {
            ...DEFAULT_ACTION_SEMANTICS,
            kind: 'stream',
        };
    }

    if (TRANSITION_TOLERANT_READ_METHODS.has(method)) {
        return TRANSITION_TOLERANT_READ_SEMANTICS;
    }

    if (is_play_mode_transition_invoke(method, params)) {
        return TRANSITION_TOLERANT_COMMAND_SEMANTICS;
    }

    return DEFAULT_ACTION_SEMANTICS;
}

function is_play_mode_transition_invoke(method: string, params?: Record<string, unknown>): boolean {
    if (method !== 'editor.invoke' || !params) {
        return false;
    }

    if (params.type === 'UnityEditor.EditorApplication' &&
        params.member === 'isPlaying') {
        return true;
    }

    if (params.type === 'UnityAgenticTools.Util.PlayMode' &&
        typeof params.member === 'string') {
        return params.member === 'Enter' ||
            params.member === 'Exit' ||
            params.member === 'Pause' ||
            params.member === 'Step' ||
            params.member === 'GetState';
    }

    if (params.type === 'UnityAgenticTools.Commands.Registry' &&
        params.member === 'Run') {
        const target = parse_registry_run_target(params.args);
        return typeof target === 'string' && PLAY_MODE_RUN_TARGETS.has(target);
    }

    return false;
}

function parse_registry_run_target(args: unknown): string | undefined {
    if (typeof args !== 'string') {
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(args);
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            return parsed[0];
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function should_retry_response(response: RpcResponse, semantics: EditorActionSemantics): boolean {
    if (!response.error) {
        return false;
    }

    if (semantics === TRANSITION_TOLERANT_COMMAND_SEMANTICS) {
        return TRANSITION_TOLERANT_COMMAND_RETRYABLE_CODES.has(response.error.code);
    }

    if (semantics.kind === 'read' || semantics.kind === 'stream') {
        return READ_RETRYABLE_CODES.has(response.error.code);
    }

    return COMMAND_RETRYABLE_CODES.has(response.error.code);
}
