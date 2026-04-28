import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { isAbsolute, join, resolve } from 'path';

export interface RunnerOptions {
    unity_bin: string;
    scenario: string;
    timeout_ms: number;
    keep_temp: boolean;
}

export interface UnityLogSummary {
    validation_errors: string[];
    validation_warnings: string[];
    compiler_errors: string[];
    fatal_errors: string[];
    licensing_errors: string[];
}

interface ScenarioContext {
    project_path: string;
    unity_bin: string;
    timeout_ms: number;
}

interface ScenarioDefinition {
    name: string;
    expect_failure?: boolean;
    expected_validation_error?: string;
    run: (context: ScenarioContext, scene_path: string, scene_asset_path: string) => Promise<string[]>;
}

const PACKAGE_ROOT = resolve(__dirname, '..');
const FIXTURE_ROOT = resolve(__dirname, 'fixtures', 'headless-validation');
const TEMP_ROOT = resolve(PACKAGE_ROOT, '.tmp');
const MANIFEST_NAME = 'UATValidationTargets.json';
const SCENE_ASSET_PATH = 'Assets/Scenes/ValidationScene.unity';
const UNITY_EXECUTE_METHOD = 'UnityAgenticTools.Editor.HeadlessValidator.RunValidation';
const DEFAULT_TIMEOUT_MS = 600_000;
const COPY_EXCLUDES = new Set(['Library', 'Logs', 'Temp', '.DS_Store']);
const LOG_POLL_INTERVAL_MS = 1_000;
const PROCESS_KILL_GRACE_MS = 5_000;

function filter_fixture_copy(source_path: string): boolean {
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

export function parse_args(args: string[]): RunnerOptions {
    let unity_bin = '';
    let scenario = 'all';
    let timeout_ms = DEFAULT_TIMEOUT_MS;
    let keep_temp = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case '--unity-bin':
                unity_bin = require_arg_value(args, ++index, arg);
                break;
            case '--scenario':
                scenario = require_arg_value(args, ++index, arg);
                break;
            case '--timeout-ms': {
                const timeout_value = require_arg_value(args, ++index, arg);
                const parsed_timeout = parseInt(timeout_value, 10);
                if (!Number.isFinite(parsed_timeout) || parsed_timeout <= 0) {
                    throw new Error(`Invalid --timeout-ms value: ${timeout_value}`);
                }
                timeout_ms = parsed_timeout;
                break;
            }
            case '--keep-temp':
                keep_temp = true;
                break;
            case '--help':
                print_help();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (unity_bin === '') {
        throw new Error('--unity-bin is required');
    }

    if (!isAbsolute(unity_bin)) {
        throw new Error('--unity-bin must be an absolute path');
    }

    return { unity_bin, scenario, timeout_ms, keep_temp };
}

function require_arg_value(args: string[], index: number, flag: string): string {
    const value = args[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

function print_help(): void {
    console.log(`Usage: bun test/run-headless-validation.ts --unity-bin <absolute-path> [options]

Options:
  --unity-bin <absolute-path>  Unity editor binary to run in batchmode
  --scenario <name|all>        Scenario to execute (default: all)
  --timeout-ms <n>             Unity process timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --keep-temp                  Preserve temp projects after execution
  --help                       Show this help text`);
}

function copy_fixture_project(): string {
    mkdirSync(TEMP_ROOT, { recursive: true });
    const temp_dir = mkdtempSync(join(TEMP_ROOT, 'headless-validation-'));
    rmSync(temp_dir, { recursive: true, force: true });
    cpSync(FIXTURE_ROOT, temp_dir, { recursive: true, filter: filter_fixture_copy });
    return temp_dir;
}

function write_validation_manifest(project_path: string, targets: string[]): void {
    const manifest_path = join(project_path, MANIFEST_NAME);
    writeFileSync(manifest_path, JSON.stringify({ targets }, null, 2));
}

const SCENARIOS: Record<string, ScenarioDefinition> = {
    baseline: {
        name: 'baseline',
        async run(_context, _scene_path, scene_asset_path) {
            return [scene_asset_path];
        },
    },
    'negative-harness': {
        name: 'negative-harness',
        expect_failure: true,
        expected_validation_error: `Target asset is missing: ${SCENE_ASSET_PATH}`,
        async run(_context, scene_path, scene_asset_path) {
            rmSync(scene_path, { force: true });
            return [scene_asset_path];
        },
    },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

export function analyze_unity_log(log_text: string): UnityLogSummary {
    const lines = log_text.split(/\r?\n/);
    const validation_errors = collect_prefixed_messages(lines, 'VALIDATION_ERROR:');
    const validation_warnings = collect_prefixed_messages(lines, 'VALIDATION_WARNING:');
    const compiler_errors = lines.filter((line) => /error CS\d+/i.test(line));
    const fatal_patterns = [
        /Scripts have compiler errors/i,
        /Aborting batchmode due to failure/i,
        /executeMethod class .* could not be found/i,
        /executeMethod method .* threw exception/i,
        /Unhandled exception/i,
        /YAMLException/i,
        /Failed to deserialize/i,
        /Error while importing/i,
    ];
    const licensing_patterns = [
        /com\.unity\.editor\.headless/i,
        /No valid Unity Editor license found/i,
        /Activation of your license failed/i,
        /offline grace period/i,
    ];
    const fatal_errors = lines.filter((line) => fatal_patterns.some((pattern) => pattern.test(line)));
    const licensing_errors = lines.filter((line) => licensing_patterns.some((pattern) => pattern.test(line)));

    return {
        validation_errors: unique_lines(validation_errors),
        validation_warnings: unique_lines(validation_warnings),
        compiler_errors: unique_lines(compiler_errors),
        fatal_errors: unique_lines(fatal_errors),
        licensing_errors: unique_lines(licensing_errors),
    };
}

function collect_prefixed_messages(lines: string[], prefix: string): string[] {
    return lines
        .filter((line) => line.includes(prefix))
        .map((line) => line.slice(line.indexOf(prefix) + prefix.length).trim());
}

function unique_lines(lines: string[]): string[] {
    return Array.from(new Set(lines.filter((line) => line.trim() !== '')));
}

function build_log_excerpt(log_text: string): string {
    const lines = log_text.trim().split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - 40)).join('\n');
}

function detect_early_unity_failure(log_text: string): { kind: 'licensing'; message: string } | null {
    if (/com\.unity\.editor\.headless/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing/headless entitlement failure detected.',
                'The log contains "com.unity.editor.headless was not found", which means batchmode could not obtain the required local licensing entitlement.',
                'Open Unity Hub, confirm the editor license is active, open the editor once normally, and then retry.',
            ].join(' '),
        };
    }

    if (/No valid Unity Editor license found/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing failure detected.',
                'No valid Unity Editor license was found in the batchmode log.',
                'Confirm the editor is activated in Unity Hub and retry after opening the editor normally once.',
            ].join(' '),
        };
    }

    if (/offline grace period/i.test(log_text) || /Activation of your license failed/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing failure detected.',
                'The batchmode log indicates an offline-grace or activation problem.',
                'Reconnect Unity Hub, verify activation, and retry.',
            ].join(' '),
        };
    }

    return null;
}

