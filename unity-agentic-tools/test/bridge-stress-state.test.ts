import { describe, expect, it } from 'vitest';
import type { RpcResponse } from '../src/types';
import {
    read_command_error,
    read_is_compiling,
    read_is_paused,
    read_is_playing,
    read_state_string,
} from './bridge-stress-state';
import { TRANSIENT_ERROR_CODES } from './bridge-stress-summary';

function response(result: unknown): RpcResponse {
    return { jsonrpc: '2.0', id: '1', result };
}

describe('read_command_error', () => {
    it('returns undefined for a healthy envelope', () => {
        expect(read_command_error(response({ success: true, result: { refCount: 3 } }))).toBeUndefined();
    });

    it('returns undefined when the payload carries no success field', () => {
        expect(read_command_error(response({ result: { state: 'Stopped' } }))).toBeUndefined();
    });

    it('detects a command failure nested under a successful envelope', () => {
        const error = read_command_error(response({
            success: true,
            result: { success: false, error: 'Asset not found at Assets/Nope.unity.' },
        }));

        expect(error).toBe('Asset not found at Assets/Nope.unity.');
    });

    it('detects a failure on the outer envelope', () => {
        expect(read_command_error(response({ success: false, error: 'unknown target' }))).toBe('unknown target');
    });

    it('falls back to a generic message when no error string is present', () => {
        expect(read_command_error(response({ success: true, result: { success: false } })))
            .toBe('command reported failure');
    });

    it('returns undefined for a non-object result', () => {
        expect(read_command_error(response('ok'))).toBeUndefined();
        expect(read_command_error({ jsonrpc: '2.0', id: '1' })).toBeUndefined();
    });
});

describe('read_state_string', () => {
    it('reads state from a nested envelope', () => {
        expect(read_state_string(response({ success: true, result: { state: 'Playing' } }))).toBe('Playing');
    });

    it('reads state from a flat payload', () => {
        expect(read_state_string(response({ state: 'Stopped' }))).toBe('Stopped');
    });

    it('returns undefined on an RPC error', () => {
        const errored: RpcResponse = { jsonrpc: '2.0', id: '1', error: { code: -32000, message: 'restarting' } };

        expect(read_state_string(errored)).toBeUndefined();
    });

    it('returns undefined when state is absent or not a string', () => {
        expect(read_state_string(response({ result: {} }))).toBeUndefined();
        expect(read_state_string(response({ result: { state: 3 } }))).toBeUndefined();
    });
});

describe('read_is_playing', () => {
    it('reads isPlaying from the real play.state envelope', () => {
        const stopped = response({
            success: true,
            result: { state: 'Stopped', isPlaying: false, isPaused: false, isCompiling: false },
        });

        expect(read_is_playing(stopped)).toBe(false);
    });

    it('treats a paused Editor as playing', () => {
        const paused = response({
            success: true,
            result: { state: 'Paused', isPlaying: true, isPaused: true, isCompiling: false },
        });

        expect(read_is_playing(paused)).toBe(true);
        expect(read_state_string(paused)).toBe('Paused');
    });

    it('returns undefined on an RPC error', () => {
        const errored: RpcResponse = { jsonrpc: '2.0', id: '1', error: { code: -32000, message: 'restarting' } };

        expect(read_is_playing(errored)).toBeUndefined();
    });

    it('returns undefined when isPlaying is absent or not a boolean', () => {
        expect(read_is_playing(response({ result: { state: 'Stopped' } }))).toBeUndefined();
        expect(read_is_playing(response({ result: { isPlaying: 'yes' } }))).toBeUndefined();
    });
});

describe('read_is_compiling', () => {
    it('reads compilation state from play.state responses', () => {
        expect(read_is_compiling(response({
            success: true,
            result: { state: 'Stopped', isPlaying: false, isCompiling: true },
        }))).toBe(true);
    });

    it('returns undefined when compilation state is unavailable', () => {
        expect(read_is_compiling(response({ result: {} }))).toBeUndefined();
    });
});

describe('read_is_paused', () => {
    it('reads pause state from play.state responses', () => {
        expect(read_is_paused(response({
            success: true,
            result: { state: 'Paused', isPlaying: true, isPaused: true, isCompiling: false },
        }))).toBe(true);
    });

    it('returns undefined when pause state is unavailable', () => {
        expect(read_is_paused(response({ result: {} }))).toBeUndefined();
    });
});

describe('TRANSIENT_ERROR_CODES', () => {
    it('covers the connection-level codes and excludes timeouts', () => {
        expect([...TRANSIENT_ERROR_CODES].sort((a, b) => a - b)).toEqual([-32010, -32003, -32002, -32000]);
        expect(TRANSIENT_ERROR_CODES.has(-32001)).toBe(false);
    });
});
