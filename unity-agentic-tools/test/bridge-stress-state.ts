import type { RpcResponse } from '../src/types';

export interface PlayBaseline {
    playing: boolean;
    paused: boolean;
}

function as_record(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
        ? value as Record<string, unknown>
        : undefined;
}

function read_state_payload(response: RpcResponse): Record<string, unknown> | undefined {
    if (response.error) {
        return undefined;
    }

    const envelope = as_record(response.result);
    return envelope === undefined ? undefined : (as_record(envelope.result) ?? envelope);
}

export function read_command_error(response: RpcResponse): string | undefined {
    const envelope = as_record(response.result);
    if (envelope === undefined) {
        return undefined;
    }

    const inner = as_record(envelope.result) ?? envelope;

    for (const layer of [envelope, inner]) {
        if (layer.success === false) {
            return typeof layer.error === 'string' ? layer.error : 'command reported failure';
        }
    }

    return undefined;
}

export function read_is_playing(response: RpcResponse): boolean | undefined {
    const is_playing = read_state_payload(response)?.isPlaying;
    return typeof is_playing === 'boolean' ? is_playing : undefined;
}

export function read_is_compiling(response: RpcResponse): boolean | undefined {
    const is_compiling = read_state_payload(response)?.isCompiling;
    return typeof is_compiling === 'boolean' ? is_compiling : undefined;
}

export function read_is_paused(response: RpcResponse): boolean | undefined {
    const is_paused = read_state_payload(response)?.isPaused;
    return typeof is_paused === 'boolean' ? is_paused : undefined;
}

export function read_state_string(response: RpcResponse): string | undefined {
    const state = read_state_payload(response)?.state;
    return typeof state === 'string' ? state : undefined;
}
