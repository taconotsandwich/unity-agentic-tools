import { Command } from 'commander';
import { resolve } from 'path';
import { call_editor, stream_editor, ping_editor, discover_editor_config } from './editor-client';
import { add_package, remove_package } from './packages';
import type { CallEditorOptions, RpcResponse } from './types';

const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

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

    // 2. play
    cmd.command('play')
        .description('Enter play mode')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.playMode.enter');
        });

    // 3. stop
    cmd.command('stop')
        .description('Exit play mode')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.playMode.exit');
        });

    // 4. pause
    cmd.command('pause')
        .description('Toggle pause in play mode')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.playMode.pause');
        });

    // 5. step
    cmd.command('step')
        .description('Advance one frame in play mode')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.playMode.step');
        });

    // 6. play-state
    cmd.command('play-state')
        .description('Get current play mode state (Playing/Paused/Stopped)')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.playMode.getState');
        });

    // 7. save
    cmd.command('save')
        .description('Save all open scenes')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.scene.save');
        });

    // 8. scene-open
    cmd.command('scene-open <path>')
        .description('Open a scene by path')
        .option('--additive', 'Open in additive mode')
        .action(async function(this: Command, scene_path: string, options: { additive?: boolean }) {
            const params: Record<string, unknown> = { path: scene_path };
            if (options.additive) params.additive = true;
            const call_options = build_call_options(this, 'editor.scene.open', params);
            const response = await call_editor(call_options);
            if (response.error) {
                const msg = response.error.message || '';
                const hints: string[] = [];
                if (scene_path.startsWith('/') || scene_path.includes(':\\')) {
                    hints.push('Use an Assets-relative path (e.g., "Assets/Scenes/Main.unity"), not an absolute path.');
                }
                if (/cannot open|not imported|not found/i.test(msg)) {
                    hints.push('Run "editor invoke UnityEditor.AssetDatabase Refresh" first if the scene was recently created or moved.');
                }
                console.log(JSON.stringify({
                    success: false,
                    error: msg,
                    code: response.error.code,
                    ...(hints.length > 0 ? { hints } : {}),
                }, null, 2));
                process.exitCode = 1;
            } else {
                console.log(JSON.stringify(response.result, null, 2));
            }
        });

    // 9. invoke
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

    // 15. console-logs
    cmd.command('console-logs')
        .description('Get recent console log entries')
        .option('-c, --count <n>', 'Number of log entries to retrieve', '50')
        .option('--limit <n>', 'Alias for --count')
        .option('-t, --type <type>', 'Filter by log type (Log, Warning, Error, Assert, Exception)')
        .option('-s, --severity <type>', 'Alias for --type')
        .action(async function(this: Command, options: { count?: string; limit?: string; type?: string; severity?: string }) {
            const params: Record<string, unknown> = {};
            const count = options.limit || options.count;
            if (count) params.count = parseInt(count, 10);
            const typeFilter = options.severity || options.type;
            if (typeFilter) params.type = typeFilter;
            await handle_rpc(this, 'editor.console.getLogs', params);
        });

    // 16. console-clear
    cmd.command('console-clear')
        .description('Clear the console log buffer')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.console.clear');
        });

    // 17. console-follow
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

    // 18. screenshot
    cmd.command('screenshot')
        .description('Capture a screenshot of the game view')
        .option('-o, --output <path>', 'Output file path', 'screenshot.png')
        .option('--super-size <n>', 'Super sampling multiplier (1-4)', '1')
        .option('--annotate', 'Annotate with numbered UI element labels')
        .action(async function(this: Command, options: { output?: string; superSize?: string; annotate?: boolean }) {
            if (options.annotate) {
                const params: Record<string, unknown> = {};
                if (options.output) params.output = options.output;
                await handle_rpc(this, 'editor.screenshot.annotated', params);
            } else {
                const params: Record<string, unknown> = {};
                if (options.output) params.output = options.output;
                if (options.superSize) params.superSize = parseInt(options.superSize, 10);
                await handle_rpc(this, 'editor.screenshot.take', params);
            }
        });

    // 20. tests-run
    cmd.command('tests-run')
        .description('Run Unity tests')
        .option('-f, --filter <pattern>', 'Test name filter')
        .option('-m, --mode <mode>', 'Test mode: editmode or playmode', 'editmode')
        .action(async function(this: Command, options: { filter?: string; mode?: string }) {
            const params: Record<string, unknown> = {};
            if (options.filter) params.filter = options.filter;
            if (options.mode) params.mode = options.mode;
            await handle_rpc(this, 'editor.tests.run', params);
        });

    // 21. install
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

    // 22. uninstall
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

    // ==================== Discovery Commands (23-30) ====================

    // 23. hierarchy-snapshot
    cmd.command('hierarchy-snapshot')
        .description('Compact scene hierarchy with @hN refs for interaction')
        .option('--max-depth <n>', 'Maximum hierarchy depth to traverse', '99')
        .option('--include-inactive', 'Include inactive GameObjects')
        .action(async function(this: Command, options: { maxDepth?: string; includeInactive?: boolean }) {
            const params: Record<string, unknown> = {};
            if (options.maxDepth) params.maxDepth = parseInt(options.maxDepth, 10);
            if (options.includeInactive) params.includeInactive = true;
            await handle_rpc(this, 'editor.hierarchy.snapshot', params);
        });

    // 24. ui-snapshot
    cmd.command('ui-snapshot')
        .description('Compact tree of interactive UI elements with @uN refs')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.ui.snapshot');
        });

    // 25. input-map
    cmd.command('input-map')
        .description('List all accepted inputs (Input System actions + Legacy axes)')
        .action(async function(this: Command) {
            await handle_rpc(this, 'editor.input.map');
        });

    // 26-30. get (subcommand group)
    const get_cmd = cmd.command('get')
        .description('Query state of UI elements and GameObjects (use: get text|value|active|position|component <ref>)');

    get_cmd.on('command:*', (operands: string[]) => {
        const unknown = operands[0] || '';
        if (unknown.startsWith('@')) {
            console.log(JSON.stringify({
                success: false,
                error: `"editor get ${unknown}" is not valid. Specify what to query: text, value, active, position, or component.`,
                examples: [
                    `editor get active ${unknown}`,
                    `editor get position ${unknown}`,
                    `editor get text ${unknown}`,
                    `editor get value ${unknown}`,
                    `editor get component ${unknown} <type>`,
                ],
            }, null, 2));
        } else {
            console.log(JSON.stringify({
                success: false,
                error: `Unknown sub-command "${unknown}". Use: get text|value|active|position|component <ref>`,
                examples: [
                    'editor get active @h1',
                    'editor get position @h3',
                    'editor get text @u1',
                    'editor get value @u2',
                    'editor get component @h1 Rigidbody',
                ],
            }, null, 2));
        }
        process.exitCode = 1;
    });

    get_cmd.command('text <ref>')
        .description('Get text content of a UI element')
        .action(async function(this: Command, ref_str: string) {
            if (ref_str.startsWith('@h')) {
                console.log(JSON.stringify({
                    success: false,
                    error: `"get text" requires a UI ref (@uN), but "${ref_str}" is a hierarchy ref (@hN).`,
                    suggestions: [
                        `editor get position ${ref_str}  -- world/local position`,
                        `editor get active ${ref_str}    -- is GameObject active?`,
                        `editor get component ${ref_str} <Type>  -- component values`,
                        'Run "editor ui-snapshot" to get @uN refs for UI text queries.',
                    ],
                }, null, 2));
                process.exitCode = 1;
                return;
            }
            await handle_rpc(this, 'editor.ui.query', { ref: ref_str, query: 'text' });
        });

    get_cmd.command('value <ref>')
        .description('Get current value (slider, toggle, input, dropdown)')
        .action(async function(this: Command, ref_str: string) {
            if (ref_str.startsWith('@h')) {
                console.log(JSON.stringify({
                    success: false,
                    error: `"get value" requires a UI ref (@uN), but "${ref_str}" is a hierarchy ref (@hN).`,
                    suggestions: [
                        `editor get position ${ref_str}  -- world/local position`,
                        `editor get active ${ref_str}    -- is GameObject active?`,
                        `editor get component ${ref_str} <Type>  -- component values`,
                        'Run "editor ui-snapshot" to get @uN refs for UI value queries.',
                    ],
                }, null, 2));
                process.exitCode = 1;
                return;
            }
            await handle_rpc(this, 'editor.ui.query', { ref: ref_str, query: 'value' });
        });

    get_cmd.command('active <ref>')
        .description('Is GameObject active?')
        .action(async function(this: Command, ref_str: string) {
            await handle_rpc(this, 'editor.hierarchy.query', { ref: ref_str, query: 'active' });
        });

    get_cmd.command('position <ref>')
        .description('Transform world position')
        .action(async function(this: Command, ref_str: string) {
            await handle_rpc(this, 'editor.hierarchy.query', { ref: ref_str, query: 'position' });
        });

    get_cmd.command('component <ref> [type]')
        .description('Component property values')
        .action(async function(this: Command, ref_str: string, type?: string) {
            if (!type) {
                console.log(JSON.stringify({
                    success: false,
                    error: `Missing required <type> argument for "get component".`,
                    correct_usage: `editor get component ${ref_str} <type>`,
                    examples: [
                        `editor get component ${ref_str} Rigidbody`,
                        `editor get component ${ref_str} MeshRenderer`,
                        `editor get component ${ref_str} BoxCollider`,
                    ],
                    tip: 'Run "editor hierarchy-snapshot" to see available component types on each GameObject.',
                }, null, 2));
                process.exitCode = 1;
                return;
            }
            await handle_rpc(this, 'editor.hierarchy.query', { ref: ref_str, query: 'component', type });
        });

    // ==================== Interaction Commands (31-40) ====================

    // 31. ui-click
    cmd.command('ui-click <ref>')
        .description('Click a Button')
        .action(async function(this: Command, ref_str: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'click' });
        });

    // 32. ui-fill
    cmd.command('ui-fill <ref> <text>')
        .description('Clear + type into InputField/TextField')
        .action(async function(this: Command, ref_str: string, text: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'fill', text });
        });

    // 33. ui-type
    cmd.command('ui-type <ref> <text>')
        .description('Append text to InputField (no clear)')
        .action(async function(this: Command, ref_str: string, text: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'type', text });
        });

    // 34. ui-toggle
    cmd.command('ui-toggle <ref>')
        .description('Toggle a Toggle')
        .action(async function(this: Command, ref_str: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'toggle' });
        });

    // 35. ui-slider
    cmd.command('ui-slider <ref> <value>')
        .description('Set Slider value')
        .action(async function(this: Command, ref_str: string, value: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'slider', value: parseFloat(value) });
        });

    // 36. ui-select
    cmd.command('ui-select <ref> <option>')
        .description('Select Dropdown option by label or --index')
        .option('--index', 'Select by index instead of label')
        .action(async function(this: Command, ref_str: string, option: string, options: { index?: boolean }) {
            const params: Record<string, unknown> = { ref: ref_str, action: 'select', option };
            if (options.index) params.byIndex = true;
            await handle_rpc(this, 'editor.ui.interact', params);
        });

    // 37. ui-scroll
    cmd.command('ui-scroll <ref> <direction> [amount]')
        .description('Scroll a ScrollRect/ScrollView (up/down/left/right)')
        .action(async function(this: Command, ref_str: string, direction: string, amount?: string) {
            const params: Record<string, unknown> = { ref: ref_str, action: 'scroll', direction };
            if (amount) params.amount = parseFloat(amount);
            await handle_rpc(this, 'editor.ui.interact', params);
        });

    // 38. ui-focus
    cmd.command('ui-focus <ref>')
        .description('Focus a UI element')
        .action(async function(this: Command, ref_str: string) {
            await handle_rpc(this, 'editor.ui.interact', { ref: ref_str, action: 'focus' });
        });

    // ==================== Input Commands (39-43) ====================

    // 39. input-key
    cmd.command('input-key <key> [mode]')
        .description('Keyboard input (mode: press|hold|down|up)')
        .action(async function(this: Command, key: string, mode?: string) {
            const params: Record<string, unknown> = { key };
            if (mode) params.mode = mode;
            await handle_rpc(this, 'editor.input.key', params);
        });

    // 40. input-mouse
    cmd.command('input-mouse <x> <y> [mode]')
        .description('Mouse input at screen coords (mode: click|move|down|up)')
        .action(async function(this: Command, x: string, y: string, mode?: string) {
            const params: Record<string, unknown> = { x: parseFloat(x), y: parseFloat(y) };
            if (mode) params.mode = mode;
            await handle_rpc(this, 'editor.input.mouse', params);
        });

    // 41. input-touch
    cmd.command('input-touch <x> <y> [mode]')
        .description('Touch simulation (mode: tap|hold|swipe)')
        .action(async function(this: Command, x: string, y: string, mode?: string) {
            const params: Record<string, unknown> = { x: parseFloat(x), y: parseFloat(y) };
            if (mode) params.mode = mode;
            await handle_rpc(this, 'editor.input.touch', params);
        });

    // 42. input-action
    cmd.command('input-action <name> [value]')
        .description('Trigger Input System action by name')
        .action(async function(this: Command, name: string, value?: string) {
            const params: Record<string, unknown> = { name };
            if (value) params.value = value;
            await handle_rpc(this, 'editor.input.action', params);
        });

    // ==================== Wait Commands (43-49) ====================

    // 43. wait
    cmd.command('wait')
        .description('Wait for a condition (scene, UI element, log, compile, or delay)')
        .option('--scene <name>', 'Wait for scene to load')
        .option('--ui <ref>', 'Wait for UI element to become active')
        .option('--ui-gone <ref>', 'Wait for UI element to deactivate')
        .option('--log <text>', 'Wait for log message matching text')
        .option('--compile', 'Wait for compilation to finish')
        .option('--timeout <ms>', 'Timeout in milliseconds', '10000')
        .argument('[ms]', 'Wait N milliseconds (plain delay)')
        .action(async function(this: Command, ms_arg: string | undefined, options: {
            scene?: string;
            ui?: string;
            uiGone?: string;
            log?: string;
            compile?: boolean;
            timeout?: string;
        }) {
            const timeout = options.timeout ? parseInt(options.timeout, 10) : 10000;

            if (options.scene) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'scene', name: options.scene, timeout });
            } else if (options.ui) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'ui', ref: options.ui, timeout });
            } else if (options.uiGone) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'ui-gone', ref: options.uiGone, timeout });
            } else if (options.log) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'log', text: options.log, timeout });
            } else if (options.compile) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'compile', timeout });
            } else if (ms_arg) {
                await handle_rpc(this, 'editor.ui.wait', { condition: 'delay', ms: parseInt(ms_arg, 10) });
            } else {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing wait condition. --timeout alone is not a condition -- it sets the maximum wait duration.',
                    correct_usage: [
                        'editor wait 2000                -- delay 2000ms',
                        'editor wait --scene MainMenu    -- wait for scene to load',
                        'editor wait --ui @u3             -- wait for UI element to appear',
                        'editor wait --ui-gone @u3        -- wait for UI element to disappear',
                        'editor wait --log "Loaded"       -- wait for log message',
                        'editor wait --compile            -- wait for compilation to finish',
                        'editor wait --ui @u3 --timeout 5000  -- wait with 5s ceiling',
                    ],
                }, null, 2));
                process.exitCode = 1;
            }
        });

    return cmd;
}
