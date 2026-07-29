import {
    discover_editor_config,
    is_pid_alive,
    read_candidate_editor_pid,
} from './editor-discovery';
import {
    DEFAULT_EDITOR_REQUEST_TIMEOUT_MS,
    generate_editor_request_id,
    request_editor_at_port,
} from './editor-transport';
import { is_record } from './util';
import type {
    CallEditorOptions,
    EditorConfig,
    EditorReadiness,
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

/**
 * Read-only Registry targets, by alias and by backing API name.
 *
 * This cannot be prefix-based: scene.hierarchy and scene.query are reads while
 * scene.open and scene.save are commands. Deriving it from the C# Registry is
 * ROADMAP Phase 1 work -- it needs a bridge round-trip and introduces version skew.
 */
const READ_RUN_TARGETS = new Set<string>([
    'scene.hierarchy',
    'scene.query',
    'query.assets',
    'query.asset',
    'query.scene',
    'query.object',
    'play.state',
    'ui.snapshot',
    'ui.query',
    'input.map',
    'tests.results',
    'UnityAgenticTools.Util.Hierarchy.Snapshot',
    'UnityAgenticTools.Util.Hierarchy.Query',
    'UnityAgenticTools.Query.Assets.Find',
    'UnityAgenticTools.Query.Assets.Info',
    'UnityAgenticTools.Query.Scene.Hierarchy',
    'UnityAgenticTools.Query.Scene.Object',
    'UnityAgenticTools.Util.PlayMode.GetState',
    'UnityAgenticTools.Util.UI.Snapshot',
    'UnityAgenticTools.Util.UI.Query',
    'UnityAgenticTools.Util.Input.Map',
    'UnityAgenticTools.Util.TestRunner.GetResults',
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
 * Wall-clock budget for waiting out a domain reload, spent only while the Editor
 * process is provably alive.
 *
 * Entering play mode reloads the domain, which stops the server; measured against a
 * large project the unreachable window runs 4-7s, wider than the fixed retry budgets
 * above (5.25-6.25s). That margin is why transition-time reads failed roughly 1 call
 * in 100. A deadline covers a slow reload without hard-coding a retry count that a
 * bigger project would outgrow again.
 */
const RELOAD_TOLERANCE_MS = 30_000;

/**
 * Poll interval while waiting out a reload. Shorter than the profiles' backoff
 * delays on purpose: once the server is back, this is the latency we add before
 * noticing, and each poll is only a TCP connect with a sub-second timeout.
 */
const RELOAD_POLL_INTERVAL_MS = 500;

/**
 * Send a single JSON-RPC request to the Unity Editor and return the result.
 * Automatically retries on transient connection errors (e.g., server restarting after assembly reload).
 */
export async function call_editor(options: CallEditorOptions): Promise<RpcResponse> {
    const semantics = get_action_semantics(options.method, 'unary', options.params);
    const explicit_retries = options.retries !== undefined;
    const max_retries = options.retries ?? semantics.default_retries;
    const delays = semantics.retry_delays_ms;
    const started = Date.now();

    // Read once up front, not lazily on the first poll: a failed cache ping makes
    // discovery forget the last-known record, so by the time retries are
    // exhausted the file this would have read is already gone. 0 means no source
    // could name a pid, which means there is nothing to wait on.
    const watched_pid = options.port === undefined ? read_candidate_editor_pid(options.project_path) : 0;

    let last_response: RpcResponse | undefined;

    for (let attempt = 0; ; attempt++) {
        last_response = await call_editor_once(options, semantics);

        if (!should_retry_response(last_response, semantics)) {
            return last_response;
        }

        if (attempt < max_retries) {
            await sleep(delays[Math.min(attempt, delays.length - 1)]);
            continue;
        }

        // An explicit retries option is a hard cap; otherwise keep waiting out a
        // domain reload while the Editor is still alive.
        if (explicit_retries || !within_reload_tolerance(options, started, watched_pid)) {
            return last_response;
        }

        await sleep(RELOAD_POLL_INTERVAL_MS);
    }
}

/**
 * True while it is worth waiting out a domain reload.
 *
 * The Unity process survives an assembly reload, so a live pid with an
 * unreachable server means "reloading" and a dead pid means "closed". The pid is
 * resolved once per call rather than re-read from editor.json every poll, which
 * keeps the retry path off a file Unity owns and rewrites -- the lockfile being
 * unreadable mid-reload is the window this budget exists to cover, so treating
 * it as "give up" defeated the purpose.
 */
function within_reload_tolerance(options: CallEditorOptions, started: number, watched_pid: number): boolean {
    if (options.port !== undefined) {
        return false;
    }

    if (Date.now() - started >= RELOAD_TOLERANCE_MS) {
        return false;
    }

    return watched_pid !== 0 && is_pid_alive(watched_pid);
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>(r => setTimeout(r, ms));
}

const READINESS_FIELDS = [
    'is_playing',
    'is_paused',
    'is_compiling',
    'is_updating',
    'is_playmode_transitioning',
    'is_reloading',
    'is_stable',
] as const;

/**
 * Ask a reachable bridge what the Editor is busy with. Accepting a socket only
 * proves the server is listening; these fields say whether a call will be served.
 */
export async function read_editor_readiness(
    port: number,
    timeout_ms: number,
): Promise<EditorReadiness | { error: string }> {
    const response = await request_editor_at_port({
        port,
        method: 'editor.bridge.getInfo',
        timeout: timeout_ms,
    });

    if (response.error) {
        return { error: response.error.message };
    }

    if (!is_record(response.result)) {
        return { error: 'Bridge returned no readiness fields' };
    }

    const info = response.result;
    const readiness: Partial<EditorReadiness> = {};

    for (const field of READINESS_FIELDS) {
        const value = info[field];
        if (typeof value !== 'boolean') {
            return { error: `Bridge did not report ${field}; the installed package may be older than this CLI` };
        }

        readiness[field] = value;
    }

    return readiness as EditorReadiness;
}

/**
 * Open a persistent WebSocket connection for streaming events (e.g., stream console).
 * Sends the initial RPC request, then calls on_event for each notification received.
 * Returns a cleanup function to close the connection.
 * Automatically reconnects when the server restarts (e.g., after domain reload).
 */
export async function stream_editor(options: StreamEditorOptions): Promise<{ close: () => void }> {
    const { method, params, timeout = 30000, on_event, on_error } = options;

    const semantics = get_action_semantics(method, 'stream', params);
    const config = await resolve_config(options, semantics.discovery_timeout_ms);
    if ('error' in config) {
        throw new Error(config.error);
    }

    let stopped = false;
    let reconnect_count = 0;
    let reconnect_deadline: number | undefined;
    let active_socket: WebSocket | undefined;

    return new Promise<{ close: () => void }>((resolve, reject) => {
        let resolved = false;

        // Closing must target the current socket, not the one captured when the
        // promise resolved -- after a reconnect those are different objects.
        function stop(): void {
            stopped = true;
            try { active_socket?.close(); } catch {}
        }

        function fail(error: Error): void {
            if (stopped) return;
            stop();

            if (!resolved) {
                resolved = true;
                reject(error);
                return;
            }

            on_error?.(error);
        }

        function schedule_reconnect(): void {
            if (stopped) return;

            // Bound by wall clock rather than an attempt count, for the same reason
            // the unary path is: a reload takes as long as it takes.
            reconnect_deadline ??= Date.now() + RELOAD_TOLERANCE_MS;
            if (Date.now() >= reconnect_deadline) {
                fail(new Error(`Stream lost: could not reconnect within ${RELOAD_TOLERANCE_MS}ms`));
                return;
            }

            reconnect_count += 1;
            const delay = Math.min(500 * reconnect_count, 3000);

            setTimeout(() => {
                if (stopped) return;

                void resolve_config(options, semantics.discovery_timeout_ms).then((fresh_config) => {
                    if (stopped) return;

                    // Discovery is unavailable for the whole reload window, so a single
                    // miss is the normal case, not a reason to abandon the stream.
                    if ('error' in fresh_config) {
                        schedule_reconnect();
                        return;
                    }

                    connect(`ws://127.0.0.1:${fresh_config.port}/unity-agentic`);
                });
            }, delay);
        }

        function connect(url: string): void {
            const ws = new WebSocket(url);
            active_socket = ws;

            const request_id = generate_editor_request_id();
            const request: RpcRequest = {
                jsonrpc: "2.0",
                id: request_id,
                method,
                ...(params ? { params } : {}),
            };

            let connected = false;
            let attempt_finished = false;

            /** Guards against one attempt both timing out and closing into two reconnects. */
            function finish_attempt(): boolean {
                if (attempt_finished) {
                    return false;
                }
                attempt_finished = true;
                clearTimeout(timer);
                return true;
            }

            // Every attempt gets a connecting timeout, reconnects included. This used
            // to be skipped once the promise had resolved, so a reconnect that opened
            // no socket and fired no close event stalled the chain forever.
            const timer = setTimeout(() => {
                if (connected || !finish_attempt() || stopped) return;

                if (!resolved) {
                    stopped = true;
                    reject(new Error(`Timeout connecting to ${url}`));
                    return;
                }

                try { ws.close(); } catch {}
                schedule_reconnect();
            }, timeout);

            ws.onopen = () => {
                connected = true;
                clearTimeout(timer);
                reconnect_count = 0;
                reconnect_deadline = undefined;
                ws.send(JSON.stringify(request));

                if (!resolved) {
                    resolved = true;
                    resolve({ close: stop });
                }
            };

            ws.onmessage = (event: MessageEvent) => {
                // Ignore non-JSON or partial frames; the bridge may interleave the
                // initial response with subsequent event notifications we forward.
                let data: unknown;
                try {
                    data = JSON.parse(String(event.data));
                } catch {
                    return;
                }

                if (typeof data !== 'object' || data === null) {
                    return;
                }

                if ('method' in data && !('id' in data)) {
                    on_event(data as RpcEvent);
                    return;
                }

                // An error response to our own subscribe request was dropped here,
                // leaving a connected stream that silently never emitted anything.
                const frame = data as { id?: unknown; error?: { message?: string } };
                if (frame.id === request_id && frame.error) {
                    fail(new Error(`Subscription rejected: ${frame.error.message ?? 'unknown error'}`));
                }
            };

            ws.onerror = () => {
                if (connected || !finish_attempt() || stopped) return;

                if (!resolved) {
                    stopped = true;
                    reject(new Error(`WebSocket connection failed to ${url}`));
                    return;
                }

                schedule_reconnect();
            };

            ws.onclose = () => {
                if (!finish_attempt() || stopped) return;

                // A close before the first open has to settle the promise here:
                // finish_attempt() just disarmed the timeout that used to do it.
                if (!resolved) {
                    stopped = true;
                    reject(new Error(`WebSocket connection failed to ${url}`));
                    return;
                }

                schedule_reconnect();
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

    if (is_read_invoke(method, params)) {
        return TRANSITION_TOLERANT_READ_SEMANTICS;
    }

    if (is_play_mode_transition_invoke(method, params)) {
        return TRANSITION_TOLERANT_COMMAND_SEMANTICS;
    }

    return DEFAULT_ACTION_SEMANTICS;
}

/**
 * Classify a Registry.Run invoke as a read.
 *
 * The CLI always sends method 'editor.invoke' and puts the real target inside
 * params.args, so classifying on the JSON-RPC method name alone never matches --
 * an earlier method-name set sat here and was unreachable for exactly that reason.
 */
function is_read_invoke(method: string, params?: Record<string, unknown>): boolean {
    if (method !== 'editor.invoke' || !params) {
        return false;
    }

    if (params.type !== 'UnityAgenticTools.Commands.Registry' || params.member !== 'Run') {
        return false;
    }

    const target = parse_registry_run_target(params.args);

    return typeof target === 'string' && READ_RUN_TARGETS.has(target);
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
