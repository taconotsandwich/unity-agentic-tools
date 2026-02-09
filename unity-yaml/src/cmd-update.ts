import { Command } from 'commander';
import type { UnityScanner } from './scanner';
import {
    editProperty,
    editTransform,
    editComponentByFileId,
    unpackPrefab,
    reparentGameObject,
} from './editor';
import { edit_settings, edit_tag, edit_layer, edit_sorting_layer } from './settings';
import { enable_scene, disable_scene, move_scene } from './build-editor';

function parseVector(str: string): { x: number; y: number; z: number } {
    const parts = str.split(',').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        console.error('Invalid vector format. Use: x,y,z (e.g., 1,2,3)');
        process.exit(1);
    }
    return { x: parts[0], y: parts[1], z: parts[2] };
}

export function build_update_command(getScanner: () => UnityScanner): Command {
    const cmd = new Command('update')
        .description('Update Unity object properties, transforms, settings, and hierarchy');

    cmd.command('gameobject <file> <object_name> <property> <value>')
        .description('Edit GameObject property value safely')
        .option('-j, --json', 'Output as JSON')
        .action((file, object_name, property, value, _options) => {
            const result = editProperty({
                file_path: file,
                object_name: object_name,
                property: property,
                new_value: value,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('component <file> <file_id> <property> <value>')
        .description('Edit any component property by file ID. Supports dotted paths (m_LocalPosition.x) and array paths (m_Materials.Array.data[0])')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, property, value, _options) => {
            const result = editComponentByFileId({
                file_path: file,
                file_id: file_id,
                property: property,
                new_value: value,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('transform <file> <transform_id>')
        .description('Edit Transform component properties by fileID')
        .option('-p, --position <x,y,z>', 'Set local position')
        .option('-r, --rotation <x,y,z>', 'Set local rotation (Euler angles in degrees)')
        .option('-s, --scale <x,y,z>', 'Set local scale')
        .option('-j, --json', 'Output as JSON')
        .action((file, transform_id, options) => {
            const result = editTransform({
                file_path: file,
                transform_id: parseInt(transform_id, 10),
                position: options.position ? parseVector(options.position) : undefined,
                rotation: options.rotation ? parseVector(options.rotation) : undefined,
                scale: options.scale ? parseVector(options.scale) : undefined,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('scriptable-object <file> <property> <value>')
        .description('Edit a property in the first MonoBehaviour block of a .asset file')
        .option('-j, --json', 'Output as JSON')
        .action((file, property, value, _options) => {
            const objects = getScanner().read_asset(file);
            const monoBehaviour = objects.find((obj: any) => obj.class_id === 114);

            if (!monoBehaviour) {
                console.log(JSON.stringify({ success: false, error: 'No MonoBehaviour block found in asset file' }, null, 2));
                process.exit(1);
            }

            const result = editComponentByFileId({
                file_path: file,
                file_id: monoBehaviour.file_id,
                property,
                new_value: value,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('settings <project_path>')
        .description('Edit a property in any ProjectSettings/*.asset file')
        .option('-s, --setting <name>', 'Setting name or alias')
        .option('--property <name>', 'Property name to edit')
        .option('--value <value>', 'New value')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, options) => {
            if (!options.setting || !options.property || !options.value) {
                console.error(JSON.stringify({ success: false, error: 'Required: --setting, --property, --value' }, null, 2));
                process.exit(1);
            }

            const result = edit_settings({
                project_path,
                setting: options.setting,
                property: options.property,
                value: options.value,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('tag <project_path> <action> <tag>')
        .description('Add or remove a tag in the TagManager')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, action, tag, _options) => {
            if (action !== 'add' && action !== 'remove') {
                console.error(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
                process.exit(1);
            }

            const result = edit_tag({
                project_path,
                action: action as 'add' | 'remove',
                tag,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('layer <project_path> <index> <name>')
        .description('Set a named layer at a specific index (3-31)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, index, name, _options) => {
            const result = edit_layer({
                project_path,
                index: parseInt(index, 10),
                name,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('sorting-layer <project_path> <action> <name>')
        .description('Add or remove a sorting layer')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, action, name, _options) => {
            if (action !== 'add' && action !== 'remove') {
                console.error(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
                process.exit(1);
            }

            const result = edit_sorting_layer({
                project_path,
                action: action as 'add' | 'remove',
                name,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('parent <file> <object_name> <new_parent>')
        .description('Move a GameObject under a new parent. Use "root" to move to scene root')
        .option('-j, --json', 'Output as JSON')
        .action((file, object_name, new_parent, _options) => {
            const result = reparentGameObject({
                file_path: file,
                object_name: object_name,
                new_parent: new_parent,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('prefab <file> <prefab_instance>')
        .description('Unpack a PrefabInstance into standalone GameObjects')
        .option('-p, --project <path>', 'Unity project path (for GUID cache lookup)')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, options) => {
            const result = unpackPrefab({
                file_path: file,
                prefab_instance: prefab_instance,
                project_path: options.project,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('build-scene <project_path> <scene_path>')
        .description('Enable, disable, or move a scene in build settings')
        .option('--enable', 'Enable the scene')
        .option('--disable', 'Disable the scene')
        .option('--move <index>', 'Move scene to position')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, scene_path, options) => {
            try {
                if (options.move !== undefined) {
                    const result = move_scene(project_path, scene_path, parseInt(options.move, 10));
                    console.log(JSON.stringify(result, null, 2));
                } else if (options.enable) {
                    const result = enable_scene(project_path, scene_path);
                    console.log(JSON.stringify(result, null, 2));
                } else if (options.disable) {
                    const result = disable_scene(project_path, scene_path);
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(JSON.stringify({ success: false, error: 'Specify --enable, --disable, or --move <index>' }, null, 2));
                    process.exit(1);
                }
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
            }
        });

    return cmd;
}
