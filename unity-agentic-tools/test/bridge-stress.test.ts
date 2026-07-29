import { describe, expect, it } from 'vitest';
import {
    COMMAND_ERROR_KEY,
    parse_args,
    percentile,
    read_command_error,
    read_is_playing,
    read_state_string,
    summarize,
    TRANSIENT_ERROR_CODES,
} from './run-bridge-stress';
import type { CallRecord } from './run-bridge-stress';
import type { RpcResponse } from '../src/types';

function response(result: unknown): RpcResponse {
    return { jsonrpc: '2.0', id: '1', result };
}

const PROJECT = '/Users/dev/Projects/demo';

describe('parse_args', () => {
    it('requires --project', () => {
        expect(() => parse_args([], {})).toThrow('--project is required');
    });

    it('requires an absolute project path', () => {
        expect(() => parse_args(['--project', 'demo'], {})).toThrow('--project must be an absolute path');
    });

    it('uses UNITY_PROJECT when --project is omitted', () => {
        const options = parse_args([], { UNITY_PROJECT: PROJECT });

        expect(options.project_path).toBe(PROJECT);
    });

    it('applies defaults', () => {
        const options = parse_args(['--project', PROJECT], {});

        expect(options).toEqual({
            project_path: PROJECT,
            cycles: 3,
            reads_per_phase: 8,
            timeout_ms: 15_000,
            no_retry: false,
            compile_cycles: false,
        });
    });

    it('parses supported options', () => {
        const options = parse_args([
            '--project', PROJECT,
            '--cycles', '5',
            '--reads', '12',
            '--timeout-ms', '2000',
            '--no-retry',
            '--compile-cycles',
        ], {});

        expect(options).toEqual({
            project_path: PROJECT,
            cycles: 5,
            reads_per_phase: 12,
            timeout_ms: 2000,
            no_retry: true,
            compile_cycles: true,
        });
    });

    it('rejects unknown arguments', () => {
        expect(() => parse_args(['--project', PROJECT, '--nope'], {})).toThrow('Unknown argument: --nope');
    });

    it('rejects a missing flag value', () => {
        expect(() => parse_args(['--project', PROJECT, '--cycles', '--no-retry'], {})).toThrow('Missing value for --cycles');
    });

    it('rejects non-positive counts', () => {
        expect(() => parse_args(['--project', PROJECT, '--cycles', '0'], {})).toThrow('Invalid --cycles value: 0');
    });
});

describe('percentile', () => {
    it('returns 0 for an empty sample', () => {
        expect(percentile([], 95)).toBe(0);
    });

    it('returns the only value for a single sample', () => {
        expect(percentile([42], 50)).toBe(42);
    });

    it('returns exact values at the bounds', () => {
        const sorted = [1, 2, 3, 4, 5];

        expect(percentile(sorted, 0)).toBe(1);
        expect(percentile(sorted, 100)).toBe(5);
    });

    it('interpolates between neighbours', () => {
        expect(percentile([0, 10], 50)).toBe(5);
        expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    });
});

function record(overrides: Partial<CallRecord> = {}): CallRecord {
    return { target: 'play.state', phase: 'playing', kind: 'read', latency_ms: 10, ok: true, ...overrides };
}

describe('summarize', () => {
    it('reports zeroes for an empty run', () => {
        const summary = summarize([], 0);

        expect(summary.total_calls).toBe(0);
        expect(summary.total_failures).toBe(0);
        expect(summary.transient_reads).toBe(0);
        expect(summary.by_target).toEqual([]);
    });

    it('counts failures by code and by phase', () => {
        const summary = summarize([
            record(),
            record({ ok: false, error_code: -32000, phase: 'entering' }),
            record({ ok: false, error_code: -32000, phase: 'exiting' }),
            record({ ok: false, error_code: -32003, phase: 'entering' }),
        ], 1);

        expect(summary.total_calls).toBe(4);
        expect(summary.total_failures).toBe(3);
        expect(summary.failures_by_code).toEqual({ '-32000': 2, '-32003': 1 });
        expect(summary.failures_by_phase).toEqual({ entering: 2, exiting: 1 });
    });

    it('counts only transient codes as transient reads', () => {
        const summary = summarize([
            record({ ok: false, error_code: -32000 }),
            record({ ok: false, error_code: -32001 }),
            record({ ok: false, error_code: -32601 }),
        ], 1);

        expect(summary.total_failures).toBe(3);
        expect(summary.transient_reads).toBe(1);
    });

    it('excludes transition calls from transient_reads but still counts them as failures', () => {
        const summary = summarize([
            record({ target: 'play.enter', kind: 'transition', ok: false, error_code: -32000 }),
            record({ ok: false, error_code: -32000 }),
        ], 1);

        expect(summary.total_failures).toBe(2);
        expect(summary.transient_reads).toBe(1);
        expect(summary.failures_by_code).toEqual({ '-32000': 2 });
    });

    it('treats a failure with no code as non-transient but still a failure', () => {
        const summary = summarize([record({ ok: false })], 1);

        expect(summary.total_failures).toBe(1);
        expect(summary.transient_reads).toBe(0);
        expect(summary.failures_by_code).toEqual({ unknown: 1 });
    });

    it('keys Unity-side command failures separately from RPC codes', () => {
        const summary = summarize([
            record({ ok: false, command_error: 'Asset not found.' }),
            record({ ok: false, error_code: -32000 }),
        ], 1);

        expect(summary.total_failures).toBe(2);
        expect(summary.transient_reads).toBe(1);
        expect(summary.failures_by_code).toEqual({ [COMMAND_ERROR_KEY]: 1, '-32000': 1 });
    });

    it('groups latency per target and sorts by name', () => {
        const summary = summarize([
            record({ target: 'ui.snapshot', latency_ms: 100 }),
            record({ target: 'play.state', latency_ms: 10 }),
            record({ target: 'play.state', latency_ms: 30 }),
            record({ target: 'play.state', latency_ms: 20, ok: false, error_code: -32002 }),
        ], 1);

        expect(summary.by_target.map(stats => stats.target)).toEqual(['play.state', 'ui.snapshot']);

        const play_state = summary.by_target[0];
        expect(play_state.calls).toBe(3);
        expect(play_state.failures).toBe(1);
        expect(play_state.p50_ms).toBe(20);
        expect(play_state.max_ms).toBe(30);
    });

    it('measures latency of failed calls too', () => {
        const summary = summarize([record({ ok: false, error_code: -32001, latency_ms: 900 })], 1);

        expect(summary.by_target[0].calls).toBe(1);
        expect(summary.by_target[0].max_ms).toBe(900);
    });

    it('passes the cycle count through', () => {
        expect(summarize([], 7).cycles).toBe(7);
    });
});

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

    // The pause toggle makes state "Paused" while the Editor is still in play mode.
    // Gating on the state string is what made the first live run hang until timeout.
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

describe('TRANSIENT_ERROR_CODES', () => {
    it('covers the connection-level codes and excludes timeouts', () => {
        expect([...TRANSIENT_ERROR_CODES].sort((a, b) => a - b)).toEqual([-32010, -32003, -32002, -32000]);
        expect(TRANSIENT_ERROR_CODES.has(-32001)).toBe(false);
    });
});
