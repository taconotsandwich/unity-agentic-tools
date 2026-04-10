import { Command } from 'commander';
import { resolve } from 'path';
import { call_editor, stream_editor, ping_editor, discover_editor_config } from './editor-client';
import { add_package, remove_package } from './packages';
import type { CallEditorOptions, RpcResponse } from './types';

const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

type CommandListScope = 'all' | 'editor' | 'top';

interface CommandListOptions {
    scope: CommandListScope;
    show_options: boolean;
    show_args: boolean;
    show_desc: boolean;
}

interface CommandListOptionInfo {
    flags: string;
    long?: string;
    short?: string;
    required: boolean;
    optional: boolean;
    mandatory: boolean;
    description?: string;
    default_value?: unknown;
}

interface CommandListArgInfo {
    name: string;
    required: boolean;
    variadic: boolean;
    description?: string;
    default_value?: unknown;
}

interface CommandListEntry {
    path: string;
    description?: string;
    args?: CommandListArgInfo[];
    options?: CommandListOptionInfo[];
}

function get_root_command(cmd: Command): Command {
    let current: Command = cmd;
    while (current.parent) current = current.parent;
    return current;
}

function get_command_start_nodes(root: Command, scope: CommandListScope): Command[] {
    if (scope === 'top') {
        return [...root.commands];
    }

    if (scope === 'editor') {
        const editor_cmd = root.commands.find((child) => child.name() === 'editor');
        return editor_cmd ? [editor_cmd] : [];
    }

    return [...root.commands];
}

function collect_command_entries(root: Command, options: CommandListOptions): CommandListEntry[] {
    const entries: CommandListEntry[] = [];
    const start_nodes = get_command_start_nodes(root, options.scope);
    const recurse = options.scope !== 'top';

    const visit = (cmd: Command, path: string): void => {
        const entry: CommandListEntry = { path };

        if (options.show_desc) {
            const desc = cmd.description();
            if (desc) entry.description = desc;
        }

        if (options.show_args) {
            const args = cmd.registeredArguments
                .map((arg) => ({
                    name: arg.name(),
                    required: arg.required,
                    variadic: arg.variadic,
                    description: arg.description,
                    default_value: arg.defaultValue,
                }));
            if (args.length > 0) entry.args = args;
        }

        if (options.show_options) {
            const cmd_options = cmd.options
                .filter((opt) => opt.long !== '--help')
                .map((opt) => ({
                    flags: opt.flags,
                    long: opt.long || undefined,
                    short: opt.short || undefined,
                    required: opt.required,
                    optional: opt.optional,
                    mandatory: opt.mandatory,
                    description: opt.description || undefined,
                    default_value: opt.defaultValue,
                }));
            if (cmd_options.length > 0) entry.options = cmd_options;
        }

        entries.push(entry);

        if (recurse) {
            for (const child of cmd.commands) {
                visit(child, `${path} ${child.name()}`);
            }
        }
    };

    for (const cmd of start_nodes) {
        visit(cmd, cmd.name());
    }

    return entries;
}

function get_common_options(cmd: Command): { project_path: string; timeout: number; port: number | undefined } {
    // Walk up the command chain to find editor-level options (handles nested subcommand groups like "get")
    let current: Command | null = cmd;
    let project: string | undefined;
    let timeout_str: string | undefined;
    let port_str: string | undefined;

    while (current) {
        const opts = current.opts();
        if (!project && opts.project) project = opts.project;
        if (!timeout_str && opts.timeout) timeout_str = opts.timeout;
        if (!port_str && opts.port) port_str = opts.port;
        current = current.parent;
    }

    const project_path = resolve(project || process.cwd());
    const timeout = parseInt(timeout_str || '10000', 10);
    const port = port_str ? parseInt(port_str, 10) : undefined;
    return { project_path, timeout, port };
}

function build_call_options(cmd: Command, method: string, params?: Record<string, unknown>, extra?: { no_wait?: boolean }): CallEditorOptions {
    const { project_path, timeout, port } = get_common_options(cmd);
    return { project_path, method, params, timeout, port, ...(extra?.no_wait ? { no_wait: true } : {}) };
}

async function handle_rpc(cmd: Command, method: string, params?: Record<string, unknown>, extra?: { no_wait?: boolean }): Promise<void> {
    const options = build_call_options(cmd, method, params, extra);
    const response = await call_editor(options);
    output_response(response);
}

function output_response(response: RpcResponse): void {
    if (response.error) {
        console.log(JSON.stringify({ success: false, error: response.error.message, code: response.error.code }, null, 2));
        process.exitCode = 1;
    } else {
        console.log(JSON.stringify(response.result, null, 2));
    }
}

