import { existsSync } from 'fs';
import { call_editor } from '../src/editor-client';
import type { EditorRetryEvent, RpcResponse } from '../src/types';
import { parse_args } from './bridge-stress-options';
import type { StressOptions } from './bridge-stress-options';
import {
    read_command_error,
    read_is_compiling,
    read_is_paused,
    read_is_playing,
} from './bridge-stress-state';
import type { PlayBaseline } from './bridge-stress-state';
import { summarize, TRANSIENT_ERROR_CODES } from './bridge-stress-summary';
import type { CallKind, CallRecord, PhaseName } from './bridge-stress-summary';

export interface StressInvokeControls {
    safe_retries?: boolean;
    on_retry?: (event: EditorRetryEvent) => void;
}

export type StressInvoker = (
    target: string,
    args: string[],
    controls?: StressInvokeControls,
) => Promise<RpcResponse>;

export interface StressTiming {
    poll_interval_ms: number;
    settle_timeout_ms: number;
    stable_polls: number;
}

interface ReadTarget {
    name: string;
    args: string[];
}

interface TransitionStatus {
    settled: boolean;
}

interface TimedCallResult {
    record: CallRecord;
    response?: RpcResponse;
}

/** Cheap, read-only targets. Arguments are bounded to keep each call small. */
const READ_TARGETS: ReadTarget[] = [
    { name: 'play.state', args: [] },
    { name: 'scene.hierarchy', args: ['1'] },
    { name: 'ui.snapshot', args: [] },
    { name: 'query.assets', args: ['t:Scene', '', '5'] },
];

/**
 * The Registry exposes no compile alias, so this goes through the raw backing API.
 * UnityEditor.EditorApplication.RequestScriptCompilation does not resolve -- it is
 * CompilationPipeline that carries the method.
 */
const COMPILE_TARGET = 'UnityEditor.Compilation.CompilationPipeline.RequestScriptCompilation';

const SETTLE_POLL_INTERVAL_MS = 250;
const SETTLE_TIMEOUT_MS = 60_000;
const STABLE_STATE_POLLS = 2;
export const MAX_CONCURRENT_READS = 4;

const DEFAULT_TIMING: StressTiming = {
    poll_interval_ms: SETTLE_POLL_INTERVAL_MS,
    settle_timeout_ms: SETTLE_TIMEOUT_MS,
    stable_polls: STABLE_STATE_POLLS,
};

function build_invoke_params(target: string, args: string[]): Record<string, unknown> {
    return {
        type: 'UnityAgenticTools.Commands.Registry',
        member: 'Run',
        args: JSON.stringify([target, JSON.stringify(args)]),
    };
}

function create_invoker(options: StressOptions): StressInvoker {
    return (target, args, controls = {}) => call_editor({
        project_path: options.project_path,
        method: 'editor.invoke',
        timeout: options.timeout_ms,
        ...(options.no_retry && !controls.safe_retries ? { retries: 0 } : {}),
        params: build_invoke_params(target, args),
        on_retry: controls.on_retry,
    });
}

async function timed_invoke(
    invoke: StressInvoker,
    records: CallRecord[],
    target: ReadTarget,
    phase: PhaseName,
    kind: CallKind,
    controls: StressInvokeControls = {},
): Promise<TimedCallResult> {
    const started = performance.now();
    const retry_events: EditorRetryEvent[] = [];
    let record: CallRecord;
    let response: RpcResponse | undefined;

    try {
        response = await invoke(target.name, target.args, {
            ...controls,
            on_retry: event => {
                retry_events.push(event);
                controls.on_retry?.(event);
            },
        });
        const base = {
            target: target.name,
            phase,
            kind,
            latency_ms: performance.now() - started,
            retry_events,
        };

        if (response.error) {
            record = {
                ...base,
                ok: false,
                error_code: response.error.code,
                error_message: response.error.message,
            };
        } else {
            const command_error = read_command_error(response);
            record = command_error === undefined
                ? { ...base, ok: true }
                : { ...base, ok: false, command_error };
        }
    } catch (err: unknown) {
        record = {
            target: target.name,
            phase,
            kind,
            latency_ms: performance.now() - started,
            retry_events,
            ok: false,
            client_error: err instanceof Error ? err.message : String(err),
        };
    }

    records.push(record);
    return { record, response };
}

