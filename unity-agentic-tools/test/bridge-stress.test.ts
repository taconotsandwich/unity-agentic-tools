import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { parse_args } from './bridge-stress-options';
import type { StressOptions } from './bridge-stress-options';
import {
    restore_play_baseline,
    run_bounded_reads,
    run_compile_cycle,
    run_play_cycle,
} from './run-bridge-stress';
import type { StressInvoker, StressTiming } from './run-bridge-stress';
import {
    CLIENT_ERROR_KEY,
    COMMAND_ERROR_KEY,
    percentile,
    summarize,
} from './bridge-stress-summary';
import type { CallRecord, StressRunOutcome } from './bridge-stress-summary';
import type { EditorRetryEvent, RpcResponse } from '../src/types';

function response(result: unknown): RpcResponse {
    return { jsonrpc: '2.0', id: '1', result };
}

const PROJECT = '/Users/dev/Projects/demo';
const OPTIONS: StressOptions = {
    project_path: PROJECT,
    cycles: 1,
    reads_per_phase: 4,
    timeout_ms: 100,
    no_retry: false,
    compile_cycles: false,
};
// A ceiling, not a measurement. These tests assert on how many polls the
// orchestrator made and finish as soon as the state settles, so the budget only
// has to be wide enough that a coarse platform timer cannot starve the poll
// count. Windows clamps setTimeout to ~15.6ms, which fit two polls inside the
// previous 40ms where the assertions needed five. Tests that assert a timeout
// override this with a deliberately small value.
const SETTLE_CEILING_MS = 400;

// Windows clamps setTimeout to roughly this, which is what makes a budget sized
// on a 1ms interval fail there and pass everywhere else.
const COARSE_TIMER_MS = 16;

const FAST_TIMING: StressTiming = {
    poll_interval_ms: 1,
    settle_timeout_ms: SETTLE_CEILING_MS,
    stable_polls: 2,
};

function outcome(overrides: Partial<StressRunOutcome> = {}): StressRunOutcome {
    return { requested_cycles: 1, completed_cycles: 1, ...overrides };
}

function retry(code: number, attempt: number): EditorRetryEvent {
    return { code, attempt, delay_ms: 10 };
}

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

    it('rejects partially numeric counts', () => {
        expect(() => parse_args(['--project', PROJECT, '--reads', '8oops'], {}))
            .toThrow('Invalid --reads value: 8oops');
    });
});

