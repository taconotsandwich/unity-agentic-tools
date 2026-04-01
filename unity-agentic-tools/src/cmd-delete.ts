import { Command } from 'commander';
import { deleteGameObject, removeComponent, removeComponentBatch, deletePrefabInstance } from './editor';
import { remove_scene } from './build-editor';
import { remove_package } from './packages';

export function build_delete_command(): Command {
    const cmd = new Command('delete')
        .description('Delete Unity objects (GameObjects, components)');

    cmd.command('gameobject <file> <object_name>')
        .description('Delete a GameObject and its hierarchy from a Unity file')
        .option('-j, --json', 'Output as JSON')
        .action((file, object_name, _options) => {
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
        .option('-j, --json', 'Output as JSON')
        .action((file_or_project, component, options) => {
            if (options.all) {
                const result = removeComponentBatch({
                    project_path: file_or_project,
                    component_type: component,
                    game_object: options.on,
                });
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            } else {
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

    cmd.command('build <project_path> <scene_path>')
        .description('Remove a scene from build settings')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, scene_path, _options) => {
            try {
                const result = remove_scene(project_path, scene_path);
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    cmd.command('prefab <file> <prefab_instance>')
        .description('Delete a PrefabInstance and all its stripped/added blocks from a Unity file')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, _options) => {
            const result = deletePrefabInstance({
                file_path: file,
                prefab_instance,
            });
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    // ========== Package deletion ==========
    cmd.command('package <project_path> <name>')
        .description('Remove a package from Packages/manifest.json')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, name, _options) => {
            try {
                const result = remove_package(project_path, name);
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
