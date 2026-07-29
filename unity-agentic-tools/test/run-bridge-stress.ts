import { existsSync } from 'fs';
import { isAbsolute } from 'path';
import { call_editor } from '../src/editor-client';
import type { RpcResponse } from '../src/types';

export type PhaseName = 'entering' | 'playing' | 'exiting' | 'editing' | 'compiling';

export interface StressOptions {
    project_path: string;
    cycles: number;
    reads_per_phase: number;
    timeout_ms: number;
    no_retry: boolean;
    compile_cycles: boolean;
}

/** Reads are the metric; transitions are the load that provokes failures in them. */
export type CallKind = 'read' | 'transition';

export interface CallRecord {
    target: string;
    phase: PhaseName;
    kind: CallKind;
    latency_ms: number;
    ok: boolean;
    /** JSON-RPC error code, set when the transport or server rejected the call. */
    error_code?: number;
    /** Unity-side error, set when the RPC succeeded but the command reported failure. */
    command_error?: string;
}

export interface TargetStats {
    target: string;
    calls: number;
    failures: number;
    p50_ms: number;
    p95_ms: number;
    max_ms: number;
}

export interface StressSummary {
    cycles: number;
    total_calls: number;
    total_failures: number;
    transient_reads: number;
    failures_by_code: Record<string, number>;
    failures_by_phase: Record<string, number>;
    by_target: TargetStats[];
}

interface ReadTarget {
    name: string;
    args: string[];
}

/** Connection-level codes the client treats as transient. Mirrors editor-client.ts. */
export const TRANSIENT_ERROR_CODES = new Set([-32000, -32002, -32003, -32010]);

/** failures_by_code key for a call whose RPC succeeded but whose Unity command reported failure. */
export const COMMAND_ERROR_KEY = 'command-error';

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

const DEFAULT_CYCLES = 3;
const DEFAULT_READS_PER_PHASE = 8;
const DEFAULT_TIMEOUT_MS = 15_000;
const SETTLE_POLL_INTERVAL_MS = 250;
const SETTLE_TIMEOUT_MS = 60_000;

export function parse_args(args: string[], env: Record<string, string | undefined> = process.env): StressOptions {
    let project_path = env.UNITY_PROJECT ?? '';
    let cycles = DEFAULT_CYCLES;
    let reads_per_phase = DEFAULT_READS_PER_PHASE;
    let timeout_ms = DEFAULT_TIMEOUT_MS;
    let no_retry = false;
    let compile_cycles = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case '--project':
                project_path = require_arg_value(args, ++index, arg);
                break;
            case '--cycles':
                cycles = require_positive_int(require_arg_value(args, ++index, arg), arg);
                break;
            case '--reads':
                reads_per_phase = require_positive_int(require_arg_value(args, ++index, arg), arg);
                break;
            case '--timeout-ms':
                timeout_ms = require_positive_int(require_arg_value(args, ++index, arg), arg);
                break;
            case '--no-retry':
                no_retry = true;
                break;
            case '--compile-cycles':
                compile_cycles = true;
                break;
            case '--help':
                print_help();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (project_path === '') {
        throw new Error('--project is required');
    }

    if (!isAbsolute(project_path)) {
        throw new Error('--project must be an absolute path');
    }

    return { project_path, cycles, reads_per_phase, timeout_ms, no_retry, compile_cycles };
}