async function run_unity_validation(unity_bin: string, project_path: string, timeout_ms: number): Promise<{ success: boolean; log_path: string; summary: UnityLogSummary; exit_code: number | null; message?: string }> {
    const log_path = join(project_path, 'unity-validation.log');
    const child = spawn(unity_bin, [
        '-batchmode',
        '-quit',
        '-projectPath',
        project_path,
        '-executeMethod',
        UNITY_EXECUTE_METHOD,
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
            terminate_child(`Unity validation timed out after ${timeout_ms}ms.`);
        }, timeout_ms);

        poll_handle = setInterval(() => {
            if (!existsSync(log_path)) {
                return;
            }

            const log_text = readFileSync(log_path, 'utf-8');
            const early_failure = detect_early_unity_failure(log_text);
            if (early_failure) {
                terminate_child(early_failure.message);
            }
        }, LOG_POLL_INTERVAL_MS);
    });

    if (spawn_error) {
        return {
            success: false,
            log_path,
            summary: { validation_errors: [], validation_warnings: [], compiler_errors: [], fatal_errors: [], licensing_errors: [] },
            exit_code,
            message: spawn_error.message,
        };
    }

    const log_text = existsSync(log_path) ? readFileSync(log_path, 'utf-8') : '';
    const summary = analyze_unity_log(log_text);
    const has_errors =
        summary.validation_errors.length > 0 ||
        summary.compiler_errors.length > 0 ||
        summary.fatal_errors.length > 0 ||
        summary.licensing_errors.length > 0;

    return {
        success: exit_code === 0 && !has_errors && !termination_message,
        log_path,
        summary,
        exit_code,
        message: termination_message ?? (has_errors ? build_log_excerpt(log_text) : undefined),
    };
}

