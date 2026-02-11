import { Command } from 'commander';
import { deleteGameObject, removeComponent } from './editor';
import { remove_scene } from './build-editor';

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
        });

    cmd.command('component <file> <file_id>')
        .description('Remove a component from a Unity file by file ID')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, _options) => {
            const result = removeComponent({
                file_path: file,
                file_id: file_id,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('build-scene <project_path> <scene_path>')
        .description('Remove a scene from build settings')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, scene_path, _options) => {
            try {
                const result = remove_scene(project_path, scene_path);
                console.log(JSON.stringify(result, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
            }
        });

    return cmd;
}
