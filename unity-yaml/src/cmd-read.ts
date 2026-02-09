import { Command } from 'commander';
import type { UnityScanner } from './scanner';
import { read_settings } from './settings';
import { get_build_settings } from './build-settings';

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
            const pageSize = Math.min(parseInt(options.pageSize, 10) || 200, 1000);
            const cursor = parseInt(options.cursor, 10) || 0;
            const maxDepth = Math.min(parseInt(options.maxDepth, 10) || 10, 50);

            const result = getScanner().inspect_all_paginated({
                file,
                include_properties: options.properties === true,
                verbose: options.verbose === true,
                page_size: pageSize,
                cursor,
                max_depth: maxDepth,
            });

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
            const result = getScanner().inspect({
                file,
                identifier: object_id,
                include_properties: options.properties === true,
                verbose: options.verbose,
            });

            if (!result) {
                console.log(JSON.stringify({ error: `GameObject with ID ${object_id} not found` }, null, 2));
                return;
            }

            if (options.component) {
                const comps = result.components.filter((c: any) => c.type === options.component);
                if (comps.length > 0) {
                    console.log(JSON.stringify({ file, components: comps }, null, 2));
                    return;
                }
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
