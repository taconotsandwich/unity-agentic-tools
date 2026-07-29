import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

const COPY_EXCLUDES = new Set(['Library', 'Logs', 'Temp', '.DS_Store']);
const LOG_POLL_INTERVAL_MS = 1_000;
const PROCESS_KILL_GRACE_MS = 5_000;
const LOG_EXCERPT_LINES = 40;

export interface UnityBatchmodeOptions {
    unity_bin: string;
    project_path: string;
    /** Everything after -batchmode -projectPath, in Unity's own argument order. */
    args: string[];
    log_path: string;
    timeout_ms: number;
}

export interface UnityBatchmodeResult {
    exit_code: number | null;
    log_text: string;
    /** Set when the process could not be spawned at all. */
    spawn_error?: string;
    /** Set when the harness killed the process, with the reason. */
    termination_message?: string;
}

export function filter_fixture_copy(source_path: string): boolean {
    const segments = source_path.split(/[\\/]/);
    const last_segment = segments[segments.length - 1];

    if (COPY_EXCLUDES.has(last_segment)) {
        return false;
    }

    if (last_segment.endsWith('.csproj') || last_segment.endsWith('.sln')) {
        return false;
    }

    return true;
}

/** Copy a fixture into a fresh temp directory and return its path. */
export function copy_fixture_project(fixture_root: string, temp_root: string, prefix: string): string {
    mkdirSync(temp_root, { recursive: true });
    const temp_dir = mkdtempSync(join(temp_root, prefix));
    rmSync(temp_dir, { recursive: true, force: true });
    cpSync(fixture_root, temp_dir, { recursive: true, filter: filter_fixture_copy });
    return temp_dir;
}

export function require_arg_value(args: string[], index: number, flag: string): string {
    const value = args[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

export function build_log_excerpt(log_text: string, lines: number = LOG_EXCERPT_LINES): string {
    const log_lines = log_text.trim().split(/\r?\n/);
    return log_lines.slice(Math.max(0, log_lines.length - lines)).join('\n');
}

/**
 * Licensing failures a batchmode run cannot recover from.
 *
 * Unity keeps the process alive for a long time after these, so the log is
 * polled and the run killed early rather than waiting out the full timeout.
 * Returns the operator-facing explanation, or null when nothing matched.
 */
export function detect_early_unity_failure(log_text: string): string | null {
    if (/com\.unity\.editor\.headless/i.test(log_text)) {
        return [
            'Unity licensing/headless entitlement failure detected.',
            'The log contains "com.unity.editor.headless was not found", which means batchmode could not obtain the required local licensing entitlement.',
            'Open Unity Hub, confirm the editor license is active, open the editor once normally, and then retry.',
        ].join(' ');
    }

    if (/No valid Unity Editor license found/i.test(log_text)) {
        return [
            'Unity licensing failure detected.',
            'No valid Unity Editor license was found in the batchmode log.',
            'Confirm the editor is activated in Unity Hub and retry after opening the editor normally once.',
        ].join(' ');
    }

    if (/offline grace period/i.test(log_text) || /Activation of your license failed/i.test(log_text)) {
        return [
            'Unity licensing failure detected.',
            'The batchmode log indicates an offline-grace or activation problem.',
            'Reconnect Unity Hub, verify activation, and retry.',
        ].join(' ');
    }

    return null;
}

/**
 * Run a Unity editor in batchmode until it exits, the timeout expires, or the
 * log shows a licensing failure it will never recover from.
 */
export async function run_unity_batchmode(options: UnityBatchmodeOptions): Promise<UnityBatchmodeResult> {
    const { unity_bin, project_path, args, log_path, timeout_ms } = options;
    const child = spawn(unity_bin, [
        '-batchmode',
        '-projectPath',
        project_path,
        ...args,
        '-logFile',
        log_path,
        '-silent-crashes',
    ], {
        cwd: project_path,
        stdio: 'ignore',
    });

    let spawn_error: Error | null = null;
    let exit_code: number | null = null;
    let termination_message: string | undefined;
    let timeout_handle: NodeJS.Timeout | null = null;
    let kill_handle: NodeJS.Timeout | null = null;
    let poll_handle: NodeJS.Timeout | null = null;

    const clear_handles = (): void => {
        if (timeout_handle) {
            clearTimeout(timeout_handle);
            timeout_handle = null;
        }
        if (kill_handle) {
            clearTimeout(kill_handle);
            kill_handle = null;
        }
        if (poll_handle) {
            clearInterval(poll_handle);
            poll_handle = null;
        }
    };

    const terminate_child = (message: string): void => {
        if (termination_message || child.exitCode !== null) {
            return;
        }

        termination_message = message;
        child.kill('SIGTERM');
        kill_handle = setTimeout(() => {
            if (child.exitCode === null) {
                child.kill('SIGKILL');
            }
        }, PROCESS_KILL_GRACE_MS);
    };

    await new Promise<void>((resolve_promise) => {
        child.once('error', (error) => {
            spawn_error = error;
            clear_handles();
            resolve_promise();
        });

        child.once('exit', (code) => {
            exit_code = code;
            clear_handles();
            resolve_promise();
        });

        timeout_handle = setTimeout(() => {
            terminate_child(`Unity batchmode timed out after ${timeout_ms}ms.`);
        }, timeout_ms);

        poll_handle = setInterval(() => {
            if (!existsSync(log_path)) {
                return;
            }

            const early_failure = detect_early_unity_failure(readFileSync(log_path, 'utf-8'));
            if (early_failure) {
                terminate_child(early_failure);
            }
        }, LOG_POLL_INTERVAL_MS);
    });

    return {
        exit_code,
        log_text: existsSync(log_path) ? readFileSync(log_path, 'utf-8') : '',
        ...(spawn_error ? { spawn_error: (spawn_error as Error).message } : {}),
        ...(termination_message ? { termination_message } : {}),
    };
}
