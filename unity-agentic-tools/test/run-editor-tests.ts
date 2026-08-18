import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import {
    build_log_excerpt,
    copy_fixture_project,
    require_arg_value,
    run_unity_batchmode,
} from './unity-batchmode';

export interface RunnerOptions {
    unity_bin: string;
    timeout_ms: number;
    keep_temp: boolean;
    /** NUnit filter expression passed straight through to -testFilter. */
    test_filter: string;
}

export interface NUnitFailure {
    full_name: string;
    message: string;
}

export interface NUnitSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    inconclusive: number;
    failures: NUnitFailure[];
}

const PACKAGE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..');
const FIXTURE_ROOT = resolve(__dirname, 'fixtures', 'editor-tests');
const UNITY_PACKAGE_ROOT = resolve(REPO_ROOT, 'unity-package');
const TEMP_ROOT = resolve(PACKAGE_ROOT, '.tmp');
const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const RESULTS_FILE = 'editor-test-results.xml';
const DEFAULT_TIMEOUT_MS = 900_000;

export function parse_args(args: string[], env: Record<string, string | undefined> = process.env): RunnerOptions {
    let unity_bin = env.UNITY_BIN ?? '';
    let timeout_ms = DEFAULT_TIMEOUT_MS;
    let keep_temp = false;
    let test_filter = '';

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case '--unity-bin':
                unity_bin = require_arg_value(args, ++index, arg);
                break;
            case '--test-filter':
                test_filter = require_arg_value(args, ++index, arg);
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

    return { unity_bin, timeout_ms, keep_temp, test_filter };
}

function print_help(): void {
    console.log(`Usage: bun test/run-editor-tests.ts --unity-bin <absolute-path> [options]

Runs the bridge package's EditMode tests in a throwaway Unity project.

Options:
  --unity-bin <absolute-path>  Unity editor binary to run in batchmode. Can also be set with UNITY_BIN.
  --test-filter <expression>   NUnit filter passed to -testFilter (default: run everything)
  --timeout-ms <n>             Unity process timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --keep-temp                  Preserve the temp project after execution
  --help                       Show this help text`);
}

/**
 * Point the fixture's manifest at this checkout's bridge package.
 *
 * The path has to be absolute because the fixture is copied to a temp
 * directory before Unity ever reads it, so a committed relative path would
 * resolve against the wrong root.
 */
export function build_editor_tests_manifest(base_manifest_text: string, package_path: string): string {
    const manifest = JSON.parse(base_manifest_text) as Record<string, unknown>;
    const dependencies = is_string_map(manifest.dependencies) ? manifest.dependencies : {};

    return `${JSON.stringify({
        ...manifest,
        dependencies: { ...dependencies, [BRIDGE_PACKAGE_NAME]: `file:${package_path}` },
    }, null, 2)}\n`;
}

function is_string_map(value: unknown): value is Record<string, string> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read totals and failures out of a Unity Test Framework NUnit 3 result file.
 *
 * The <test-run> element carries authoritative counts, so those are trusted
 * over anything recounted from the case elements.
 */
export function summarize_nunit_results(xml_text: string): NUnitSummary {
    const run_match = /<test-run\b([^>]*)>/.exec(xml_text);
    if (!run_match) {
        throw new Error('The results file has no <test-run> element, so Unity never produced a usable run.');
    }

    const attributes = parse_xml_attributes(run_match[1] ?? '');

    return {
        total: read_count(attributes, 'total'),
        passed: read_count(attributes, 'passed'),
        failed: read_count(attributes, 'failed'),
        skipped: read_count(attributes, 'skipped'),
        inconclusive: read_count(attributes, 'inconclusive'),
        failures: collect_failures(xml_text),
    };
}

function parse_xml_attributes(tag_body: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const pattern = /([\w.-]+)="([^"]*)"/g;

    let match: RegExpExecArray | null = pattern.exec(tag_body);
    while (match !== null) {
        attributes[match[1] ?? ''] = match[2] ?? '';
        match = pattern.exec(tag_body);
    }

    return attributes;
}