describe('stress CLI', () => {
    it('emits a JSON result for a preflight failure', () => {
        const script = fileURLToPath(new URL('./run-bridge-stress.ts', import.meta.url));
        const missing_project = fileURLToPath(new URL('./__missing_stress_project__', import.meta.url));
        const result = Bun.spawnSync({
            cmd: [process.execPath, script, '--project', missing_project, '--cycles', '1'],
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const stdout = new TextDecoder().decode(result.stdout).trim();
        const parsed: unknown = JSON.parse(stdout);

        expect(result.exitCode).toBe(1);
        expect(parsed).toMatchObject({
            success: false,
            requested_cycles: 1,
            completed_cycles: 0,
            total_calls: 0,
            abort_error: `Project path does not exist: ${missing_project}`,
        });
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
    return {
        target: 'play.state',
        phase: 'playing',
        kind: 'read',
        latency_ms: 10,
        ok: true,
        retry_events: [],
        ...overrides,
    };
}

describe('summarize', () => {
    it('reports zeroes for an empty run', () => {
        const summary = summarize([], outcome({ requested_cycles: 0, completed_cycles: 0 }));

        expect(summary.success).toBe(true);
        expect(summary.total_calls).toBe(0);
        expect(summary.total_failures).toBe(0);
        expect(summary.transient_reads).toBe(0);
        expect(summary.total_retry_attempts).toBe(0);
        expect(summary.by_target).toEqual([]);
    });

    it('counts failures by code and by phase', () => {
        const summary = summarize([
            record(),
            record({ ok: false, error_code: -32000, phase: 'entering' }),
            record({ ok: false, error_code: -32000, phase: 'exiting' }),
            record({ ok: false, error_code: -32003, phase: 'entering' }),
        ], outcome());

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
        ], outcome());

        expect(summary.total_failures).toBe(3);
        expect(summary.transient_reads).toBe(1);
    });

    it('excludes transition calls from transient read failures but still counts them as failures', () => {
        const summary = summarize([
            record({ target: 'play.enter', kind: 'transition', ok: false, error_code: -32000 }),
            record({ ok: false, error_code: -32000 }),
        ], outcome());

        expect(summary.total_failures).toBe(2);
        expect(summary.transient_reads).toBe(1);
        expect(summary.failures_by_code).toEqual({ '-32000': 2 });
    });

    it('treats a failure with no code as non-transient but still a failure', () => {
        const summary = summarize([record({ ok: false })], outcome());

        expect(summary.total_failures).toBe(1);
        expect(summary.transient_reads).toBe(0);
        expect(summary.failures_by_code).toEqual({ unknown: 1 });
    });

    it('keys Unity-side command failures separately from RPC codes', () => {
        const summary = summarize([
            record({ ok: false, command_error: 'Asset not found.' }),
            record({ ok: false, error_code: -32000 }),
        ], outcome());

        expect(summary.total_failures).toBe(2);
        expect(summary.transient_reads).toBe(1);
        expect(summary.failures_by_code).toEqual({ [COMMAND_ERROR_KEY]: 1, '-32000': 1 });
    });

    it('keys unexpected client failures separately', () => {
        const summary = summarize([record({ ok: false, client_error: 'socket exploded' })], outcome());

        expect(summary.failures_by_code).toEqual({ [CLIENT_ERROR_KEY]: 1 });
        expect(summary.failures).toEqual([{
            target: 'play.state',
            phase: 'playing',
            kind: 'read',
            latency_ms: 10,
            message: 'socket exploded',
        }]);
    });

    it('preserves JSON-RPC messages in failure details', () => {
        const summary = summarize([
            record({ ok: false, error_code: -32000, error_message: 'Editor domain is reloading' }),
        ], outcome());

        expect(summary.failures[0]).toMatchObject({
            error_code: -32000,
            message: 'Editor domain is reloading',
        });
    });

    it('groups latency per target and sorts by name', () => {
        const summary = summarize([
            record({ target: 'ui.snapshot', latency_ms: 100 }),
            record({ target: 'play.state', latency_ms: 10 }),
            record({ target: 'play.state', latency_ms: 30 }),
            record({ target: 'play.state', latency_ms: 20, ok: false, error_code: -32002 }),
        ], outcome());

        expect(summary.by_target.map(stats => stats.target)).toEqual(['play.state', 'ui.snapshot']);

        const play_state = summary.by_target[0];
        expect(play_state.calls).toBe(3);
        expect(play_state.failures).toBe(1);
        expect(play_state.p50_ms).toBe(20);
        expect(play_state.max_ms).toBe(30);
    });

    it('measures latency of failed calls too', () => {
        const summary = summarize(
            [record({ ok: false, error_code: -32001, latency_ms: 900 })],
            outcome(),
        );

        expect(summary.by_target[0].calls).toBe(1);
        expect(summary.by_target[0].max_ms).toBe(900);
    });

    it('reports requested and completed cycle counts separately', () => {
        const summary = summarize([], outcome({ requested_cycles: 7, completed_cycles: 3 }));

        expect(summary.success).toBe(false);
        expect(summary.requested_cycles).toBe(7);
        expect(summary.completed_cycles).toBe(3);
    });

    it('reports recovered read retries separately from final failures', () => {
        const summary = summarize([
            record({ retry_events: [retry(-32000, 1), retry(-32002, 2)] }),
            record({
                target: 'ui.snapshot',
                retry_events: [retry(-32003, 1)],
                ok: false,
                error_code: -32003,
                phase: 'entering',
            }),
            record({
                target: 'play.enter',
                kind: 'transition',
                phase: 'entering',
                retry_events: [retry(-32002, 1)],
            }),
        ], outcome());

        expect(summary.total_retry_attempts).toBe(4);
        expect(summary.read_retry_attempts).toBe(3);
        expect(summary.retried_reads).toBe(2);
        expect(summary.recovered_reads).toBe(1);
        expect(summary.transient_reads).toBe(1);
        expect(summary.retries_by_code).toEqual({ '-32000': 1, '-32002': 2, '-32003': 1 });
        expect(summary.retries_by_phase).toEqual({ playing: 2, entering: 2 });

        const play_state = summary.by_target.find(stats => stats.target === 'play.state');
        expect(play_state?.retry_attempts).toBe(2);
        expect(play_state?.recovered_calls).toBe(1);
    });

    it('includes abort and cleanup errors in the machine-readable result', () => {
        const summary = summarize([], outcome({
            requested_cycles: 2,
            completed_cycles: 1,
            abort_error: 'transition timeout',
            cleanup_error: 'Editor unavailable',
        }));

        expect(summary.success).toBe(false);
        expect(summary.abort_error).toBe('transition timeout');
        expect(summary.cleanup_error).toBe('Editor unavailable');
    });
});

describe('stress orchestration', () => {
    it('caps measured read concurrency at four and captures retry callbacks', async () => {
        const records: CallRecord[] = [];
        let active = 0;
        let max_active = 0;
        let calls = 0;
        const invoke: StressInvoker = async (_target, _args, controls) => {
            calls += 1;
            active += 1;
            max_active = Math.max(max_active, active);

            if (calls === 1) {
                controls?.on_retry?.(retry(-32000, 1));
            }

            await new Promise<void>(resolve => setTimeout(resolve, 2));
            active -= 1;
            return response({ success: true, result: {} });
        };

        await run_bounded_reads(
            { ...OPTIONS, reads_per_phase: 12 },
            invoke,
            records,
            'playing',
        );

        expect(records).toHaveLength(12);
        expect(max_active).toBe(4);
        expect(records.flatMap(item => item.retry_events)).toEqual([retry(-32000, 1)]);
    });

    it('retains records from a play cycle that times out partway through', async () => {
        const records: CallRecord[] = [];
        const invoke: StressInvoker = async (target, _args, controls) => {
            if (target === 'play.state' && controls?.safe_retries) {
                return response({
                    success: true,
                    result: { state: 'Stopped', isPlaying: false, isCompiling: false },
                });
            }

            return response({ success: true, result: {} });
        };

        await expect(run_play_cycle(
            { ...OPTIONS, reads_per_phase: 1 },
            invoke,
            records,
            1,
            { ...FAST_TIMING, settle_timeout_ms: 8 },
        )).rejects.toThrow('timed out waiting for play mode to start');

        expect(records.some(item => item.target === 'play.enter')).toBe(true);
        expect(records.some(item => item.kind === 'read' && item.phase === 'entering')).toBe(true);
    });

    // Parameterized by poll interval on purpose. Windows clamps setTimeout to
    // about 15.6ms, so a settle ceiling sized against a 1ms interval starves the
    // poll count there and nowhere else -- exactly the failure that reached CI
    // and could not reach a macOS or Linux hook. Running the same cycle at a
    // coarse interval keeps it reachable on every platform.
    async function run_observed_compile_sequence(poll_interval_ms: number): Promise<void> {
        const records: CallRecord[] = [];
        const compile_states = [false, true, true, false, false];
        const observed_states: boolean[] = [];
        const order: string[] = [];
        const invoke: StressInvoker = async (target, _args, controls) => {
            order.push(target);

            if (target === 'play.state' && controls?.safe_retries) {
                if (observed_states.length === 0) {
                    controls.on_retry?.(retry(-32000, 1));
                }
                const is_compiling = compile_states[observed_states.length] ?? false;
                observed_states.push(is_compiling);
                return response({
                    success: true,
                    result: { state: 'Stopped', isPlaying: false, isCompiling: is_compiling },
                });
            }

            return response({ success: true, result: {} });
        };

        await run_compile_cycle(
            { ...OPTIONS, reads_per_phase: 1 },
            invoke,
            records,
            1,
            { ...FAST_TIMING, poll_interval_ms },
        );

        expect(order[0]).toContain('RequestScriptCompilation');
        expect(observed_states).toEqual(compile_states);
        expect(records.some(item => item.target.includes('RequestScriptCompilation'))).toBe(true);
        expect(summarize(records, outcome()).total_retry_attempts).toBe(1);
    }

    it('does not finish a compile cycle until compiling was observed and then stable', async () => {
        await run_observed_compile_sequence(1);
    });

    it('observes the whole compile sequence when the platform timer is coarse', async () => {
        await run_observed_compile_sequence(COARSE_TIMER_MS);
    });

    async function run_slow_trigger_cycle(poll_interval_ms: number): Promise<void> {
        const records: CallRecord[] = [];
        let trigger_returned = false;
        let post_trigger_polls = 0;
        const invoke: StressInvoker = async (target, _args, controls) => {
            if (target.includes('RequestScriptCompilation')) {
                await new Promise<void>(resolve => setTimeout(resolve, 8));
                trigger_returned = true;
                return response({ success: true, result: {} });
            }

            if (target === 'play.state' && controls?.safe_retries) {
                const post_trigger_states = [true, false, false];
                const is_compiling = trigger_returned
                    ? (post_trigger_states[post_trigger_polls++] ?? false)
                    : false;
                return response({
                    success: true,
                    result: { state: 'Stopped', isPlaying: false, isPaused: false, isCompiling: is_compiling },
                });
            }

            return response({ success: true, result: {} });
        };

        await run_compile_cycle(
            { ...OPTIONS, reads_per_phase: 1 },
            invoke,
            records,
            1,
            { ...FAST_TIMING, poll_interval_ms },
        );

        expect(post_trigger_polls).toBeGreaterThanOrEqual(3);
    }

    it('does not accept stable false before a slow compile trigger returns', async () => {
        await run_slow_trigger_cycle(1);
    });

    it('waits out a slow compile trigger when the platform timer is coarse', async () => {
        await run_slow_trigger_cycle(COARSE_TIMER_MS);
    });

    it('rejects a compile cycle when only an earlier cycle observed a reload', async () => {
        const records: CallRecord[] = [record({
            phase: 'compiling',
            retry_events: [retry(-32000, 1)],
        })];
        const invoke: StressInvoker = async (target, _args, controls) => {
            if (target === 'play.state' && controls?.safe_retries) {
                return response({
                    success: true,
                    result: { state: 'Stopped', isPlaying: false, isPaused: false, isCompiling: false },
                });
            }

            return response({ success: true, result: {} });
        };

        await expect(run_compile_cycle(
            { ...OPTIONS, reads_per_phase: 1 },
            invoke,
            records,
            1,
            { ...FAST_TIMING, settle_timeout_ms: 8 },
        )).rejects.toThrow('timed out waiting for script compilation to settle');
    });

    it('uses safe retries while restoring the original play baseline', async () => {
        let playing = false;
        const calls: Array<{ target: string; safe_retries: boolean | undefined }> = [];
        const invoke: StressInvoker = async (target, _args, controls) => {
            calls.push({ target, safe_retries: controls?.safe_retries });

            if (target === 'play.enter') {
                playing = true;
            }

            return response({
                success: true,
                result: {
                    state: playing ? 'Playing' : 'Stopped',
                    isPlaying: playing,
                    isPaused: false,
                    isCompiling: false,
                },
            });
        };

        await restore_play_baseline(invoke, { playing: true, paused: false }, FAST_TIMING);

        expect(calls.some(call => call.target === 'play.enter')).toBe(true);
        expect(calls.every(call => call.safe_retries === true)).toBe(true);
    });

    it('restores a paused Play Mode baseline exactly', async () => {
        let playing = false;
        let paused = false;
        const calls: string[] = [];
        const invoke: StressInvoker = async target => {
            calls.push(target);

            if (target === 'play.enter') {
                playing = true;
            } else if (target === 'play.pause') {
                paused = !paused;
            }

            return response({
                success: true,
                result: {
                    state: paused ? 'Paused' : (playing ? 'Playing' : 'Stopped'),
                    isPlaying: playing,
                    isPaused: paused,
                    isCompiling: false,
                },
            });
        };

        await restore_play_baseline(invoke, { playing: true, paused: true }, FAST_TIMING);

        expect(calls).toContain('play.enter');
        expect(calls).toContain('play.pause');
        expect(playing).toBe(true);
        expect(paused).toBe(true);
    });
});