export function build_editor_command(): Command {
    const cmd = new Command('editor')
        .description('Live Unity Editor bridge (play mode, console, assets, tests, UI, input)')
        .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
        .option('--timeout <ms>', 'WebSocket timeout in ms', '10000')
        .option('--port <n>', 'Connect to a specific bridge port when autodiscovery cannot resolve the right editor');

    // ==================== Existing Commands (1-22) ====================

    // 1. status
    cmd.command('status')
        .description('Check editor bridge connection status')
        .action(async function(this: Command) {
            const { project_path, port } = get_common_options(this);

            if (port) {
                console.log(JSON.stringify({ port, source: 'manual', connected: 'use other commands to verify' }, null, 2));
                return;
            }

            const config = await discover_editor_config(project_path);
            if ('error' in config) {
                console.log(JSON.stringify({ success: false, error: config.error }, null, 2));
                process.exitCode = 1;
                return;
            }

            const ping = await ping_editor(config.port, 2000);

            console.log(JSON.stringify({
                port: config.port,
                pid: config.pid,
                version: config.version,
                source: config.source ?? (config.pid === 0 ? 'discovered' : 'lockfile'),
                project_path,
                bridge_reachable: ping.reachable,
                ...(ping.reachable ? {} : { bridge_error: ping.error }),
            }, null, 2));
        });

    // 2. invoke
    cmd.command('invoke <type> <member> [args...]')
        .description('Call a static Unity Editor API method or read/set a static property')
        .option('--set <value>', 'Set a static property value')
        .option('--args <json>', 'JSON array of method arguments (overrides positional args)')
        .option('--no-wait', 'Fire and forget -- return immediately without waiting for result')
        .action(async function(this: Command, type: string, member: string, args: string[], options: { set?: string; args?: string; noWait?: boolean }) {
            const params: Record<string, unknown> = { type, member };
            if (options.set !== undefined) {
                params.set = options.set;
            } else if (options.args) {
                params.args = options.args;
            } else if (args.length === 1 && args[0].startsWith('[')) {
                params.args = args[0];
            } else if (args.length > 0) {
                params.args = JSON.stringify(args);
            }
            await handle_rpc(this, 'editor.invoke', params, { no_wait: options.noWait });
        });

    // 3. console-follow
    cmd.command('console-follow')
        .description('Stream console logs in real-time')
        .option('-t, --type <type>', 'Filter by log type')
        .option('--duration <ms>', 'Stop after duration in ms (0 = indefinite)', '0')
        .action(async function(this: Command, options: { type?: string; duration?: string }) {
            const { project_path, timeout, port } = get_common_options(this);
            const type_filter = options.type?.toLowerCase();
            const duration = parseInt(options.duration || '0', 10);

            try {
                const handle = await stream_editor({
                    project_path,
                    timeout,
                    port,
                    method: 'editor.console.subscribe',
                    on_event: (event) => {
                        if (event.method === 'editor.console.logReceived') {
                            const params = event.params ?? {};
                            if (type_filter && typeof params.type === 'string' &&
                                params.type.toLowerCase() !== type_filter) {
                                return;
                            }
                            console.log(JSON.stringify(params, null, 2));
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

    cmd.command('list')
        .description('List available CLI commands (compact by default)')
        .option('--scope <scope>', 'Scope: all, editor, top', 'all')
        .option('--show-options', 'Include command options')
        .option('--show-args', 'Include command arguments')
        .option('--show-desc', 'Include command descriptions')
        .action(function(this: Command, options: { scope?: string; showOptions?: boolean; showArgs?: boolean; showDesc?: boolean }) {
            const scope_raw = (options.scope || 'all').toLowerCase();
            const valid_scopes: CommandListScope[] = ['all', 'editor', 'top'];
            if (!valid_scopes.includes(scope_raw as CommandListScope)) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Invalid --scope value "${options.scope}". Use: all, editor, top`,
                }, null, 2));
                process.exitCode = 1;
                return;
            }

            const root = get_root_command(this);
            const list = collect_command_entries(root, {
                scope: scope_raw as CommandListScope,
                show_options: options.showOptions === true,
                show_args: options.showArgs === true,
                show_desc: options.showDesc === true,
            });

            console.log(JSON.stringify({
                success: true,
                scope: scope_raw,
                count: list.length,
                commands: list,
            }, null, 2));
        });

    // 4. install
    cmd.command('install')
        .description('Install the editor bridge package into a Unity project')
        .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
        .action(function(this: Command) {
            const { project_path } = get_common_options(this);
            const result = add_package(project_path, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
            if ('error' in result) {
                console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            console.log(JSON.stringify(result, null, 2));
        });

    // 5. uninstall
    cmd.command('uninstall')
        .description('Remove the editor bridge package from a Unity project')
        .option('-p, --project <path>', 'Path to Unity project (defaults to cwd)')
        .action(function(this: Command) {
            const { project_path } = get_common_options(this);
            const result = remove_package(project_path, BRIDGE_PACKAGE_NAME);
            if ('error' in result) {
                console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            console.log(JSON.stringify(result, null, 2));
        });

    return cmd;
}

export { collect_command_entries };
