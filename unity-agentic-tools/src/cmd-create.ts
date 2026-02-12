import { Command } from 'commander';
import {
    createGameObject,
    createScene,
    createPrefabVariant,
    createScriptableObject,
    createMetaFile,
    addComponent,
    copyComponent,
} from './editor';
import { add_scene } from './build-editor';

export function build_create_command(): Command {
    const cmd = new Command('create')
        .description('Create Unity objects (GameObjects, scenes, prefabs, components)');

    cmd.command('gameobject <file> <name>')
        .description('Create a new GameObject in a Unity file')
        .option('-p, --parent <name|id>', 'Parent GameObject name or Transform fileID')
        .option('-j, --json', 'Output as JSON')
        .action((file, name, options) => {
            let parent: string | number | undefined;
            if (options.parent) {
                const asNumber = parseInt(options.parent, 10);
                parent = isNaN(asNumber) ? options.parent : asNumber;
            }

            const result = createGameObject({
                file_path: file,
                name: name,
                parent: parent,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('scene <output_path>')
        .description('Create a new Unity scene file with required global blocks')
        .option('-d, --defaults', 'Include default Main Camera and Directional Light')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, options) => {
            const result = createScene({
                output_path,
                include_defaults: options.defaults === true,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('prefab-variant <source_prefab> <output_path>')
        .description('Create a Prefab Variant from a source prefab')
        .option('-n, --name <name>', 'Override variant name')
        .option('-j, --json', 'Output as JSON')
        .action((source_prefab, output_path, options) => {
            const result = createPrefabVariant({
                source_prefab,
                output_path,
                variant_name: options.name,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('scriptable-object <output_path> <script>')
        .description('Create a new ScriptableObject .asset file')
        .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, script, options) => {
            const result = createScriptableObject({
                output_path: output_path,
                script: script,
                project_path: options.project,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('meta <script_path>')
        .description('Generate a Unity .meta file for a script (MonoImporter)')
        .option('-j, --json', 'Output as JSON')
        .action((script_path, _options) => {
            const result = createMetaFile({
                script_path: script_path,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('component <file> <object_name> <component>')
        .description('Add a Unity component (e.g., MeshRenderer, Animator, Rigidbody) or custom script')
        .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
        .option('-j, --json', 'Output as JSON')
        .action((file, object_name, component, options) => {
            const result = addComponent({
                file_path: file,
                game_object_name: object_name,
                component_type: component,
                project_path: options.project,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('component-copy <file> <source_file_id> <target_object_name>')
        .description('Copy a component to a target GameObject')
        .option('-j, --json', 'Output as JSON')
        .action((file, source_file_id, target_object_name, _options) => {
            const result = copyComponent({
                file_path: file,
                source_file_id: source_file_id,
                target_game_object_name: target_object_name,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('build-scene <project_path> <scene_path>')
        .description('Add a scene to build settings')
        .option('--index <n>', 'Insert at position (0-based)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, scene_path, options) => {
            try {
                const position = options.index !== undefined ? parseInt(options.index, 10) : undefined;
                const result = add_scene(project_path, scene_path, { position });
                console.log(JSON.stringify(result, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
            }
        });

    return cmd;
}
