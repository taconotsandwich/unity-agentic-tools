import type { RpcResponse } from './types';

export interface EditorActionSemantics {
    kind: 'read' | 'command' | 'stream';
    default_retries: number;
    retry_delays_ms: number[];
    discovery_timeout_ms: number;
}

export const CLIENT_DISCOVERY_UNAVAILABLE_CODE = -32010;

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

const READ_INVOKE_MEMBERS = new Set<string>([
    'UnityAgenticTools.Commands.Registry.List',
    'UnityAgenticTools.Util.PlayMode.GetState',
    'UnityEditor.EditorApplication.isCompiling',
    'UnityEditor.EditorApplication.isPlaying',
    'UnityEditor.EditorApplication.isUpdating',
]);

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
    'wait.for',
    'logs.tail',
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
    'UnityAgenticTools.Util.UI.Wait',
    'UnityAgenticTools.Bridge.Handlers.ConsoleHandler.GetLogs',
    'UnityEditor.EditorApplication.isCompiling',
    'UnityEditor.EditorApplication.isPlaying',
    'UnityEditor.EditorApplication.isUpdating',
]);

const PLAY_MODE_TRANSITION_RUN_TARGETS = new Set<string>([
    'play.enter',
    'play.exit',
    'UnityAgenticTools.Util.PlayMode.Enter',
    'UnityAgenticTools.Util.PlayMode.Exit',
    'UnityEditor.EditorApplication.isPlaying',
]);

const READ_RETRYABLE_CODES = new Set([-32000, -32002, -32003, CLIENT_DISCOVERY_UNAVAILABLE_CODE]);
const COMMAND_RETRYABLE_CODES = new Set([-32002, CLIENT_DISCOVERY_UNAVAILABLE_CODE]);
const TRANSITION_TOLERANT_COMMAND_RETRYABLE_CODES = new Set([
    -32000,
    -32002,
    -32003,
    CLIENT_DISCOVERY_UNAVAILABLE_CODE,
]);

export function get_action_semantics(
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

function is_read_invoke(method: string, params?: Record<string, unknown>): boolean {
    if (method !== 'editor.invoke' || !params) {
        return false;
    }

    if (typeof params.type === 'string' && typeof params.member === 'string') {
        const member = `${params.type}.${params.member}`;
        if (READ_INVOKE_MEMBERS.has(member) && params.set === undefined) {
            return true;
        }
    }

    if (params.type !== 'UnityAgenticTools.Commands.Registry' || params.member !== 'Run') {
        return false;
    }

    const request = parse_registry_run_request(params.args);
    return request !== undefined && !request.sets_property && READ_RUN_TARGETS.has(request.target);
}

function is_play_mode_transition_invoke(method: string, params?: Record<string, unknown>): boolean {
    if (method !== 'editor.invoke' || !params) {
        return false;
    }

    if (params.type === 'UnityEditor.EditorApplication' && params.member === 'isPlaying') {
        return params.set !== undefined;
    }

    if (params.type === 'UnityAgenticTools.Util.PlayMode' && typeof params.member === 'string') {
        return params.member === 'Enter' || params.member === 'Exit';
    }

    if (params.type === 'UnityAgenticTools.Commands.Registry' && params.member === 'Run') {
        const request = parse_registry_run_request(params.args);
        return request !== undefined && PLAY_MODE_TRANSITION_RUN_TARGETS.has(request.target);
    }

    return false;
}

interface RegistryRunRequest {
    target: string;
    sets_property: boolean;
}

function parse_registry_run_request(args: unknown): RegistryRunRequest | undefined {
    if (typeof args !== 'string') {
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(args);
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            return {
                target: parsed[0],
                sets_property: parsed.length >= 4,
            };
        }
    } catch {
        return undefined;
    }

    return undefined;
}

export function should_retry_response(response: RpcResponse, semantics: EditorActionSemantics): boolean {
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
