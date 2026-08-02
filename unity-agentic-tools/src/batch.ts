import type { RpcResponse } from './types';

export interface BatchItem {
    target: string;
    args: unknown[];
}

export interface BatchItemOutcome {
    target: string;
    result?: unknown;
    error?: string;
    code?: number;
}

export interface BatchOutcome {
    success: boolean;
    completed: number;
    total: number;
    results: BatchItemOutcome[];
}

export function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function payload_reports_failure(payload: unknown): boolean {
    if (!is_record(payload)) {
        return false;
    }

    if (payload.success === false) {
        return true;
    }

    return payload_reports_failure(payload.result);
}

export function parse_batch_spec(raw: string): BatchItem[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('--batch is not valid JSON. Expected an array of [target, ...args] arrays.');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('--batch must be a non-empty JSON array of [target, ...args] arrays.');
    }

    return parsed.map((item, index) => {
        if (!Array.isArray(item) || item.length === 0) {
            throw new Error(`--batch item ${index} must be a non-empty array starting with a command target.`);
        }

        const [target, ...args] = item as unknown[];
        if (typeof target !== 'string' || target.length === 0) {
            throw new Error(`--batch item ${index} must start with a command target string.`);
        }

        return { target, args };
    });
}

/**
 * Runs items sequentially, stopping at the first failure: later items
 * usually depend on earlier ones, so continuing past a failed create
 * would compound the damage. Each item goes through its own invoke so
 * retry classification and reload tolerance apply per item.
 */
export async function run_batch(
    items: BatchItem[],
    invoke: (item: BatchItem) => Promise<RpcResponse>,
): Promise<BatchOutcome> {
    const results: BatchItemOutcome[] = [];
    let completed = 0;

    for (const item of items) {
        const response = await invoke(item);

        if (response.error) {
            results.push({
                target: item.target,
                error: response.error.message,
                code: response.error.code,
            });
            break;
        }

        if (payload_reports_failure(response.result)) {
            results.push({
                target: item.target,
                result: response.result,
                error: 'Command reported failure',
            });
            break;
        }

        results.push({ target: item.target, result: response.result });
        completed += 1;
    }

    return {
        success: completed === items.length,
        completed,
        total: items.length,
        results,
    };
}