export async function run_bounded_reads(
    options: StressOptions,
    invoke: StressInvoker,
    records: CallRecord[],
    phase: PhaseName,
    count: number = options.reads_per_phase,
    start_index = 0,
): Promise<number> {
    let next_index = 0;
    const worker_count = Math.min(MAX_CONCURRENT_READS, count);
    const workers = Array.from({ length: worker_count }, async () => {
        while (true) {
            const local_index = next_index;
            next_index += 1;

            if (local_index >= count) {
                return;
            }

            const target = READ_TARGETS[(start_index + local_index) % READ_TARGETS.length];
            await timed_invoke(invoke, records, target, phase, 'read');
        }
    });

    await Promise.all(workers);
    return start_index + count;
}

async function sample_play_transition(
    options: StressOptions,
    invoke: StressInvoker,
    records: CallRecord[],
    phase: PhaseName,
    want_playing: boolean,
    timing: StressTiming,
): Promise<boolean> {
    const deadline = Date.now() + timing.settle_timeout_ms;
    let sample_index = 0;
    let stable_matches = 0;

    while (Date.now() < deadline) {
        const remaining = options.reads_per_phase - sample_index;
        const batch_size = remaining > 0
            ? Math.min(MAX_CONCURRENT_READS, remaining)
            : 1;
        sample_index = await run_bounded_reads(
            options,
            invoke,
            records,
            phase,
            batch_size,
            sample_index,
        );

        const control = await timed_invoke(
            invoke,
            records,
            { name: 'play.state', args: [] },
            phase,
            'control',
            { safe_retries: true },
        );
        stable_matches = control.response !== undefined &&
            read_is_playing(control.response) === want_playing
            ? stable_matches + 1
            : 0;

        if (sample_index >= options.reads_per_phase && stable_matches >= timing.stable_polls) {
            return true;
        }

        await sleep(timing.poll_interval_ms);
    }

    return false;
}

async function sample_compile_transition(
    options: StressOptions,
    invoke: StressInvoker,
    records: CallRecord[],
    trigger_status: TransitionStatus,
    record_start_index: number,
    timing: StressTiming,
): Promise<boolean> {
    const deadline = Date.now() + timing.settle_timeout_ms;
    let sample_index = 0;
    let saw_transition = false;
    let stable_matches = 0;

    while (Date.now() < deadline) {
        const remaining = options.reads_per_phase - sample_index;
        const batch_size = remaining > 0
            ? Math.min(MAX_CONCURRENT_READS, remaining)
            : 1;
        sample_index = await run_bounded_reads(
            options,
            invoke,
            records,
            'compiling',
            batch_size,
            sample_index,
        );
        saw_transition = saw_transition || records.slice(record_start_index).some(record =>
            record.phase === 'compiling' &&
            (record.retry_events.length > 0 ||
                (record.error_code !== undefined && TRANSIENT_ERROR_CODES.has(record.error_code))),
        );

        const control = await timed_invoke(
            invoke,
            records,
            { name: 'play.state', args: [] },
            'compiling',
            'control',
            {
                safe_retries: true,
                on_retry: () => {
                    saw_transition = true;
                },
            },
        );
        const is_compiling = control.response === undefined
            ? undefined
            : read_is_compiling(control.response);

        if (is_compiling === true) {
            saw_transition = true;
            stable_matches = 0;
        } else if (is_compiling === false && saw_transition && trigger_status.settled) {
            stable_matches += 1;
        } else {
            stable_matches = 0;
        }

        if (sample_index >= options.reads_per_phase && stable_matches >= timing.stable_polls) {
            return true;
        }

        await sleep(timing.poll_interval_ms);
    }

    return false;
}

/** Gate on isPlaying because an Editor paused in Play Mode is still playing. */
async function wait_for_stable_play_mode(
    invoke: StressInvoker,
    want_playing: boolean,
    timing: StressTiming,
): Promise<boolean> {
    const deadline = Date.now() + timing.settle_timeout_ms;
    let stable_matches = 0;

    while (Date.now() < deadline) {
        const response = await invoke('play.state', [], { safe_retries: true });
        stable_matches = read_is_playing(response) === want_playing
            ? stable_matches + 1
            : 0;

        if (stable_matches >= timing.stable_polls) {
            return true;
        }

        await sleep(timing.poll_interval_ms);
    }

    return false;
}