function format_result_message(result: { exit_code: number | null; summary: UnityLogSummary; message?: string }): string {
    const parts = [`Unity exit code: ${result.exit_code ?? 'null'}`];

    if (result.summary.validation_errors.length > 0) {
        parts.push(`Validation errors: ${result.summary.validation_errors.join(' | ')}`);
    }
    if (result.summary.compiler_errors.length > 0) {
        parts.push(`Compiler errors: ${result.summary.compiler_errors.join(' | ')}`);
    }
    if (result.summary.fatal_errors.length > 0) {
        parts.push(`Fatal log lines: ${result.summary.fatal_errors.join(' | ')}`);
    }
    if (result.summary.licensing_errors.length > 0) {
        parts.push(`Licensing errors: ${result.summary.licensing_errors.join(' | ')}`);
    }
    if (result.message) {
        parts.push(result.message);
    }

    return parts.join('\n');
}

function expected_failure_matched(result: { summary: UnityLogSummary }, scenario: ScenarioDefinition): boolean {
    if (!scenario.expected_validation_error) {
        return false;
    }

    if (!result.summary.validation_errors.includes(scenario.expected_validation_error)) {
        return false;
    }

    return (
        result.summary.compiler_errors.length === 0 &&
        result.summary.fatal_errors.length === 0 &&
        result.summary.licensing_errors.length === 0
    );
}

async function run_scenario(name: string, options: RunnerOptions): Promise<boolean> {
    const scenario = SCENARIOS[name];
    const project_path = copy_fixture_project();
    const scene_path = join(project_path, SCENE_ASSET_PATH);
    const context: ScenarioContext = {
        project_path,
        unity_bin: options.unity_bin,
        timeout_ms: options.timeout_ms,
    };

    let preserve_temp = options.keep_temp;
    const started_at = Date.now();

    try {
        const targets = await scenario.run(context, scene_path, SCENE_ASSET_PATH);
        write_validation_manifest(project_path, targets);

        const result = await run_unity_validation(options.unity_bin, project_path, options.timeout_ms);
        const duration_ms = Date.now() - started_at;

        if (scenario.expect_failure) {
            if (result.success) {
                preserve_temp = true;
                console.error(`FAIL ${name} (${duration_ms}ms)`);
                console.error('  Expected validation to fail, but Unity exited cleanly.');
                console.error(`  Temp project: ${project_path}`);
                return false;
            }

            if (!expected_failure_matched(result, scenario)) {
                preserve_temp = true;
                console.error(`FAIL ${name} (${duration_ms}ms)`);
                console.error('  Unity failed, but not for the expected validation reason.');
                console.error(`  Expected validation error: ${scenario.expected_validation_error ?? 'none configured'}`);
                console.error(`  ${format_result_message(result)}`);
                console.error(`  Temp project: ${project_path}`);
                return false;
            }

            if (!options.keep_temp) {
                rmSync(project_path, { recursive: true, force: true });
            } else {
                console.log(`KEEP ${name} temp project: ${project_path}`);
            }

            console.log(`PASS ${name} (${duration_ms}ms)`);
            return true;
        }

        if (!result.success) {
            preserve_temp = true;
            console.error(`FAIL ${name} (${duration_ms}ms)`);
            console.error(`  ${format_result_message(result)}`);
            console.error(`  Temp project: ${project_path}`);
            return false;
        }

        if (options.keep_temp) {
            console.log(`KEEP ${name} temp project: ${project_path}`);
        } else {
            rmSync(project_path, { recursive: true, force: true });
        }

        console.log(`PASS ${name} (${duration_ms}ms)`);
        return true;
    } catch (error) {
        preserve_temp = true;
        console.error(`FAIL ${name}`);
        console.error(`  ${(error as Error).message}`);
        console.error(`  Temp project: ${project_path}`);
        return false;
    } finally {
        if (!preserve_temp && existsSync(project_path)) {
            rmSync(project_path, { recursive: true, force: true });
        }
    }
}

function resolve_requested_scenarios(requested_scenario: string): string[] {
    if (requested_scenario === 'all') {
        return SCENARIO_NAMES;
    }

    if (!(requested_scenario in SCENARIOS)) {
        throw new Error(`Unknown scenario: ${requested_scenario}`);
    }

    return [requested_scenario];
}

async function main(): Promise<void> {
    const options = parse_args(process.argv.slice(2));

    if (!existsSync(options.unity_bin)) {
        throw new Error(`Unity binary not found: ${options.unity_bin}`);
    }

    let failures = 0;
    const scenario_names = resolve_requested_scenarios(options.scenario);

    for (const scenario_name of scenario_names) {
        if (!await run_scenario(scenario_name, options)) {
            failures += 1;
        }
    }

    if (failures > 0) {
        throw new Error(`${failures} headless validation scenario(s) failed`);
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error((error as Error).message);
        process.exit(1);
    });
}
