#!/usr/bin/env bun
import { program } from 'commander';
import { install_bridge_package } from './bridge-install';
import { cleanup } from './cleanup';
import { call_editor, stream_editor, ping_editor, discover_editor_config } from './editor-client';
import { remove_package } from './packages';
import type { RpcEvent, RpcResponse } from './types';
import * as path from 'path';

// Version is inlined at build time by bun's bundler (no runtime path resolution)
const VERSION: string = (require('../package.json') as { version: string }).version;
const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';

interface BridgeCommandOptions {
    project?: string;
    timeout?: string;
    port?: string;
}

interface RunCommandOptions extends BridgeCommandOptions {
    args?: string;
    set?: string;
    wait?: boolean;
}

interface ListCommandOptions extends BridgeCommandOptions {
    raw?: boolean;
}

interface StreamCommandOptions extends BridgeCommandOptions {
    type?: string;
    duration?: string;
    pretty?: boolean;
}

interface CleanupCommandOptions {
    project?: string;
    stale?: boolean;
    cache?: boolean;
    all?: boolean;
}

interface ResolvedBridgeOptions {
    project_path: string;
    timeout: number;
    port?: number;
}

const runtime_versions = process.versions as NodeJS.ProcessVersions & { bun?: string };
if (!runtime_versions.bun) {
    console.error('CRITICAL ERROR: This tool MUST be run with BUN.');
    console.error('You are currently using: Node.js');
    console.error('Please run with: bun unity-agentic-tools/dist/cli.js <command>');
    process.exit(1);
}

program
    .name('unity-agentic-tools')
    .description('Small command runner for Unity Editor scripts and agentic tools')
    .version(VERSION);

function resolve_bridge_options(options: BridgeCommandOptions): ResolvedBridgeOptions {
    const project_path = path.resolve(options.project || process.cwd());
    const timeout = parseInt(options.timeout || '10000', 10);
    const port = options.port ? parseInt(options.port, 10) : undefined;
    return { project_path, timeout, ...(port !== undefined ? { port } : {}) };
}

function build_registry_args(values: string[]): string {
    return JSON.stringify(values);
}

function output_rpc_response(response: RpcResponse): void {
    if (response.error) {
        console.log(JSON.stringify({ success: false, error: response.error.message, code: response.error.code }, null, 2));
        process.exitCode = 1;
        return;
    }

    console.log(JSON.stringify(response.result, null, 2));
    if (payload_reports_failure(response.result)) {
        process.exitCode = 1;
    }
}

function payload_reports_failure(payload: unknown): boolean {
    if (!is_record(payload)) {
        return false;
    }

    if (payload.success === false) {
        return true;
    }

    return payload_reports_failure(payload.result);
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function event_matches_topic(event: RpcEvent, topic: string, type_filter?: string): boolean {
    if (topic === 'console') {
        if (event.method !== 'editor.console.logReceived') {
            return false;
        }

        if (!type_filter) {
            return true;
        }

        const event_type = typeof event.params?.type === 'string'
            ? event.params.type.toLowerCase()
            : '';
        return event_type === type_filter.toLowerCase();
    }

    if (topic === 'playmode') {
        return event.method === 'editor.event.playModeChanged' ||
            event.method === 'editor.event.pauseStateChanged';
    }

    if (topic === 'tests') {
        return event.method.startsWith('editor.tests.');
    }

    if (topic === 'events') {
        return event.method.startsWith('editor.event.') ||
            event.method.startsWith('editor.tests.') ||
            event.method === 'editor.console.logReceived';
    }

    return false;
}

function print_stream_event(event: RpcEvent, pretty: boolean = false): void {
    const payload = {
        method: event.method,
        ...(event.params ? event.params : {}),
    };
    console.log(JSON.stringify(payload, null, pretty ? 2 : 0));
}

// Primary command-runner surface
program.command('list [query]')
    .description('List runnable Unity commands and project script commands')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .option('--timeout <ms>', 'WebSocket timeout in ms', '10000')
    .option('--port <n>', 'Connect to a specific bridge port')
    .option('--raw', 'Include raw public static methods/properties for matching types')
    .action(async (query: string | undefined, options: ListCommandOptions) => {
        const bridge = resolve_bridge_options(options);
        const response = await call_editor({
            ...bridge,
            method: 'editor.invoke',
            params: {
                type: 'UnityAgenticTools.Commands.Registry',
                member: 'List',
                args: build_registry_args([query || '', options.raw === true ? 'true' : 'false']),
            },
        });
        output_rpc_response(response);
    });

program.command('run <target> [args...]')
    .description('Run a named Unity command or raw static method/property')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .option('--timeout <ms>', 'WebSocket timeout in ms', '10000')
    .option('--port <n>', 'Connect to a specific bridge port')
    .option('--args <json>', 'JSON array of command arguments (overrides positional args)')
    .option('--set <value>', 'Set a static property value')
    .option('--no-wait', 'Fire and forget -- return immediately without waiting for result')
    .action(async (target: string, args: string[], options: RunCommandOptions) => {
        const bridge = resolve_bridge_options(options);
        const command_args_json = options.args || JSON.stringify(args);
        const registry_args = options.set !== undefined
            ? [target, command_args_json, options.set]
            : [target, command_args_json];

        const response = await call_editor({
            ...bridge,
            method: 'editor.invoke',
            no_wait: options.wait === false,
            params: {
                type: 'UnityAgenticTools.Commands.Registry',
                member: 'Run',
                args: build_registry_args(registry_args),
            },
        });
        output_rpc_response(response);
    });

program.command('stream [topic]')
    .description('Stream Unity bridge events over WebSocket (default: console)')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .option('--timeout <ms>', 'WebSocket timeout in ms', '30000')
    .option('--port <n>', 'Connect to a specific bridge port')
    .option('-t, --type <type>', 'Console log type filter')
    .option('--duration <ms>', 'Stop after duration in ms (0 = indefinite)', '0')
    .option('--pretty', 'Pretty-print JSON events')
    .action(async (topic_raw: string | undefined, options: StreamCommandOptions) => {
        const topic = (topic_raw || 'console').toLowerCase();
        const valid_topics = ['console', 'events', 'playmode', 'tests'];
        if (!valid_topics.includes(topic)) {
            console.log(JSON.stringify({
                success: false,
                error: `Invalid stream topic "${topic}". Use: ${valid_topics.join(', ')}`,
            }, null, 2));
            process.exitCode = 1;
            return;
        }

        const bridge = resolve_bridge_options(options);
        const duration = parseInt(options.duration || '0', 10);

        try {
            const handle = await stream_editor({
                ...bridge,
                method: 'editor.console.subscribe',
                on_event: (event) => {
                    if (event_matches_topic(event, topic, options.type)) {
                        print_stream_event(event, options.pretty === true);
                    }
                },
            });

            if (duration > 0) {
                setTimeout(() => {
                    handle.close();
                    process.exit(0);
                }, duration);
            } else {
                process.on('SIGINT', () => {
                    handle.close();
                    process.exit(0);
                });
            }
        } catch (err: unknown) {
            console.log(JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            }, null, 2));
            process.exitCode = 1;
        }
    });