function require_arg_value(args: string[], index: number, flag: string): string {
    const value = args[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

function require_positive_int(value: string, flag: string): number {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${flag} value: ${value}`);
    }
    return parsed;
}

function print_help(): void {
    console.log(`Usage: bun test/run-bridge-stress.ts --project <absolute-path> [options]

Drives the live Unity bridge through play-mode transitions while issuing reads,
then reports transient failures and per-target latency. Requires a running Unity
Editor with the bridge package installed.

Options:
  --project <absolute-path>  Unity project to target. Can also be set with UNITY_PROJECT.
  --cycles <n>               Play enter/exit cycles to run (default: ${DEFAULT_CYCLES})
  --reads <n>                Reads issued per phase (default: ${DEFAULT_READS_PER_PHASE})
  --timeout-ms <n>           Per-call request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --no-retry                 Disable client retries to measure the raw transition window
  --compile-cycles           Also stress script compilation (recompiles the target project)
  --help                     Show this help text`);
}

export function percentile(sorted_values: number[], p: number): number {
    if (sorted_values.length === 0) {
        return 0;
    }

    const rank = (p / 100) * (sorted_values.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);

    if (lower === upper) {
        return sorted_values[lower];
    }

    return sorted_values[lower] + (rank - lower) * (sorted_values[upper] - sorted_values[lower]);
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

export function summarize(records: CallRecord[], cycles: number): StressSummary {
    const failures_by_code: Record<string, number> = {};
    const failures_by_phase: Record<string, number> = {};
    const latencies_by_target = new Map<string, number[]>();
    const failures_by_target = new Map<string, number>();

    let total_failures = 0;
    let transient_reads = 0;

    for (const record of records) {
        const latencies = latencies_by_target.get(record.target) ?? [];
        latencies.push(record.latency_ms);
        latencies_by_target.set(record.target, latencies);

        if (record.ok) {
            continue;
        }

        total_failures += 1;
        failures_by_target.set(record.target, (failures_by_target.get(record.target) ?? 0) + 1);

        const code_key = record.error_code !== undefined
            ? String(record.error_code)
            : (record.command_error !== undefined ? COMMAND_ERROR_KEY : 'unknown');
        failures_by_code[code_key] = (failures_by_code[code_key] ?? 0) + 1;
        failures_by_phase[record.phase] = (failures_by_phase[record.phase] ?? 0) + 1;

        if (record.kind === 'read' &&
            record.error_code !== undefined &&
            TRANSIENT_ERROR_CODES.has(record.error_code)) {
            transient_reads += 1;
        }
    }

    const by_target: TargetStats[] = [...latencies_by_target.entries()]
        .map(([target, latencies]) => {
            const sorted = [...latencies].sort((a, b) => a - b);
            return {
                target,
                calls: sorted.length,
                failures: failures_by_target.get(target) ?? 0,
                p50_ms: round1(percentile(sorted, 50)),
                p95_ms: round1(percentile(sorted, 95)),
                max_ms: round1(sorted[sorted.length - 1] ?? 0),
            };
        })
        .sort((a, b) => a.target.localeCompare(b.target));

    return {
        cycles,
        total_calls: records.length,
        total_failures,
        transient_reads,
        failures_by_code,
        failures_by_phase,
        by_target,
    };
}

function build_invoke_params(target: string, args: string[]): Record<string, unknown> {
    return {
        type: 'UnityAgenticTools.Commands.Registry',
        member: 'Run',
        args: JSON.stringify([target, JSON.stringify(args)]),
    };
}

async function invoke(
    options: StressOptions,
    target: string,
    args: string[],
): Promise<RpcResponse> {
    return call_editor({
        project_path: options.project_path,
        method: 'editor.invoke',
        timeout: options.timeout_ms,
        ...(options.no_retry ? { retries: 0 } : {}),
        params: build_invoke_params(target, args),
    });
}

async function timed_invoke(
    options: StressOptions,
    target: ReadTarget,
    phase: PhaseName,
    kind: CallKind,
): Promise<CallRecord> {
    const started = performance.now();
    const response = await invoke(options, target.name, target.args);
    const latency_ms = performance.now() - started;
    const base = { target: target.name, phase, kind, latency_ms };

    if (response.error) {
        return { ...base, ok: false, error_code: response.error.code };
    }

    const command_error = read_command_error(response);
    if (command_error !== undefined) {
        return { ...base, ok: false, command_error };
    }

    return { ...base, ok: true };
}

/**
 * A Registry command that fails still returns a successful RPC envelope:
 * {"success":true,"result":{"success":false,"error":"..."}}. Without this check
 * the harness would score a Unity-side failure as a healthy call.
 */
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

function as_record(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
        ? value as Record<string, unknown>
        : undefined;
}

async function hammer_reads(options: StressOptions, phase: PhaseName): Promise<CallRecord[]> {
    const records: CallRecord[] = [];

    for (let index = 0; index < options.reads_per_phase; index += 1) {
        const target = READ_TARGETS[index % READ_TARGETS.length];
        records.push(await timed_invoke(options, target, phase, 'read'));
    }

    return records;
}

/**
 * Poll play.state until isPlaying matches. Deliberately excluded from the measured
 * records -- this is control flow, not a sample.
 *
 * Gate on isPlaying rather than the state string: an Editor with the pause toggle
 * armed enters play mode reporting "Paused", which is still play mode.
 */
async function wait_for_play_mode(options: StressOptions, want_playing: boolean): Promise<boolean> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (read_is_playing(await invoke(options, 'play.state', [])) === want_playing) {
            return true;
        }
        await sleep(SETTLE_POLL_INTERVAL_MS);
    }

    return false;
}

export function read_is_playing(response: RpcResponse): boolean | undefined {
    const payload = read_state_payload(response);
    const is_playing = payload?.isPlaying;

    return typeof is_playing === 'boolean' ? is_playing : undefined;
}

export function read_state_string(response: RpcResponse): string | undefined {
    const state = read_state_payload(response)?.state;

    return typeof state === 'string' ? state : undefined;
}

function read_state_payload(response: RpcResponse): Record<string, unknown> | undefined {
    if (response.error) {
        return undefined;
    }

    const envelope = as_record(response.result);

    return envelope === undefined ? undefined : (as_record(envelope.result) ?? envelope);
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>(r => setTimeout(r, ms));
}

async function transition(
    options: StressOptions,
    records: CallRecord[],
    target: string,
    phase: PhaseName,
): Promise<void> {
    const record = await timed_invoke(options, { name: target, args: [] }, phase, 'transition');
    records.push(record);

    if (!record.ok) {
        console.error(`  ${target} failed: ${describe_failure(record)}`);
    }
}

function describe_failure(record: CallRecord): string {
    return record.error_code !== undefined
        ? `rpc ${record.error_code}`
        : (record.command_error ?? 'unknown failure');
}

async function run_play_cycle(options: StressOptions, cycle: number): Promise<CallRecord[]> {
    const records: CallRecord[] = [];

    console.error(`cycle ${cycle}: entering play mode`);
    await transition(options, records, 'play.enter', 'entering');
    records.push(...await hammer_reads(options, 'entering'));

    if (!await wait_for_play_mode(options, true)) {
        throw new Error(`cycle ${cycle}: timed out waiting for play mode to start`);
    }
    records.push(...await hammer_reads(options, 'playing'));

    console.error(`cycle ${cycle}: exiting play mode`);
    await transition(options, records, 'play.exit', 'exiting');
    records.push(...await hammer_reads(options, 'exiting'));

    if (!await wait_for_play_mode(options, false)) {
        throw new Error(`cycle ${cycle}: timed out waiting for play mode to stop`);
    }
    records.push(...await hammer_reads(options, 'editing'));

    return records;
}

async function run_compile_cycle(options: StressOptions, cycle: number): Promise<CallRecord[]> {
    const records: CallRecord[] = [];

    console.error(`cycle ${cycle}: requesting script compilation`);
    await transition(options, records, COMPILE_TARGET, 'compiling');
    records.push(...await hammer_reads(options, 'compiling'));

    return records;
}

/** Never leave the Editor in play mode because the harness gave up partway through. */
async function restore_edit_mode(options: StressOptions): Promise<void> {
    if (read_is_playing(await invoke(options, 'play.state', [])) !== true) {
        return;
    }

    console.error('restoring edit mode after an aborted run');
    await invoke(options, 'play.exit', []);
    await wait_for_play_mode(options, false);
}

async function assert_bridge_reachable(options: StressOptions): Promise<void> {
    if (!existsSync(options.project_path)) {
        throw new Error(`Project path does not exist: ${options.project_path}`);
    }

    const response = await invoke(options, 'play.state', []);
    if (response.error) {
        throw new Error(
            `Bridge is not reachable for ${options.project_path}: ${response.error.message}\n` +
            'Open the Unity Editor with the bridge package installed before running this harness.',
        );
    }
}

async function main(): Promise<void> {
    const options = parse_args(process.argv.slice(2));
    await assert_bridge_reachable(options);

    console.error(
        `stressing ${options.project_path}: ${options.cycles} cycles, ` +
        `${options.reads_per_phase} reads/phase, retries ${options.no_retry ? 'off' : 'on'}`,
    );

    const records: CallRecord[] = [];
    let aborted: Error | undefined;

    try {
        for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
            records.push(...await run_play_cycle(options, cycle));

            if (options.compile_cycles) {
                records.push(...await run_compile_cycle(options, cycle));
            }
        }
    } catch (err: unknown) {
        aborted = err instanceof Error ? err : new Error(String(err));
    }

    await restore_edit_mode(options);

    // Emit the summary even on an aborted run -- a partial measurement beats none.
    const summary = summarize(records, options.cycles);
    console.log(JSON.stringify(summary));

    if (aborted) {
        console.error(`\nRun aborted after ${summary.total_calls} call(s): ${aborted.message}`);
        process.exit(1);
    }

    if (summary.total_failures > 0) {
        console.error(
            `\n${summary.total_failures} call(s) failed, ${summary.transient_reads} of them transient ` +
            `(${JSON.stringify(summary.failures_by_code)}).`,
        );
        process.exit(1);
    }

    console.error(`\nAll ${summary.total_calls} calls succeeded.`);
}

if (import.meta.main) {
    main().catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
