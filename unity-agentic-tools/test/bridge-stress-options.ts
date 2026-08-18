import { isAbsolute } from 'path';

export interface StressOptions {
    project_path: string;
    cycles: number;
    reads_per_phase: number;
    timeout_ms: number;
    no_retry: boolean;
    compile_cycles: boolean;
}

const DEFAULT_CYCLES = 3;
const DEFAULT_READS_PER_PHASE = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

export function parse_args(
    args: string[],
    env: Record<string, string | undefined> = process.env,
): StressOptions {
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
    if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid ${flag} value: ${value}`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
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
  --reads <n>                Minimum reads issued per phase (default: ${DEFAULT_READS_PER_PHASE})
  --timeout-ms <n>           Per-call request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --no-retry                 Disable measured-call retries; setup and cleanup stay safe
  --compile-cycles           Also stress script compilation (recompiles the target project)
  --help                     Show this help text`);
}