program.command('install')
    .description('Install the Unity command bridge package into a Unity project')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .action((options: BridgeCommandOptions) => {
        const bridge = resolve_bridge_options(options);
        const result = install_bridge_package(bridge.project_path);
        if ('error' in result) {
            console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
            process.exitCode = 1;
            return;
        }

        console.log(JSON.stringify(result, null, 2));
    });

program.command('uninstall')
    .description('Remove the Unity command bridge package from a Unity project')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .action((options: BridgeCommandOptions) => {
        const bridge = resolve_bridge_options(options);
        const result = remove_package(bridge.project_path, BRIDGE_PACKAGE_NAME);
        if ('error' in result) {
            console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
            process.exitCode = 1;
            return;
        }

        console.log(JSON.stringify(result, null, 2));
    });

program.command('cleanup')
    .description('Clean Unity Agentic Tools project state')
    .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
    .option('--stale', 'Remove stale bridge lock state (default)')
    .option('--cache', 'Remove rebuildable project caches')
    .option('--all', 'Remove the entire .unity-agentic directory')
    .action((options: CleanupCommandOptions) => {
        const result = cleanup(options);
        if (!result.success) {
            console.log(JSON.stringify(result, null, 2));
            process.exitCode = 1;
            return;
        }

        console.log(JSON.stringify(result, null, 2));
    });

program.command('status')
    .description('Show Unity command bridge status')
    .option('-p, --project <path>', 'Path to Unity project (defaults to current directory)')
    .option('--timeout <ms>', 'WebSocket timeout in ms', '2000')
    .option('--port <n>', 'Connect to a specific bridge port')
    .action(async (options: BridgeCommandOptions) => {
        const bridge = resolve_bridge_options(options);
        const projectPath = bridge.project_path;

        const status: Record<string, unknown> = {
            runtime: 'bun',
            version: VERSION,
            project_path: projectPath,
        };

        if (bridge.port) {
            const ping = await ping_editor(bridge.port, bridge.timeout);
            status.bridge = {
                port: bridge.port,
                source: 'manual',
                reachable: ping.reachable,
                ...(ping.reachable ? {} : { error: ping.error }),
            };
        } else {
            const editor_config = await discover_editor_config(projectPath, bridge.timeout);
            if ('error' in editor_config) {
                status.bridge = {
                    reachable: false,
                    error: editor_config.error,
                };
            } else {
                const ping = await ping_editor(editor_config.port, bridge.timeout);
                status.bridge = {
                    port: editor_config.port,
                    pid: editor_config.pid,
                    version: editor_config.version,
                    source: editor_config.source ?? 'lockfile',
                    project_path: editor_config.project_path,
                    reachable: ping.reachable,
                    ...(ping.reachable ? {} : { error: ping.error }),
                };
            }
        }

        console.log(JSON.stringify(status, null, 2));
    });

program.parse();
