import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { ensure_gitignore_ignores_agentic_dir } from './gitignore';
import type {
    EditorConfig,
    EditorBridgeInfo,
    CallEditorOptions,
    StreamEditorOptions,
    RpcRequest,
    RpcResponse,
    RpcEvent,
} from './types';

const BRIDGE_PORT_RANGE_START = 53782;
const BRIDGE_PORT_RANGE_END = 53791;
const LAST_KNOWN_CONFIG_FILE = 'editor.last.json';

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

const LAST_KNOWN_EDITOR_CONFIGS = new Map<string, EditorConfig>();

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

/**
 * Read bridge identity directly from a known port.
 */
async function read_bridge_info(port: number, timeout_ms: number): Promise<EditorBridgeInfo | null> {
    const response = await request_editor_at_port({
        port,
        method: 'editor.bridge.getInfo',
        timeout: timeout_ms,
    });

    if (response.error) {
        return null;
    }

    return parse_bridge_info(response.result, port);
}

/**
 * Discover bridge identities by probing the known editor bridge port range.
 * Only bridges that can identify their owning Unity project are returned.
 */
async function discover_bridge_infos(timeout_ms: number, preferred_ports: number[] = []): Promise<EditorBridgeInfo[]> {
    const ports = new Set<number>();

    for (const port of preferred_ports) {
        if (Number.isInteger(port) && port >= BRIDGE_PORT_RANGE_START && port <= BRIDGE_PORT_RANGE_END) {
            ports.add(port);
        }
    }

    for (let port = BRIDGE_PORT_RANGE_START; port <= BRIDGE_PORT_RANGE_END; port += 1) {
        ports.add(port);
    }

    const results = await Promise.all(
        [...ports].map((port) => read_bridge_info(port, timeout_ms)),
    );

    return results.filter((result): result is EditorBridgeInfo => result !== null);
}

/**
 * Resolve a usable bridge config.
 * Prefers the lockfile when valid, otherwise discovers a matching bridge by project identity.
 * Manual port selection remains an explicit escape hatch rather than the default fallback.
 */
export async function discover_editor_config(project_path: string, timeout_ms: number = 350): Promise<EditorConfig | { error: string }> {
    const normalized_project_path = normalize_project_path(project_path);
    const lockfile_result = read_editor_config(project_path);
    const preferred_ports: number[] = [];
    let cached_config = read_cached_editor_config(project_path, normalized_project_path)
        ?? LAST_KNOWN_EDITOR_CONFIGS.get(normalized_project_path);
    let stale_cached_port: number | undefined;

    if (!('error' in lockfile_result)) {
        preferred_ports.push(lockfile_result.port);

        const direct_ping = await ping_editor(lockfile_result.port, timeout_ms);
        if (direct_ping.reachable) {
            const resolved_config: EditorConfig = {
                ...lockfile_result,
                project_path: normalized_project_path,
                source: 'lockfile',
            };
            remember_editor_config(normalized_project_path, resolved_config);
            return resolved_config;
        }
    }

    if (cached_config) {
        preferred_ports.push(cached_config.port);

        const cached_ping = await ping_editor(cached_config.port, timeout_ms);
        if (cached_ping.reachable) {
            const resolved_config: EditorConfig = {
                ...cached_config,
                project_path: normalized_project_path,
                source: 'cached',
            };
            remember_editor_config(normalized_project_path, resolved_config);
            return resolved_config;
        }

        stale_cached_port = cached_config.port;
        forget_cached_editor_config(project_path, normalized_project_path);
        cached_config = undefined;
    }

    const discovered_infos = await discover_bridge_infos(timeout_ms, preferred_ports);
    const matching_bridge = discovered_infos.find((info) =>
        normalize_project_path(info.project_path) === normalized_project_path,
    );

    if (matching_bridge) {
        const resolved_config: EditorConfig = {
            port: matching_bridge.port,
            pid: matching_bridge.pid,
            version: matching_bridge.version,
            project_path: matching_bridge.project_path,
            source: 'discovered',
        };
        remember_editor_config(normalized_project_path, resolved_config);
        return resolved_config;
    }

    const discovered_projects = discovered_infos.map((info) => `${info.project_name ?? '(unknown)'}:${info.project_path}@${info.port}`);
    const discovered_clause = discovered_projects.length > 0
        ? ` Reachable bridges were found for different projects: ${discovered_projects.join(', ')}.`
        : ` No reachable bridge in ports ${BRIDGE_PORT_RANGE_START}-${BRIDGE_PORT_RANGE_END} identified project ${normalized_project_path}.`;
    const stale_cache_clause = stale_cached_port !== undefined
        ? ` Cached bridge port ${stale_cached_port} was also unreachable.`
        : '';
    const port_hint = ' Use --port <n> only if you need to target a specific bridge manually.';

    if (!('error' in lockfile_result)) {
        return {
            error: `Editor bridge lockfile pointed to port ${lockfile_result.port}, but it was unreachable and autodiscovery could not find a matching Unity project bridge.${stale_cache_clause}${discovered_clause}${port_hint}`,
        };
    }

    return {
        error: `${lockfile_result.error} Autodiscovery could not find a matching Unity project bridge.${stale_cache_clause}${discovered_clause}${port_hint}`,
    };
}

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
 * Single-attempt JSON-RPC request to the Unity Editor.
 */