function read_count(attributes: Record<string, string>, name: string): number {
    const parsed = parseInt(attributes[name] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Splitting on the opening tag bounds each case to its own chunk, which keeps a
 * <failure> belonging to a later element from being read as this one's.
 */
function collect_failures(xml_text: string): NUnitFailure[] {
    const failures: NUnitFailure[] = [];

    for (const chunk of xml_text.split('<test-case').slice(1)) {
        const header_end = chunk.indexOf('>');
        if (header_end === -1) {
            continue;
        }

        const attributes = parse_xml_attributes(chunk.slice(0, header_end));
        if (attributes.result !== 'Failed') {
            continue;
        }

        const body_end = chunk.indexOf('</test-case>');
        failures.push({
            full_name: attributes.fullname ?? attributes.name ?? '(unnamed test)',
            message: read_failure_message(body_end === -1 ? '' : chunk.slice(header_end + 1, body_end)),
        });
    }

    return failures;
}

function read_failure_message(body: string): string {
    const message_match = /<message>([\s\S]*?)<\/message>/.exec(body);
    if (!message_match) {
        return '(no failure message)';
    }

    const raw = message_match[1] ?? '';
    const cdata_match = /^[ \t\r\n]*<!\[CDATA\[([\s\S]*?)\]\]>[ \t\r\n]*$/.exec(raw);
    const text = cdata_match ? cdata_match[1] ?? '' : decode_xml_entities(raw);

    return text.trim() === '' ? '(no failure message)' : text.trim();
}

function decode_xml_entities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function prepare_project(): string {
    const project_path = copy_fixture_project(FIXTURE_ROOT, TEMP_ROOT, 'editor-tests-');

    // Unity refuses a project path with no Assets folder, and git cannot carry an
    // empty directory, so the fixture cannot supply one.
    mkdirSync(join(project_path, 'Assets'), { recursive: true });

    const manifest_path = join(project_path, 'Packages', 'manifest.json');
    const base_manifest_text = readFileSync(manifest_path, 'utf-8');
    writeFileSync(manifest_path, build_editor_tests_manifest(base_manifest_text, UNITY_PACKAGE_ROOT), 'utf-8');
    return project_path;
}

function report_summary(summary: NUnitSummary): void {
    console.log(`total: ${summary.total}`);
    console.log(`passed: ${summary.passed}`);
    console.log(`failed: ${summary.failed}`);
    console.log(`skipped: ${summary.skipped}`);
    console.log(`inconclusive: ${summary.inconclusive}`);

    for (const failure of summary.failures) {
        console.error(`FAIL ${failure.full_name}`);
        console.error(`  ${failure.message.split('\n').join('\n  ')}`);
    }
}

async function main(): Promise<void> {
    const options = parse_args(process.argv.slice(2));

    if (!existsSync(options.unity_bin)) {
        throw new Error(`Unity binary not found: ${options.unity_bin}`);
    }

    const project_path = prepare_project();
    const results_path = join(project_path, RESULTS_FILE);
    const log_path = join(project_path, 'unity-editor-tests.log');
    const started_at = Date.now();
    let preserve_temp = options.keep_temp;

    try {
        // -quit is deliberately absent: the test runner quits on its own once the
        // results file is written, and combining the two truncates the run.
        const run = await run_unity_batchmode({
            unity_bin: options.unity_bin,
            project_path,
            args: [
                '-runTests',
                '-testPlatform',
                'EditMode',
                '-testResults',
                results_path,
                ...(options.test_filter === '' ? [] : ['-testFilter', options.test_filter]),
            ],
            log_path,
            timeout_ms: options.timeout_ms,
        });

        const duration_ms = Date.now() - started_at;

        if (run.spawn_error) {
            preserve_temp = true;
            throw new Error(`Could not start Unity: ${run.spawn_error}`);
        }

        if (run.termination_message) {
            preserve_temp = true;
            throw new Error(`${run.termination_message}\n${build_log_excerpt(run.log_text)}`);
        }

        if (!existsSync(results_path)) {
            preserve_temp = true;
            throw new Error([
                `Unity exited with code ${run.exit_code ?? 'null'} without writing ${RESULTS_FILE}.`,
                'That means the run never reached the test runner -- usually a compile error or a package resolution failure.',
                build_log_excerpt(run.log_text),
            ].join('\n'));
        }

        const summary = summarize_nunit_results(readFileSync(results_path, 'utf-8'));
        report_summary(summary);
        console.log(`duration_ms: ${duration_ms}`);

        // A clean exit that ran nothing is the failure mode this harness exists to
        // catch: the tests have been present and unexecuted for the whole project.
        if (summary.total === 0) {
            preserve_temp = true;
            throw new Error([
                'Unity produced results but executed 0 tests.',
                `Check that the fixture manifest lists "${BRIDGE_PACKAGE_NAME}" under testables and that the test assembly compiles.`,
                build_log_excerpt(run.log_text),
            ].join('\n'));
        }

        if (summary.failed > 0) {
            preserve_temp = true;
            throw new Error(`${summary.failed} EditMode test(s) failed`);
        }
    } finally {
        if (preserve_temp) {
            console.error(`Temp project: ${project_path}`);
        } else if (existsSync(project_path)) {
            rmSync(project_path, { recursive: true, force: true });
        }
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error((error as Error).message);
        process.exit(1);
    });
}
