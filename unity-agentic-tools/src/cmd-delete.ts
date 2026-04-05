import { Command } from 'commander';
import { deleteGameObject, removeComponent, removeComponentBatch, deletePrefabInstance, deleteAssetFile } from './editor';
import { remove_scene } from './build-editor';
import { remove_package } from './packages';
import { resolve_project_path } from './utils';
import { enforce_loaded_edit_protection, is_editor_connected_for_project } from './loaded-protection';

export function build_delete_command(): Command {
    const cmd = new Command('delete')
        .description('Delete Unity objects (GameObjects, components)');

    cmd.command('gameobject <file> <object_name>')
        .description('Delete a GameObject and its hierarchy from a Unity file')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, object_name, options) => {
            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            const result = deleteGameObject({
                file_path: file,
                object_name: object_name,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('component <file_or_project> <component>')
        .description('Remove a component by file ID or type name (e.g., "Rigidbody", "StandaloneInputModule")')
        .option('--on <game_object>', 'Scope to a specific GameObject (name or fileID)')
        .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
        .option('--all', 'Remove from all scenes and prefabs in the project (first arg becomes project path)')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file_or_project, component, options) => {
            if (options.all) {
                const resolvedProjectPath = resolve_project_path(file_or_project);
                if (!options.bypassLoadedProtection) {
                    const connected = await is_editor_connected_for_project(resolvedProjectPath);
                    if (connected) {
                        console.log(JSON.stringify({
                            success: false,
                            error: 'Refusing to run project-wide delete while editor is connected. Use --bypass-loaded-protection to force file-based edits.',
                        }, null, 2));
                        process.exitCode = 1;
                        return;
                    }
                }
                const result = removeComponentBatch({
                    project_path: resolvedProjectPath,
                    component_type: component,
                    game_object: options.on,
                });
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            } else {
                const guard = await enforce_loaded_edit_protection(file_or_project, options.bypassLoadedProtection, options.project);
                if (!guard.allowed) {
                    console.log(JSON.stringify({ success: false, file_path: file_or_project, error: guard.error }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const result = removeComponent({
                    file_path: file_or_project,
                    file_id: component,
                    game_object: options.on,
                    project_path: options.project,
                });
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            }
        });

    cmd.command('build <scene_path>')
        .description('Remove a scene from build settings')
        .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
        .option('-j, --json', 'Output as JSON')
        .action((scene_path, options) => {
            const resolvedProjectPath = resolve_project_path(options.project);
            try {
                const result = remove_scene(resolvedProjectPath, scene_path);
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    cmd.command('prefab <file> <prefab_instance>')
        .description('Delete a PrefabInstance and all its stripped/added blocks from a Unity file')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, prefab_instance, options) => {
            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            const result = deletePrefabInstance({
                file_path: file,
                prefab_instance,
            });
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('asset <file>')
        .description('Delete an asset file and its .meta sidecar (missing .meta => warning)')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, options) => {
            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            const result = deleteAssetFile({ file_path: file });
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    // ========== Package deletion ==========
    cmd.command('package <name>')
        .description('Remove a package from Packages/manifest.json')
        .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
        .option('-j, --json', 'Output as JSON')
        .action((name, options) => {
            try {
                const resolvedProjectPath = resolve_project_path(options.project);
                const result = remove_package(resolvedProjectPath, name);
                if ('error' in result) {
                    console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                console.log(JSON.stringify(result, null, 2));
            } catch (err: unknown) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    return cmd;
}
