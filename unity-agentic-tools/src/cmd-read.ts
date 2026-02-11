import { Command } from 'commander';
import { existsSync } from 'fs';
import type { UnityScanner } from './scanner';
import { read_settings } from './settings';
import { get_build_settings } from './build-settings';

/** Check if a file is a Unity YAML file by reading its header. */
function validate_unity_yaml(file: string): string | null {
    if (!existsSync(file)) {
        return `File not found: ${file}`;
    }
    try {
        const fd = require('fs').openSync(file, 'r');
        const buf = Buffer.alloc(64);
        require('fs').readSync(fd, buf, 0, 64, 0);
        require('fs').closeSync(fd);
        const header = buf.toString('utf-8');
        if (!header.startsWith('%YAML') || !header.includes('!u!')) {
            return `File "${file}" is not a Unity YAML file (missing %YAML/!u! header)`;
        }
    } catch {
        return `Cannot read file: ${file}`;
    }
    return null;
}

export function build_read_command(getScanner: () => UnityScanner): Command {
    const cmd = new Command('read')
        .description('Read Unity files, settings, and build data');

    cmd.command('scene <file>')
        .description('List GameObject hierarchy in a Unity scene or prefab file')
        .option('-j, --json', 'Output as JSON')
        .option('-p, --properties', 'Include component properties')
        .option('-v, --verbose', 'Show internal Unity IDs')
        .option('--page-size <n>', 'Max objects per page (default 200, max 1000)', '200')
        .option('--cursor <n>', 'Start offset for pagination (default 0)', '0')
        .option('--max-depth <n>', 'Max hierarchy depth (default 10, max 50)', '10')
        .option('--summary', 'Show compact summary (counts only, no object list)')
        .action((file, options) => {
            const validationError = validate_unity_yaml(file);
            if (validationError) {
                console.log(JSON.stringify({ error: validationError }, null, 2));
                return;
            }
            const rawPageSize = parseInt(options.pageSize, 10);
            if (isNaN(rawPageSize) || rawPageSize < 1) {
                console.log(JSON.stringify({ error: '--page-size must be a positive integer' }));
                return;
            }
            const pageSize = Math.min(rawPageSize, 1000);
            const rawCursor = parseInt(options.cursor, 10);
            if (isNaN(rawCursor) || rawCursor < 0) {
                console.log(JSON.stringify({ error: '--cursor must be a non-negative integer' }));
                return;
            }
            const cursor = rawCursor;
            const rawMaxDepth = parseInt(options.maxDepth, 10);
            const maxDepth = isNaN(rawMaxDepth) ? 10 : Math.max(0, Math.min(rawMaxDepth, 50));

            const result = getScanner().inspect_all_paginated({
                file,
                include_properties: options.properties === true,
                verbose: options.verbose === true,
                page_size: pageSize,
                cursor,
                max_depth: maxDepth,
            });

            if (result.error) {
                console.log(JSON.stringify({ error: result.error }, null, 2));
                return;
            }

            if (!file.endsWith('.unity') && result.gameobjects) {
                (result as any).warning = `File "${file}" is not a .unity scene file`;
            }

            if (options.summary) {
                const component_counts: Record<string, number> = {};
                let prefab_instances = 0;
                const gos = result.gameobjects || [];
                for (const go of gos) {
                    if ((go as any).isPrefabInstance) prefab_instances++;
                    for (const comp of ((go as any).components || [])) {
                        const t = comp.type || comp.typeName || 'Unknown';
                        component_counts[t] = (component_counts[t] || 0) + 1;
                    }
                }
                console.log(JSON.stringify({
                    file: result.file,
                    total_gameobjects: result.total,
                    prefab_instances,
                    component_counts,
                    page_shown: gos.length,
                    truncated: result.truncated,
                }, null, 2));
                return;
            }

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('gameobject <file> <object_id>')
        .description('Get GameObject details by name or file ID')
        .option('-c, --component <type>', 'Get specific component type')
        .option('-p, --properties', 'Include component properties')
        .option('-j, --json', 'Output as JSON')
        .option('-v, --verbose', 'Show internal Unity IDs')
        .action((file, object_id, options) => {
            const validationErr = validate_unity_yaml(file);
            if (validationErr) {
                console.log(JSON.stringify({ error: validationErr }, null, 2));
                return;
            }
            const result = getScanner().inspect({
                file,
                identifier: object_id,
                include_properties: options.properties === true,
                verbose: options.verbose,
            });

            if (!result) {
                const label = /^\d+$/.test(object_id) ? 'fileID' : 'name';
                console.log(JSON.stringify({ error: `GameObject with ${label} "${object_id}" not found` }, null, 2));
                return;
            }

            if ((result as any).is_error) {
                console.log(JSON.stringify({ error: (result as any).error }, null, 2));
                return;
            }

            if (options.component) {
                const comps = result.components.filter((c: any) => c.type === options.component);
                if (comps.length > 0) {
                    console.log(JSON.stringify({
                        file,
                        name: result.name,
                        file_id: result.file_id,
                        components: comps,
                    }, null, 2));
                } else {
                    const available = result.components.map((c: any) => c.type).join(', ');
                    console.log(JSON.stringify({
                        error: `No component of type "${options.component}" found on "${result.name}". Available: ${available}`,
                    }, null, 2));
                }
                return;
            }

            console.log(JSON.stringify({ file, object: result }, null, 2));
        });

    cmd.command('scriptable-object <file>')
        .description('Read a .asset file (ScriptableObject) and show its objects with properties')
        .option('-j, --json', 'Output as JSON')
        .action((file, _options) => {
            const objects = getScanner().read_asset(file);
            const output = {
                file,
                count: objects.length,
                objects,
            };
            console.log(JSON.stringify(output, null, 2));
        });

    cmd.command('settings <project_path>')
        .description('Read Unity project settings (TagManager, DynamicsManager, QualitySettings, TimeManager, etc.)')
        .option('-s, --setting <name>', 'Setting name or alias (tags, physics, quality, time)', 'TagManager')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, options) => {
            const result = read_settings({
                project_path,
                setting: options.setting,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('build <project_path>')
        .description('Read build settings (scene list, build profiles)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, _options) => {
            try {
                const result = get_build_settings(project_path);
                console.log(JSON.stringify(result, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
            }
        });

    return cmd;
}
