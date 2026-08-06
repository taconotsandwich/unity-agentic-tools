import {
    discover_editor_config,
    is_pid_alive,
    read_candidate_editor_pid,
} from './editor-discovery';
import {
    CLIENT_DISCOVERY_UNAVAILABLE_CODE,
    get_action_semantics,
    should_retry_response,
    type EditorActionSemantics,
} from './editor-action-semantics';
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

        const error = last_response.error;
        if (!error || !should_retry_response(last_response, semantics)) {
            return last_response;
        }

        if (attempt < max_retries) {
            const delay_ms = delays[Math.min(attempt, delays.length - 1)];
            options.on_retry?.({
                code: error.code,
                attempt: attempt + 1,
                delay_ms,
            });
            await sleep(delay_ms);
            continue;
        }

        // An explicit retries option is a hard cap; otherwise keep waiting out a
        // domain reload while the Editor is still alive.
        if (explicit_retries || !within_reload_tolerance(options, started, watched_pid)) {
            return last_response;
        }

        options.on_retry?.({
            code: error.code,
            attempt: attempt + 1,
            delay_ms: RELOAD_POLL_INTERVAL_MS,
        });
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
    let reconnect_deadline_timer: ReturnType<typeof setTimeout> | undefined;
    let active_socket: WebSocket | undefined;

    return new Promise<{ close: () => void }>((resolve, reject) => {
        let resolved = false;

        // Closing must target the current socket, not the one captured when the
        // promise resolved -- after a reconnect those are different objects.
        function stop(): void {
            stopped = true;
            clear_reconnect_window();
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

        function clear_reconnect_window(): void {
            if (reconnect_deadline_timer !== undefined) {
                clearTimeout(reconnect_deadline_timer);
                reconnect_deadline_timer = undefined;
            }

            reconnect_deadline = undefined;
        }

        function ensure_reconnect_window(): boolean {
            if (reconnect_deadline === undefined) {
                reconnect_deadline = Date.now() + RELOAD_TOLERANCE_MS;
                reconnect_deadline_timer = setTimeout(() => {
                    if (!stopped && reconnect_deadline !== undefined) {
                        fail(new Error(`Stream lost: could not reconnect within ${RELOAD_TOLERANCE_MS}ms`));
                    }
                }, RELOAD_TOLERANCE_MS);
            }

            if (Date.now() >= reconnect_deadline) {
                fail(new Error(`Stream lost: could not reconnect within ${RELOAD_TOLERANCE_MS}ms`));
                return false;
            }

            return true;
        }

        function schedule_reconnect(): void {
            if (stopped || !ensure_reconnect_window()) return;

            // Bound by wall clock rather than an attempt count, for the same reason
            // the unary path is: a reload takes as long as it takes.
            reconnect_count += 1;
            const delay = Math.min(500 * reconnect_count, 3000);

            setTimeout(() => {
                if (stopped || !ensure_reconnect_window()) return;

                void resolve_config(options, semantics.discovery_timeout_ms).then((fresh_config) => {
                    if (stopped || !ensure_reconnect_window()) return;

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

            function handle_attempt_timeout(): void {
                if (!finish_attempt() || stopped) return;

                if (!resolved) {
                    stop();
                    reject(new Error(`Timeout connecting to ${url}`));
                    return;
                }

                try { ws.close(); } catch {}
                schedule_reconnect();
            }

            let timer = setTimeout(handle_attempt_timeout, timeout);

            ws.onopen = () => {
                if (attempt_finished || stopped || ws !== active_socket) return;

                connected = true;
                // A socket open does not prove the subscription was accepted. Keep
                // any active reconnect deadline until an acknowledgement or event.
                ws.send(JSON.stringify(request));
                clearTimeout(timer);
                timer = setTimeout(handle_attempt_timeout, timeout);

                if (!resolved) {
                    resolved = true;
                    resolve({ close: stop });
                }
            };

            ws.onmessage = (event: MessageEvent) => {
                if (attempt_finished || stopped || ws !== active_socket) return;

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

                if ('jsonrpc' in data && data.jsonrpc === '2.0' &&
                    'method' in data && typeof data.method === 'string' &&
                    !('id' in data)) {
                    confirm_subscription(ws, timer);
                    on_event(data as RpcEvent);
                    return;
                }

                // An error response to our own subscribe request was dropped here,
                // leaving a connected stream that silently never emitted anything.
                const frame = data as { id?: unknown; result?: unknown; error?: { message?: string } };
                if (frame.id === request_id) {
                    if (frame.error) {
                        fail(new Error(`Subscription rejected: ${frame.error.message ?? 'unknown error'}`));
                        return;
                    }

                    if ('result' in frame) {
                        confirm_subscription(ws, timer);
                    }
                }
            };

            ws.onerror = () => {
                if (ws !== active_socket || connected || !finish_attempt() || stopped) return;

                if (!resolved) {
                    stopped = true;
                    reject(new Error(`WebSocket connection failed to ${url}`));
                    return;
                }

                schedule_reconnect();
            };

            ws.onclose = () => {
                if (ws !== active_socket || !finish_attempt() || stopped) return;

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

        function confirm_subscription(ws: WebSocket, attempt_timer: ReturnType<typeof setTimeout>): void {
            if (ws !== active_socket) {
                return;
            }

            clearTimeout(attempt_timer);
            reconnect_count = 0;
            clear_reconnect_window();
        }
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
