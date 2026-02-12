import { Command } from 'commander';
import type { UnityScanner } from './scanner';
import type { FindResult, Component, AssetObject, ComponentPropertyEdit } from './types';
import {
    editProperty,
    editTransform,
    editComponentByFileId,
    unpackPrefab,
    reparentGameObject,
    editPrefabOverride,
    editArray,
    batchEditProperties,
    batchEditComponentProperties,
    removePrefabOverride,
    addRemovedComponent,
    removeRemovedComponent,
    addRemovedGameObject,
    removeRemovedGameObject,
} from './editor';
import { edit_settings, edit_tag, edit_layer, edit_sorting_layer } from './settings';
import { enable_scene, disable_scene, move_scene } from './build-editor';

function parseVector(str: string): { x: number; y: number; z: number } {
    const parts = str.split(',').map(Number);
    if (parts.length !== 3 || parts.some(v => !Number.isFinite(v))) {
        console.log(JSON.stringify({ error: 'Invalid vector format. Use: x,y,z with finite numbers (e.g., 1,2,3)' }, null, 2));
        process.exit(1);
    }
    return { x: parts[0], y: parts[1], z: parts[2] };
}

/** Resolve a GameObject name or numeric fileID to a Transform fileID. */
function resolve_transform_id(scanner: UnityScanner, file: string, identifier: string): { transform_id: number } | { error: string } {
    // Check for duplicate names before inspect
    if (!/^\d+$/.test(identifier)) {
        const matches = scanner.find_by_name(file, identifier, false);
        if (matches.length > 1) {
            const ids = matches.map((m: FindResult) => m.fileId).join(', ');
            return { error: `Multiple GameObjects named "${identifier}" found (fileIDs: ${ids}). Use numeric fileID.` };
        }
    }
    // Look up by name or fileID via the scanner (verbose needed for class_id/file_id on components)
    const result = scanner.inspect({ file, identifier, verbose: true });

    if (result && !result.is_error) {
        // Found a GameObject — resolve to its Transform component
        const transform = result.components?.find(
            (c: Component) => c.class_id === 4 || c.class_id === 224
        );
        if (transform) return { transform_id: parseInt(transform.file_id, 10) };
    }

    // If inspect didn't find a GameObject (e.g. the ID is already a Transform fileID),
    // return numeric identifiers as-is for direct Transform lookup
    if (/^\d+$/.test(identifier)) {
        return { transform_id: parseInt(identifier, 10) };
    }

    return { error: `Could not resolve "${identifier}" to a Transform component. Use a GameObject name or transform fileID.` };
}