async function call_editor_once(options: CallEditorOptions, semantics: EditorActionSemantics): Promise<RpcResponse> {
    const { method, params, timeout = 10000, no_wait } = options;

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
            const request_id = generate_id();
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
 * Quick connectivity check: attempts a WebSocket handshake and immediately closes.
 * Returns whether the bridge is reachable within the timeout.
 */
export async function ping_editor(port: number, timeout_ms: number = 2000): Promise<{ reachable: boolean; error?: string }> {
    const url = `ws://127.0.0.1:${port}/unity-agentic`;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ reachable: false, error: `Timeout after ${timeout_ms}ms` });
        }, timeout_ms);

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                clearTimeout(timer);
                try { ws.close(); } catch { /* ignore */ }
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

async function request_editor_at_port(options: {
    port: number;
    method: string;
    params?: Record<string, unknown>;
    timeout: number;
    no_wait?: boolean;
}): Promise<RpcResponse> {
    const { port, method, params, timeout, no_wait } = options;
    const url = `ws://127.0.0.1:${port}/unity-agentic`;
    const request_id = generate_id();

    const wire_params: Record<string, unknown> = { ...params };
    if (timeout !== 10000) wire_params._timeout = timeout;
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

function parse_bridge_info(result: unknown, port: number): EditorBridgeInfo | null {
    if (!is_record(result)) {
        return null;
    }

    const project_path = typeof result.project_path === 'string' ? result.project_path : null;
    if (!project_path) {
        return null;
    }

    return {
        port,
        pid: typeof result.pid === 'number' ? result.pid : 0,
        version: typeof result.version === 'string' ? result.version : 'unknown',
        project_path,
        ...(typeof result.project_name === 'string' ? { project_name: result.project_name } : {}),
        ...(typeof result.unity_version === 'string' ? { unity_version: result.unity_version } : {}),
    };
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function remember_editor_config(project_path: string, config: EditorConfig): void {
    const cached_config: EditorConfig = {
        port: config.port,
        pid: config.pid,
        version: config.version,
        project_path: config.project_path ?? project_path,
        source: config.source,
    };

    LAST_KNOWN_EDITOR_CONFIGS.set(project_path, cached_config);
    write_cached_editor_config(project_path, cached_config);
}

function forget_cached_editor_config(project_path: string, normalized_project_path: string): void {
    LAST_KNOWN_EDITOR_CONFIGS.delete(normalized_project_path);

    const config_path = join(project_path, '.unity-agentic', LAST_KNOWN_CONFIG_FILE);
    try {
        if (existsSync(config_path)) {
            unlinkSync(config_path);
        }
    } catch {
        // Cache cleanup is best-effort. Discovery must still proceed without it.
    }
}

function read_cached_editor_config(project_path: string, normalized_project_path: string): EditorConfig | undefined {
    const config_path = join(project_path, '.unity-agentic', LAST_KNOWN_CONFIG_FILE);
    if (!existsSync(config_path)) {
        return undefined;
    }

    try {
        const raw = readFileSync(config_path, 'utf-8');
        const parsed = JSON.parse(raw) as EditorConfig;
        if (typeof parsed.port !== 'number' || typeof parsed.pid !== 'number' || typeof parsed.version !== 'string') {
            return undefined;
        }

        return {
            port: parsed.port,
            pid: parsed.pid,
            version: parsed.version,
            project_path: parsed.project_path ?? normalized_project_path,
            source: 'cached',
        };
    } catch {
        return undefined;
    }
}

function write_cached_editor_config(project_path: string, config: EditorConfig): void {
    const config_dir = join(project_path, '.unity-agentic');
    const config_path = join(config_dir, LAST_KNOWN_CONFIG_FILE);

    try {
        mkdirSync(config_dir, { recursive: true });
        ensure_gitignore_ignores_agentic_dir(project_path);
        writeFileSync(config_path, JSON.stringify({
            port: config.port,
            pid: config.pid,
            version: config.version,
            project_path: config.project_path,
        }, null, 2));
    } catch {
        // Cache writes are best-effort. Discovery must still work without them.
    }
}

function normalize_project_path(project_path: string): string {
    const resolved_path = resolve(project_path);

    let normalized = resolved_path;
    try {
        normalized = typeof realpathSync.native === 'function'
            ? realpathSync.native(resolved_path)
            : realpathSync(resolved_path);
    } catch {
        normalized = resolved_path;
    }

    return process.platform === 'win32'
        ? normalized.toLowerCase()
        : normalized;
}

function is_pid_alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        if (is_record(err) && err.code === 'EPERM') {
            return true;
        }

        return false;
    }
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

function generate_id(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
