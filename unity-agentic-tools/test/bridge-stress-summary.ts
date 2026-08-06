import type { EditorRetryEvent } from '../src/types';

export type PhaseName = 'entering' | 'playing' | 'exiting' | 'editing' | 'compiling';

/** Reads are the metric; transitions are the load that provokes failures in them. */
export type CallKind = 'read' | 'transition' | 'control';

export interface CallRecord {
    target: string;
    phase: PhaseName;
    kind: CallKind;
    latency_ms: number;
    ok: boolean;
    retry_events: EditorRetryEvent[];
    /** JSON-RPC error code, set when the transport or server rejected the call. */
    error_code?: number;
    /** JSON-RPC error message, when the server supplied one. */
    error_message?: string;
    /** Unity-side error, set when the RPC succeeded but the command reported failure. */
    command_error?: string;
    /** Unexpected client-side exception that prevented an RPC response. */
    client_error?: string;
}

export interface TargetStats {
    target: string;
    calls: number;
    failures: number;
    retry_attempts: number;
    recovered_calls: number;
    p50_ms: number;
    p95_ms: number;
    max_ms: number;
}

export interface FailureDetail {
    target: string;
    phase: PhaseName;
    kind: CallKind;
    latency_ms: number;
    message: string;
    error_code?: number;
}

export interface StressRunOutcome {
    requested_cycles: number;
    completed_cycles: number;
    abort_error?: string;
    cleanup_error?: string;
}

export interface StressSummary extends StressRunOutcome {
    success: boolean;
    total_calls: number;
    total_failures: number;
    /** Final transient read failures; recovered retries are reported separately. */
    transient_reads: number;
    total_retry_attempts: number;
    read_retry_attempts: number;
    retried_reads: number;
    recovered_reads: number;
    failures_by_code: Record<string, number>;
    failures_by_phase: Record<string, number>;
    retries_by_code: Record<string, number>;
    retries_by_phase: Record<string, number>;
    failures: FailureDetail[];
    by_target: TargetStats[];
}

/** Connection-level codes the client treats as transient. Mirrors editor-client.ts. */
export const TRANSIENT_ERROR_CODES = new Set([-32000, -32002, -32003, -32010]);

/** failures_by_code keys for failures that have no JSON-RPC error code. */
export const COMMAND_ERROR_KEY = 'command-error';
export const CLIENT_ERROR_KEY = 'client-error';

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

export function summarize(records: CallRecord[], outcome: StressRunOutcome): StressSummary {
    const failures_by_code: Record<string, number> = {};
    const failures_by_phase: Record<string, number> = {};
    const retries_by_code: Record<string, number> = {};
    const retries_by_phase: Record<string, number> = {};
    const latencies_by_target = new Map<string, number[]>();
    const failures_by_target = new Map<string, number>();
    const retries_by_target = new Map<string, number>();
    const recoveries_by_target = new Map<string, number>();
    const failures: FailureDetail[] = [];

    let total_failures = 0;
    let transient_read_failures = 0;
    let total_retry_attempts = 0;
    let read_retry_attempts = 0;
    let retried_reads = 0;
    let recovered_reads = 0;

    for (const record of records) {
        const latencies = latencies_by_target.get(record.target) ?? [];
        latencies.push(record.latency_ms);
        latencies_by_target.set(record.target, latencies);

        const retry_count = record.retry_events.length;
        total_retry_attempts += retry_count;
        retries_by_target.set(record.target, (retries_by_target.get(record.target) ?? 0) + retry_count);

        for (const retry of record.retry_events) {
            const code = String(retry.code);
            retries_by_code[code] = (retries_by_code[code] ?? 0) + 1;
            retries_by_phase[record.phase] = (retries_by_phase[record.phase] ?? 0) + 1;
        }

        if (retry_count > 0 && record.ok) {
            recoveries_by_target.set(record.target, (recoveries_by_target.get(record.target) ?? 0) + 1);
        }

        if (record.kind === 'read' && retry_count > 0) {
            read_retry_attempts += retry_count;
            retried_reads += 1;

            if (record.ok) {
                recovered_reads += 1;
            }
        }

        if (record.ok) {
            continue;
        }

        total_failures += 1;
        failures_by_target.set(record.target, (failures_by_target.get(record.target) ?? 0) + 1);

        const message = record.error_message ??
            record.command_error ??
            record.client_error ??
            'unknown failure';
        failures.push({
            target: record.target,
            phase: record.phase,
            kind: record.kind,
            latency_ms: round1(record.latency_ms),
            message,
            ...(record.error_code === undefined ? {} : { error_code: record.error_code }),
        });

        const code_key = record.error_code !== undefined
            ? String(record.error_code)
            : (record.command_error !== undefined
                ? COMMAND_ERROR_KEY
                : (record.client_error !== undefined ? CLIENT_ERROR_KEY : 'unknown'));
        failures_by_code[code_key] = (failures_by_code[code_key] ?? 0) + 1;
        failures_by_phase[record.phase] = (failures_by_phase[record.phase] ?? 0) + 1;

        if (record.kind === 'read' &&
            record.error_code !== undefined &&
            TRANSIENT_ERROR_CODES.has(record.error_code)) {
            transient_read_failures += 1;
        }
    }

    const by_target: TargetStats[] = [...latencies_by_target.entries()]
        .map(([target, latencies]) => {
            const sorted = [...latencies].sort((a, b) => a - b);
            return {
                target,
                calls: sorted.length,
                failures: failures_by_target.get(target) ?? 0,
                retry_attempts: retries_by_target.get(target) ?? 0,
                recovered_calls: recoveries_by_target.get(target) ?? 0,
                p50_ms: round1(percentile(sorted, 50)),
                p95_ms: round1(percentile(sorted, 95)),
                max_ms: round1(sorted[sorted.length - 1] ?? 0),
            };
        })
        .sort((a, b) => a.target.localeCompare(b.target));

    const success = total_failures === 0 &&
        outcome.completed_cycles === outcome.requested_cycles &&
        outcome.abort_error === undefined &&
        outcome.cleanup_error === undefined;

    return {
        ...outcome,
        success,
        total_calls: records.length,
        total_failures,
        transient_reads: transient_read_failures,
        total_retry_attempts,
        read_retry_attempts,
        retried_reads,
        recovered_reads,
        failures_by_code,
        failures_by_phase,
        retries_by_code,
        retries_by_phase,
        failures,
        by_target,
    };
}