export function build_update_command(getScanner: () => UnityScanner): Command {
    const cmd = new Command('update')
        .description('Update Unity object properties, transforms, settings, and hierarchy');

    cmd.command('gameobject <file> <object_name> <property> <value>')
        .description('Edit GameObject property value safely')
        .option('-j, --json', 'Output as JSON')
        .option('-p, --project <path>', 'Unity project path (for tag validation)')
        .action((file, object_name, property, value, options) => {
            const result = editProperty({
                file_path: file,
                object_name: object_name,
                property: property,
                new_value: value,
                project_path: options.project,
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

    cmd.command('transform <file> <identifier>')
        .description('Edit Transform by GameObject name or transform fileID')
        .option('-p, --position <x,y,z>', 'Set local position')
        .option('-r, --rotation <x,y,z>', 'Set local rotation (Euler angles in degrees)')
        .option('-s, --scale <x,y,z>', 'Set local scale')
        .option('-j, --json', 'Output as JSON')
        .action((file, identifier, options) => {
            const resolved = resolve_transform_id(getScanner(), file, identifier);

            if ('error' in resolved) {
                console.log(JSON.stringify({
                    success: false,
                    file_path: file,
                    error: resolved.error,
                }, null, 2));
                return;
            }

            const result = editTransform({
                file_path: file,
                transform_id: resolved.transform_id,
                position: options.position ? parseVector(options.position) : undefined,
                rotation: options.rotation ? parseVector(options.rotation) : undefined,
                scale: options.scale ? parseVector(options.scale) : undefined,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('scriptable-object <file> <property> <value>')
        .description('Edit a property in a .asset file (first object, or specify --file-id)')
        .option('--file-id <id>', 'Target a specific block by file ID instead of the first object')
        .option('-j, --json', 'Output as JSON')
        .action((file, property, value, options) => {
            let targetFileId: string;
            if (options.fileId) {
                targetFileId = options.fileId;
            } else {
                const objects = getScanner().read_asset(file);
                const target = objects[0];
                if (!target) {
                    console.log(JSON.stringify({ success: false, error: 'No objects found in asset file.' }, null, 2));
                    process.exit(1);
                }
                targetFileId = target.file_id;
            }
            const result = editComponentByFileId({
                file_path: file,
                file_id: targetFileId,
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
                console.log(JSON.stringify({ success: false, error: 'Required: --setting, --property, --value' }, null, 2));
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
                console.log(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
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
                console.log(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
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
        .description('Move a GameObject under a new parent. Use "root" to move to scene root. Use --by-id to specify fileIDs instead of names')
        .option('-j, --json', 'Output as JSON')
        .option('--by-id', 'Treat object_name and new_parent as numeric fileIDs instead of names')
        .action((file, object_name, new_parent, options) => {
            const result = reparentGameObject({
                file_path: file,
                object_name: object_name,
                new_parent: new_parent,
                by_id: options.byId,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    // Prefab command group — consolidates all prefab operations
    const prefab_cmd = new Command('prefab')
        .description('Prefab operations (unpack, override, remove-override, remove/restore component/gameobject)');

    prefab_cmd.command('unpack <file> <prefab_instance>')
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

    prefab_cmd.command('override <file> <prefab_instance> <property_path> <value>')
        .description('Edit or add a property override in a PrefabInstance m_Modifications list')
        .option('--object-reference <ref>', 'Object reference value (default: {fileID: 0})')
        .option('--target <target>', 'Target reference for new entries (e.g., "{fileID: 400000, guid: abc, type: 3}")')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, property_path, value, options) => {
            const result = editPrefabOverride({
                file_path: file,
                prefab_instance,
                property_path,
                new_value: value,
                object_reference: options.objectReference,
                target: options.target,
            });

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('build <project_path> <scene_path>')
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

    cmd.command('array <file> <file_id> <array_property> <action> [value]')
        .description('Insert, append, or remove array elements in a component')
        .option('--index <n>', 'Index for insert/remove')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, array_property, action, value, options) => {
            if (action !== 'insert' && action !== 'append' && action !== 'remove') {
                console.log(JSON.stringify({ success: false, error: 'Action must be "insert", "append", or "remove"' }, null, 2));
                process.exit(1);
            }
            if ((action === 'insert' || action === 'append') && !value) {
                console.log(JSON.stringify({ success: false, error: `Value is required for "${action}" action` }, null, 2));
                process.exit(1);
            }
            const result = editArray({
                file_path: file,
                file_id,
                array_property,
                action: action as 'insert' | 'append' | 'remove',
                value,
                index: options.index !== undefined ? parseInt(options.index, 10) : undefined,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('batch <file> <edits_json>')
        .description('Batch edit multiple GameObject properties in a single file operation')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let edits: Array<{ object_name: string; property: string; new_value: string }>;
            try {
                edits = JSON.parse(edits_json);
            } catch {
                console.log(JSON.stringify({ success: false, error: 'Invalid JSON for edits' }, null, 2));
                process.exit(1);
            }
            const result = batchEditProperties(file, edits);
            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('batch-components <file> <edits_json>')
        .description('Batch edit multiple component properties by fileID in a single operation')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let edits: ComponentPropertyEdit[];
            try {
                edits = JSON.parse(edits_json);
            } catch {
                console.log(JSON.stringify({ success: false, error: 'Invalid JSON for edits' }, null, 2));
                process.exit(1);
            }
            const result = batchEditComponentProperties(file, edits);
            console.log(JSON.stringify(result, null, 2));
        });

    prefab_cmd.command('remove-override <file> <prefab_instance> <property_path>')
        .description('Remove a property override from a PrefabInstance')
        .option('--target <ref>', 'Target reference to match (for disambiguation)')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, property_path, options) => {
            const result = removePrefabOverride({
                file_path: file,
                prefab_instance,
                property_path,
                target: options.target,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    prefab_cmd.command('remove-component <file> <prefab_instance> <component_ref>')
        .description('Add a component to the PrefabInstance m_RemovedComponents list')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, component_ref, _options) => {
            const result = addRemovedComponent({
                file_path: file,
                prefab_instance,
                component_ref,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    prefab_cmd.command('restore-component <file> <prefab_instance> <component_ref>')
        .description('Remove a component from the PrefabInstance m_RemovedComponents list (restore it)')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, component_ref, _options) => {
            const result = removeRemovedComponent({
                file_path: file,
                prefab_instance,
                component_ref,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    prefab_cmd.command('remove-gameobject <file> <prefab_instance> <gameobject_ref>')
        .description('Add a GameObject to the PrefabInstance m_RemovedGameObjects list')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, gameobject_ref, _options) => {
            const result = addRemovedGameObject({
                file_path: file,
                prefab_instance,
                component_ref: gameobject_ref,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    prefab_cmd.command('restore-gameobject <file> <prefab_instance> <gameobject_ref>')
        .description('Remove a GameObject from the PrefabInstance m_RemovedGameObjects list (restore it)')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, gameobject_ref, _options) => {
            const result = removeRemovedGameObject({
                file_path: file,
                prefab_instance,
                component_ref: gameobject_ref,
            });
            console.log(JSON.stringify(result, null, 2));
        });

    cmd.addCommand(prefab_cmd);

    return cmd;
}