async function wait_for_stable_pause_state(
    invoke: StressInvoker,
    want_paused: boolean,
    timing: StressTiming,
): Promise<boolean> {
    const deadline = Date.now() + timing.settle_timeout_ms;
    let stable_matches = 0;

    while (Date.now() < deadline) {
        const response = await invoke('play.state', [], { safe_retries: true });
        stable_matches = read_is_paused(response) === want_paused
            ? stable_matches + 1
            : 0;

        if (stable_matches >= timing.stable_polls) {
            return true;
        }

        await sleep(timing.poll_interval_ms);
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>(r => setTimeout(r, ms));
}

async function transition(
    invoke: StressInvoker,
    records: CallRecord[],
    target: string,
    phase: PhaseName,
): Promise<CallRecord> {
    const { record } = await timed_invoke(
        invoke,
        records,
        { name: target, args: [] },
        phase,
        'transition',
    );

    if (!record.ok) {
        console.error(`  ${target} failed: ${describe_failure(record)}`);
    }

    return record;
}

function describe_failure(record: CallRecord): string {
    return record.error_code !== undefined
        ? `rpc ${record.error_code}: ${record.error_message ?? 'unknown error'}`
        : (record.command_error ?? record.client_error ?? 'unknown failure');
}

async function await_transition_phase(
    trigger: Promise<CallRecord>,
    sampling: Promise<boolean>,
    timeout_message: string,
): Promise<void> {
    const results = await Promise.allSettled([trigger, sampling]);
    const rejected = results.find(result => result.status === 'rejected');

    if (rejected?.status === 'rejected') {
        throw rejected.reason instanceof Error
            ? rejected.reason
            : new Error(String(rejected.reason));
    }

    const sample_result = results[1];
    if (sample_result.status !== 'fulfilled' || !sample_result.value) {
        throw new Error(timeout_message);
    }
}

export async function run_play_cycle(
    options: StressOptions,
    invoke: StressInvoker,
    records: CallRecord[],
    cycle: number,
    timing: StressTiming = DEFAULT_TIMING,
): Promise<void> {

    console.error(`cycle ${cycle}: entering play mode`);
    await await_transition_phase(
        transition(invoke, records, 'play.enter', 'entering'),
        sample_play_transition(options, invoke, records, 'entering', true, timing),
        `cycle ${cycle}: timed out waiting for play mode to start`,
    );
    await run_bounded_reads(options, invoke, records, 'playing');

    console.error(`cycle ${cycle}: exiting play mode`);
    await await_transition_phase(
        transition(invoke, records, 'play.exit', 'exiting'),
        sample_play_transition(options, invoke, records, 'exiting', false, timing),
        `cycle ${cycle}: timed out waiting for play mode to stop`,
    );
    await run_bounded_reads(options, invoke, records, 'editing');
}

export async function run_compile_cycle(
    options: StressOptions,
    invoke: StressInvoker,
    records: CallRecord[],
    cycle: number,
    timing: StressTiming = DEFAULT_TIMING,
): Promise<void> {
    console.error(`cycle ${cycle}: requesting script compilation`);
    const record_start_index = records.length;
    const trigger_status: TransitionStatus = { settled: false };
    const trigger = transition(invoke, records, COMPILE_TARGET, 'compiling')
        .finally(() => {
            trigger_status.settled = true;
        });

    await await_transition_phase(
        trigger,
        sample_compile_transition(
            options, invoke, records, trigger_status, record_start_index, timing,
        ),
        `cycle ${cycle}: timed out waiting for script compilation to settle`,
    );
}

function control_error(response: RpcResponse): string | undefined {
    return response.error?.message ?? read_command_error(response);
}

async function ensure_play_mode(
    invoke: StressInvoker,
    want_playing: boolean,
    timing: StressTiming,
    context: string,
): Promise<void> {
    const state_response = await invoke('play.state', [], { safe_retries: true });
    const state_error = control_error(state_response);

    if (state_error !== undefined) {
        throw new Error(`${context}: could not read play state: ${state_error}`);
    }

    if (read_is_playing(state_response) !== want_playing) {
        const target = want_playing ? 'play.enter' : 'play.exit';
        const response = await invoke(target, [], { safe_retries: true });
        const error = control_error(response);

        if (error !== undefined) {
            throw new Error(`${context}: ${error}`);
        }
    }

    if (!await wait_for_stable_play_mode(invoke, want_playing, timing)) {
        throw new Error(`${context}: timed out waiting for ${want_playing ? 'Play' : 'Edit'} Mode`);
    }
}

async function ensure_pause_state(
    invoke: StressInvoker,
    want_paused: boolean,
    timing: StressTiming,
    context: string,
): Promise<void> {
    const state_response = await invoke('play.state', [], { safe_retries: true });
    const state_error = control_error(state_response);

    if (state_error !== undefined) {
        throw new Error(`${context}: could not read pause state: ${state_error}`);
    }

    const current_pause = read_is_paused(state_response);
    if (current_pause === undefined) {
        throw new Error(`${context}: play.state did not include isPaused`);
    }

    let pause_error: string | undefined;
    if (current_pause !== want_paused) {
        const response = await invoke('play.pause', [], { safe_retries: true });
        pause_error = control_error(response);
    }

    if (!await wait_for_stable_pause_state(invoke, want_paused, timing)) {
        const detail = pause_error === undefined ? '' : `: ${pause_error}`;
        throw new Error(`${context}: timed out restoring pause state${detail}`);
    }
}

export async function restore_play_baseline(
    invoke: StressInvoker,
    baseline: PlayBaseline,
    timing: StressTiming = DEFAULT_TIMING,
): Promise<void> {
    const label = baseline.playing
        ? `${baseline.paused ? 'paused ' : ''}Play Mode`
        : 'Edit Mode';
    console.error(`restoring initial ${label} after the stress run`);
    await ensure_play_mode(invoke, baseline.playing, timing, 'failed to restore initial play state');

    if (baseline.playing) {
        await ensure_pause_state(invoke, baseline.paused, timing, 'failed to restore initial pause state');
    }
}

async function assert_bridge_reachable(
    options: StressOptions,
    invoke: StressInvoker,
    timing: StressTiming,
): Promise<PlayBaseline> {
    if (!existsSync(options.project_path)) {
        throw new Error(`Project path does not exist: ${options.project_path}`);
    }

    const response = await invoke('play.state', [], { safe_retries: true });
    const error = control_error(response);
    if (error !== undefined) {
        throw new Error(
            `Bridge is not reachable for ${options.project_path}: ${error}\n` +
            'Open the Unity Editor with the bridge package installed before running this harness.',
        );
    }

    const initial_playing = read_is_playing(response);
    const initial_paused = read_is_paused(response);
    if (initial_playing === undefined || initial_paused === undefined) {
        throw new Error('Bridge returned an invalid play.state response.');
    }

    if (!await wait_for_stable_play_mode(invoke, initial_playing, timing)) {
        throw new Error('Editor play state did not become stable before the stress run.');
    }

    return { playing: initial_playing, paused: initial_paused };
}

async function main(): Promise<void> {
    const options = parse_args(process.argv.slice(2));
    const invoke = create_invoker(options);

    console.error(
        `stressing ${options.project_path}: ${options.cycles} cycles, ` +
        `${options.reads_per_phase} reads/phase, retries ${options.no_retry ? 'off' : 'on'}`,
    );

    const records: CallRecord[] = [];
    let aborted: Error | undefined;
    let cleanup_error: Error | undefined;
    let completed_cycles = 0;
    let baseline: PlayBaseline | undefined;

    try {
        baseline = await assert_bridge_reachable(options, invoke, DEFAULT_TIMING);

        if (baseline.playing) {
            console.error('establishing Edit Mode before the stress run');
            await ensure_play_mode(invoke, false, DEFAULT_TIMING, 'failed to establish Edit Mode');
        }

        for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
            await run_play_cycle(options, invoke, records, cycle);

            if (options.compile_cycles) {
                await run_compile_cycle(options, invoke, records, cycle);
            }

            completed_cycles = cycle;
        }
    } catch (err: unknown) {
        aborted = err instanceof Error ? err : new Error(String(err));
    }

    if (baseline !== undefined) {
        try {
            await restore_play_baseline(invoke, baseline);
        } catch (err: unknown) {
            cleanup_error = err instanceof Error ? err : new Error(String(err));
        }
    }

    const summary = summarize(records, {
        requested_cycles: options.cycles,
        completed_cycles,
        abort_error: aborted?.message,
        cleanup_error: cleanup_error?.message,
    });
    console.log(JSON.stringify(summary));

    if (aborted) {
        console.error(`\nRun aborted after ${summary.total_calls} call(s): ${aborted.message}`);
    }

    if (cleanup_error) {
        console.error(`\nCleanup failed: ${cleanup_error.message}`);
    }

    if (summary.total_failures > 0) {
        console.error(
            `\n${summary.total_failures} call(s) failed, ` +
            `${summary.transient_reads} transient read failure(s), ` +
            `${summary.recovered_reads} recovered read(s) ` +
            `(${JSON.stringify(summary.failures_by_code)}).`,
        );
    }

    if (!summary.success) {
        process.exitCode = 1;
        return;
    }

    console.error(
        `\nAll ${summary.total_calls} calls succeeded; ` +
        `${summary.recovered_reads} read(s) recovered through retries.`,
    );
}

if (import.meta.main) {
    main().catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
    });
}
