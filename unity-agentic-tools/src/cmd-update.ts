import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, resolve, dirname } from 'path';
import type { UnityScanner } from './scanner';
import type { FindResult, Component, ComponentPropertyEdit, PropertyEdit } from './types';
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
import { load_input_actions, save_input_actions, add_map, remove_map, add_action, remove_action, add_binding, remove_binding, add_control_scheme, remove_control_scheme } from './input-actions';
import type { InputActionsFile } from './input-actions';
import { UnityDocument } from './editor';
import { update_root_order_in_block, extractGuidFromMeta } from './editor/shared';
import { split_yaml_blocks, parse_inline_ref, find_state_by_name, find_state_machine_for_layer, generate_file_id, collect_file_ids } from './animator-utils';
import type { AnimatorBlock } from './animator-utils';

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
    let resolved_id = identifier;
    if (!/^\d+$/.test(identifier)) {
        const matches = scanner.find_by_name(file, identifier, false);
        if (matches.length > 1) {
            const ids = matches.map((m: FindResult) => m.fileId).join(', ');
            return { error: `Multiple GameObjects named "${identifier}" found (fileIDs: ${ids}). Use numeric fileID.` };
        }
        if (matches.length === 1) {
            resolved_id = matches[0].fileId;
        }
    }
    // Look up by name or fileID via the scanner (verbose needed for class_id/file_id on components)
    const result = scanner.inspect({ file, identifier: resolved_id, verbose: true });

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
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('component <file> <file_id> <property> <value>')
        .description('Edit any component property by file ID. Supports dotted paths (m_LocalPosition.x) and array paths (m_Materials.Array.data[0])')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, property, value, _options) => {
            // Validate m_RootOrder: must be a non-negative integer
            if (property === 'm_RootOrder') {
                const num = Number(value);
                if (!Number.isInteger(num) || num < 0) {
                    console.log(JSON.stringify({ success: false, error: `m_RootOrder must be a non-negative integer, got "${value}"` }, null, 2));
                    process.exitCode = 1;
                    return;
                }
            }

            const result = editComponentByFileId({
                file_path: file,
                file_id: file_id,
                property: property,
                new_value: value,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('transform <file> <identifier>')
        .description('Edit Transform by GameObject name or transform fileID')
        .option('-p, --position <x,y,z>', 'Set local position')
        .option('-r, --rotation <x,y,z>', 'Set local rotation (Euler angles in degrees)')
        .option('-s, --scale <x,y,z>', 'Set local scale')
        .option('-j, --json', 'Output as JSON')
        .action((file, identifier, options) => {
            if (!options.position && !options.rotation && !options.scale) {
                console.log(JSON.stringify({
                    success: false,
                    file_path: file,
                    error: 'No transform flags specified. Use --position, --rotation, or --scale',
                }, null, 2));
                process.exitCode = 1;
                return;
            }

            const resolved = resolve_transform_id(getScanner(), file, identifier);

            if ('error' in resolved) {
                console.log(JSON.stringify({
                    success: false,
                    file_path: file,
                    error: resolved.error,
                }, null, 2));
                process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('scriptable-object <file> <property> <value>')
        .description('Edit a property in a .asset file (first object, or specify --file-id)')
        .option('--file-id <id>', 'Target a specific block by file ID instead of the first object')
        .option('-j, --json', 'Output as JSON')
        .action((file, property, value, options) => {
            if (!file.endsWith('.asset')) {
                console.log(JSON.stringify({ success: false, error: `File is not a ScriptableObject (.asset): ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }
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

            // Rewrite generic component error to contextually appropriate message
            if (!result.success && result.error) {
                result.error = result.error
                    .replace(/Component with file ID/g, 'Object with file ID')
                    .replace(/component \d+/g, (m) => m.replace('component', 'object'));
            }

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
                    if (!result.success) process.exitCode = 1;
                } else if (options.enable) {
                    const result = enable_scene(project_path, scene_path);
                    console.log(JSON.stringify(result, null, 2));
                    if (!result.success) process.exitCode = 1;
                } else if (options.disable) {
                    const result = disable_scene(project_path, scene_path);
                    console.log(JSON.stringify(result, null, 2));
                    if (!result.success) process.exitCode = 1;
                } else {
                    console.log(JSON.stringify({ success: false, error: 'Specify --enable, --disable, or --move <index>' }, null, 2));
                    process.exit(1);
                }
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    cmd.command('array <file> <file_id> <array_property> <action> [args...]')
        .description('Insert, append, or remove array elements in a component. Insert: <index> <value> or <value> --index <n>. Append: <value>. Remove: <index> or --index <n>.')
        .option('--index <n>', 'Index for insert/remove')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, array_property, action, args: string[], options) => {
            if (action !== 'insert' && action !== 'append' && action !== 'remove') {
                console.log(JSON.stringify({ success: false, error: 'Action must be "insert", "append", or "remove"' }, null, 2));
                process.exit(1);
            }

            let value: string | undefined;
            let index: number | undefined = options.index !== undefined ? parseInt(options.index, 10) : undefined;

            if (action === 'insert') {
                if (args.length >= 2 && index === undefined) {
                    // Positional: <index> <value>
                    index = parseInt(args[0], 10);
                    value = args[1];
                    if (isNaN(index)) {
                        console.log(JSON.stringify({ success: false, error: `Invalid index "${args[0]}". Must be a non-negative integer.` }, null, 2));
                        process.exit(1);
                    }
                } else if (args.length >= 1) {
                    // Value only — index from --index or append position
                    value = args[0];
                } else {
                    console.log(JSON.stringify({ success: false, error: 'Value is required for "insert" action. Usage: insert <index> <value> or insert <value> --index <n>' }, null, 2));
                    process.exit(1);
                }
            } else if (action === 'append') {
                if (args.length < 1) {
                    console.log(JSON.stringify({ success: false, error: 'Value is required for "append" action' }, null, 2));
                    process.exit(1);
                }
                value = args[0];
            } else if (action === 'remove') {
                if (index === undefined) {
                    if (args.length >= 1) {
                        index = parseInt(args[0], 10);
                        if (isNaN(index)) {
                            console.log(JSON.stringify({ success: false, error: `Invalid index "${args[0]}". Must be a non-negative integer.` }, null, 2));
                            process.exit(1);
                        }
                    } else {
                        console.log(JSON.stringify({ success: false, error: 'Index is required for "remove" action. Usage: remove <index> or remove --index <n>' }, null, 2));
                        process.exit(1);
                    }
                }
            }

            const result = editArray({
                file_path: file,
                file_id,
                array_property,
                action: action as 'insert' | 'append' | 'remove',
                value,
                index,
            });
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('batch <file> <edits_json>')
        .description('Batch edit multiple GameObject properties in a single file operation. JSON format: [{"object_name":"...","property":"...","value":"..."}]')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let raw_edits: Array<{ object_name: string; property: string; new_value?: string; value?: string }>;
            try {
                const parsed = JSON.parse(edits_json);
                if (!Array.isArray(parsed)) {
                    console.log(JSON.stringify({ success: false, error: 'Edits must be a JSON array. Format: [{"object_name":"...","property":"...","value":"..."}]' }, null, 2));
                    process.exit(1);
                }
                raw_edits = parsed;
            } catch {
                console.log(JSON.stringify({ success: false, error: 'Invalid JSON for edits' }, null, 2));
                process.exit(1);
            }
            // Normalize: accept both "value" and "new_value" keys
            const edits: PropertyEdit[] = raw_edits.map(e => ({
                object_name: e.object_name,
                property: e.property,
                new_value: e.new_value ?? e.value ?? '',
            }));
            // Validate required fields
            if (edits.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'Empty edits array. Provide at least one edit: [{"object_name":"...","property":"...","value":"..."}]' }, null, 2));
                process.exit(1);
            }
            for (const edit of edits) {
                if (!edit.object_name) {
                    console.log(JSON.stringify({ success: false, error: 'Missing "object_name" in edit entry. JSON format: [{"object_name":"...","property":"...","value":"..."}]' }, null, 2));
                    process.exit(1);
                }
                if (!edit.property) {
                    console.log(JSON.stringify({ success: false, error: `Missing "property" for ${edit.object_name}. JSON format: [{"object_name":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
                if (edit.new_value === undefined || edit.new_value === null) {
                    console.log(JSON.stringify({ success: false, error: `Missing "value" for ${edit.object_name}.${edit.property}. JSON format: [{"object_name":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
            }
            const result = batchEditProperties(file, edits);
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('batch-components <file> <edits_json>')
        .description('Batch edit multiple component properties by fileID in a single operation. JSON format: [{"file_id":"...","property":"...","value":"..."}]')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let raw_edits: Array<{ file_id: string; property: string; new_value?: string; value?: string }>;
            try {
                const parsed = JSON.parse(edits_json);
                if (!Array.isArray(parsed)) {
                    console.log(JSON.stringify({ success: false, error: 'Edits must be a JSON array. Format: [{"file_id":"...","property":"...","value":"..."}]' }, null, 2));
                    process.exit(1);
                }
                raw_edits = parsed;
            } catch {
                console.log(JSON.stringify({ success: false, error: 'Invalid JSON for edits' }, null, 2));
                process.exit(1);
            }
            // Normalize: accept both "value" and "new_value" keys
            const edits: ComponentPropertyEdit[] = raw_edits.map(e => ({
                file_id: e.file_id,
                property: e.property,
                new_value: e.new_value ?? e.value ?? '',
            }));
            // Validate required fields
            if (edits.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'Empty edits array. Provide at least one edit: [{"file_id":"...","property":"...","value":"..."}]' }, null, 2));
                process.exit(1);
            }
            for (const edit of edits) {
                if (!edit.file_id) {
                    console.log(JSON.stringify({ success: false, error: 'Missing "file_id" in edit entry. JSON format: [{"file_id":"...","property":"...","value":"..."}]' }, null, 2));
                    process.exit(1);
                }
                if (!edit.property) {
                    console.log(JSON.stringify({ success: false, error: `Missing "property" for component ${edit.file_id}. JSON format: [{"file_id":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
                if (edit.new_value === undefined || edit.new_value === null) {
                    console.log(JSON.stringify({ success: false, error: `Missing "value" for component ${edit.file_id}.${edit.property}. JSON format: [{"file_id":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
            }
            const result = batchEditComponentProperties(file, edits);
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
        });

    // ========== P2.2: Material editing ==========
    cmd.command('material <file>')
        .description('Edit Unity Material properties (.mat file)')
        .option('--set <property=value>', 'Set a float property (e.g., _Metallic=0.8)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--set-color <property=r,g,b,a>', 'Set a color property (e.g., _Color=1,0,0,1)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--set-texture <property=guid>', 'Set a texture property GUID (e.g., _MainTex=abc123)')
        .option('--shader <guid>', 'Change shader reference GUID')
        .option('--keyword-add <keyword>', 'Add a shader keyword', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--keyword-remove <keyword>', 'Remove a shader keyword', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('-j, --json', 'Output as JSON')
        .configureOutput({
            writeErr: (str: string) => {
                if (str.includes('too many arguments')) {
                    console.error(str.trim());
                    console.error('Hint: Use --set-color property=r,g,b,a (single arg with =). Example: --set-color _Color=1,0,0,1');
                } else {
                    console.error(str);
                }
            }
        })
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }
            let content = readFileSync(file, 'utf-8');
            const changes: string[] = [];

            // --shader: replace m_Shader GUID
            if (options.shader) {
                const guid = options.shader as string;
                if (!/^[a-f0-9]{32}$/.test(guid)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid shader GUID "${guid}". Must be a 32-character hex string` }, null, 2));
                    process.exit(1);
                }
                content = content.replace(
                    /(m_Shader:\s*\{[^}]*guid:\s*)[a-f0-9]+/,
                    `$1${guid}`
                );
                changes.push(`shader -> ${guid}`);
            }

            // --set: float/object properties in m_Floats or m_Colors sections
            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                // Check for undefined (no = found) rather than empty string — empty is valid (reset/clear)
                if (val === undefined) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const escaped_prop = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Try matching numeric value first, then object value {…}
                const float_re = new RegExp(`(- ${escaped_prop}:\\s*)[\\d.e+-]+`);
                const obj_re = new RegExp(`(- ${escaped_prop}:\\s*)\\{[^}]*\\}`);
                if (float_re.test(content)) {
                    content = content.replace(float_re, `$1${val}`);
                    changes.push(`${prop} -> ${val}`);
                } else if (obj_re.test(content)) {
                    content = content.replace(obj_re, `$1${val}`);
                    changes.push(`${prop} -> ${val}`);
                } else {
                    changes.push(`${prop}: not found (skipped)`);
                }
            }

            // --set-color: color properties in m_Colors section
            for (const entry of (options.setColor as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set-color format: "${entry}". Use property=r,g,b,a` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const parts = entry.slice(eq + 1).split(',').map(Number);
                if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) {
                    console.log(JSON.stringify({ success: false, error: `Invalid color format for "${prop}". Use r,g,b,a (e.g., 1,0,0,1)` }, null, 2));
                    process.exit(1);
                }
                const re = new RegExp(`(- ${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*)\{[^}]*\}`);
                if (re.test(content)) {
                    content = content.replace(re, `$1{r: ${parts[0]}, g: ${parts[1]}, b: ${parts[2]}, a: ${parts[3]}}`);
                    changes.push(`${prop} -> {r: ${parts[0]}, g: ${parts[1]}, b: ${parts[2]}, a: ${parts[3]}}`);
                } else {
                    changes.push(`${prop}: not found (skipped)`);
                }
            }

            // --set-texture: texture GUID in m_TexEnvs section
            if (options.setTexture) {
                const eq = (options.setTexture as string).indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: 'Invalid --set-texture format. Use property=guid' }, null, 2)); process.exit(1); }
                const prop = (options.setTexture as string).slice(0, eq);
                const guid = (options.setTexture as string).slice(eq + 1);
                if (!/^[a-f0-9]{32}$/.test(guid)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid texture GUID "${guid}". Must be a 32-character hex string` }, null, 2));
                    process.exit(1);
                }
                // Find the texture entry and replace its guid
                const tex_section_re = new RegExp(`(- ${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[\\s\\S]*?m_Texture:\\s*\\{[^}]*guid:\\s*)[a-f0-9]+`);
                if (tex_section_re.test(content)) {
                    content = content.replace(tex_section_re, `$1${guid}`);
                    changes.push(`${prop} texture -> ${guid}`);
                } else {
                    changes.push(`${prop} texture: not found (skipped)`);
                }
            }

            // --keyword-add / --keyword-remove
            // Supports both legacy m_ShaderKeywords (space-separated string) and
            // newer m_ValidKeywords/m_InvalidKeywords (YAML array) formats.
            for (const kw of (options.keywordAdd as string[])) {
                // Try legacy m_ShaderKeywords first (space-separated string)
                const kw_re = /m_ShaderKeywords:[ \t]*(.*)/;
                const m = kw_re.exec(content);
                if (m) {
                    const existing = m[1].trim();
                    const keywords = existing.length > 0 ? existing.split(' ') : [];
                    if (!keywords.includes(kw)) {
                        keywords.push(kw);
                        content = content.replace(kw_re, `m_ShaderKeywords: ${keywords.join(' ')}`);
                        changes.push(`keyword added: ${kw}`);
                    } else {
                        changes.push(`keyword "${kw}": already exists (skipped)`);
                    }
                } else {
                    // Try newer m_ValidKeywords (YAML array) format
                    const empty_valid_re = /m_ValidKeywords: \[\]/;
                    const list_valid_re = /m_ValidKeywords:\n((?:  - [^\n]+\n)*)/;
                    if (empty_valid_re.test(content)) {
                        content = content.replace(empty_valid_re, `m_ValidKeywords:\n  - ${kw}`);
                        changes.push(`keyword added: ${kw}`);
                    } else if (list_valid_re.test(content)) {
                        const lm = list_valid_re.exec(content);
                        if (lm) {
                            const entries = lm[1].trim().split('\n').map(l => l.replace(/^\s*-\s*/, '').trim());
                            if (!entries.includes(kw)) {
                                content = content.replace(list_valid_re, `m_ValidKeywords:\n${lm[1]}  - ${kw}\n`);
                                changes.push(`keyword added: ${kw}`);
                            } else {
                                changes.push(`keyword "${kw}" already present (skipped)`);
                            }
                        }
                    }
                }
            }
            for (const kw of (options.keywordRemove as string[])) {
                // Try legacy m_ShaderKeywords first
                const kw_re = /m_ShaderKeywords:[ \t]*(.*)/;
                const m = kw_re.exec(content);
                if (m) {
                    const existing = m[1].trim();
                    const keywords = existing.split(' ').filter(k => k !== kw);
                    if (keywords.length === existing.split(' ').filter(k => k.length > 0).length) {
                        // Keyword was not in the list
                        changes.push(`keyword "${kw}": not found (skipped)`);
                    } else {
                        content = content.replace(kw_re, `m_ShaderKeywords: ${keywords.join(' ')}`);
                        changes.push(`keyword removed: ${kw}`);
                    }
                } else {
                    // Try newer m_ValidKeywords (YAML array) format
                    const entry_re = new RegExp(`  - ${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`);
                    if (entry_re.test(content)) {
                        content = content.replace(entry_re, '');
                        // If all keywords removed, restore empty array notation
                        if (/m_ValidKeywords:\n\s*m_/.test(content) || /m_ValidKeywords:\n$/.test(content)) {
                            content = content.replace(/m_ValidKeywords:\n/, 'm_ValidKeywords: []\n');
                        }
                        changes.push(`keyword removed: ${kw}`);
                    } else {
                        changes.push(`keyword "${kw}": not found (skipped)`);
                    }
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set, --set-color, --set-texture, --shader, --keyword-add, or --keyword-remove' }, null, 2));
                process.exit(1);
            }

            // Check if any real modifications were made (vs all skipped)
            const has_real_changes = changes.some(c => !c.includes('(skipped)'));
            if (!has_real_changes) {
                console.log(JSON.stringify({ success: false, file, changes, error: 'No properties were modified (all targets not found)' }, null, 2));
                process.exitCode = 1;
                return;
            }

            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    // ========== P4.2: Meta file editing ==========
    cmd.command('meta [file]')
        .description('Edit Unity .meta file importer settings')
        .option('--set <key=value>', 'Set an importer setting (e.g., isReadable=1)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--max-size <n>', 'Set TextureImporter maxTextureSize')
        .option('--compression <type>', 'Set textureCompression (0=None, 1=LowQuality, 2=Normal, 3=HighQuality)')
        .option('--filter-mode <mode>', 'Set filterMode (0=Point, 1=Bilinear, 2=Trilinear)')
        .option('--read-write', 'Enable isReadable')
        .option('--no-read-write', 'Disable isReadable')
        .option('--batch <glob>', 'Apply to all matching files')
        .option('--dry-run', 'Preview changes without writing')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!file && !options.batch) {
                console.log(JSON.stringify({ success: false, error: 'Provide a file path or use --batch <glob>' }, null, 2));
                process.exit(1);
            }
            const metaPath = file ? (file.endsWith('.meta') ? file : `${file}.meta`) : '';
            // Build key-value edits from options
            const edits: Array<{ key: string; value: string }> = [];

            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use key=value` }, null, 2)); process.exit(1); }
                edits.push({ key: entry.slice(0, eq), value: entry.slice(eq + 1) });
            }
            if (options.maxSize) {
                const size = parseInt(options.maxSize as string, 10);
                if (isNaN(size) || size < 1) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --max-size value "${options.maxSize}". Must be a positive integer (e.g., 512, 1024, 2048)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'maxTextureSize', value: String(size) });
            }
            if (options.compression !== undefined && options.compression !== false) {
                const valid_compression = ['0', '1', '2', '3'];
                const cv = String(options.compression);
                if (!valid_compression.includes(cv)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --compression value "${options.compression}". Valid values: 0 (None), 1 (LowQuality), 2 (Normal), 3 (HighQuality)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'textureCompression', value: cv });
            }
            if (options.filterMode !== undefined && options.filterMode !== false) {
                const valid_filter = ['0', '1', '2'];
                const fv = String(options.filterMode);
                if (!valid_filter.includes(fv)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --filter-mode value "${options.filterMode}". Valid values: 0 (Point), 1 (Bilinear), 2 (Trilinear)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'filterMode', value: fv });
            }
            if (options.readWrite === true) edits.push({ key: 'isReadable', value: '1' });
            if (options.readWrite === false) edits.push({ key: 'isReadable', value: '0' });

            if (edits.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No edits specified. Use --set, --max-size, --compression, --filter-mode, or --read-write' }, null, 2));
                process.exit(1);
            }

            // Handle batch mode (P4.3)
            if (options.batch) {
                const glob_pattern = options.batch as string;
                const pattern = glob_pattern.endsWith('.meta') ? glob_pattern : `${glob_pattern}.meta`;
                // Simple glob: split at last '/' before glob chars, scan dir for matching suffix
                const first_glob = pattern.search(/[*?[\]{}]/);
                const dir_part = first_glob >= 0 ? pattern.slice(0, pattern.lastIndexOf('/', first_glob)) : dirname(pattern);
                const dir = resolve(dir_part);
                const suffix = basename(pattern).replace(/^\*+/, '');
                const meta_files: string[] = [];
                const scan = (d: string): void => {
                    for (const entry of readdirSync(d)) {
                        const full = join(d, entry);
                        if (statSync(full).isDirectory()) {
                            if (pattern.includes('**')) scan(full);
                        } else if (entry.endsWith(suffix)) {
                            meta_files.push(full);
                        }
                    }
                };
                if (existsSync(dir)) scan(dir);
                if (meta_files.length === 0) {
                    console.log(JSON.stringify({ success: false, error: `No files matched pattern: ${glob_pattern}` }, null, 2));
                    process.exit(1);
                }

                const results: { file: string; changes: string[] }[] = [];
                for (const mf of meta_files) {
                    let mc = readFileSync(mf, 'utf-8');
                    const file_changes: string[] = [];
                    for (const edit of edits) {
                        const re = new RegExp(`^(\\s*${edit.key}:)[ \\t]*.*$`, 'm');
                        if (re.test(mc)) {
                            mc = mc.replace(re, `$1 ${edit.value}`);
                            file_changes.push(`${edit.key} -> ${edit.value}`);
                        }
                    }
                    if (file_changes.length > 0) {
                        if (!options.dryRun) writeFileSync(mf, mc, 'utf-8');
                        results.push({ file: mf, changes: file_changes });
                    }
                }

                console.log(JSON.stringify({
                    success: true,
                    dry_run: !!options.dryRun,
                    files_matched: meta_files.length,
                    files_modified: results.length,
                    results,
                }, null, 2));
                return;
            }

            if (!existsSync(metaPath)) {
                console.log(JSON.stringify({ success: false, error: `Meta file not found: ${metaPath}` }, null, 2));
                process.exit(1);
            }

            let content = readFileSync(metaPath, 'utf-8');
            const changes: string[] = [];

            for (const edit of edits) {
                // Match "  key: value" at any indentation level
                // Use [ \t]* (not \s*) to avoid matching newlines in multiline mode
                const re = new RegExp(`^(\\s*${edit.key}:)[ \\t]*.*$`, 'm');
                if (re.test(content)) {
                    content = content.replace(re, `$1 ${edit.value}`);
                    changes.push(`${edit.key} -> ${edit.value}`);
                } else {
                    changes.push(`${edit.key}: not found (skipped)`);
                }
            }

            if (options.dryRun) {
                console.log(JSON.stringify({ success: true, dry_run: true, file: metaPath, changes }, null, 2));
                return;
            }

            writeFileSync(metaPath, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file: metaPath, changes }, null, 2));
        });

    // ========== P5.2: Animation event editing ==========
    cmd.command('animation <file>')
        .description('Edit AnimationClip settings and events')
        .option('--set <property=value>', 'Set a clip property (e.g., wrap-mode=2 for Loop)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--add-event <time,function[,data]>', 'Add an animation event (e.g., 0.5,OnFootstep,left)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--remove-event <index>', 'Remove an animation event by index (0-based)')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }
            if (!file.endsWith('.anim')) {
                console.log(JSON.stringify({ success: false, error: `File is not an AnimationClip (.anim): ${file}` }, null, 2));
                process.exit(1);
            }
            let content = readFileSync(file, 'utf-8');
            const changes: string[] = [];

            const property_map: Record<string, string> = {
                'wrap-mode': 'm_WrapMode',
                'sample-rate': 'm_SampleRate',
                'loop-time': 'm_LoopTime',
            };

            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                const yaml_key = property_map[prop] || prop;
                const re = new RegExp(`^(\\s*${yaml_key}:\\s*).+$`, 'm');
                if (re.test(content)) {
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${yaml_key} -> ${val}`);
                } else {
                    changes.push(`${yaml_key}: not found (skipped)`);
                }
            }

            // --add-event
            for (const addEventEntry of (options.addEvent as string[])) {
                const parts = addEventEntry.split(',');
                if (parts.length < 2) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --add-event format. Use: time,functionName[,data]' }, null, 2));
                    process.exit(1);
                }
                const time = parseFloat(parts[0]);
                if (!Number.isFinite(time)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid event time: "${parts[0]}". Must be a number.` }, null, 2));
                    process.exit(1);
                }
                const functionName = parts[1];
                const data = parts.slice(2).join(',');

                const event_yaml = [
                    `  - time: ${time}`,
                    `    functionName: ${functionName}`,
                    `    data: ${data}`,
                    `    objectReferenceParameter: {fileID: 0}`,
                    `    floatParameter: 0`,
                    `    intParameter: 0`,
                    `    messageOptions: 0`,
                ].join('\n');

                // Check for empty events array
                const empty_events_re = /m_Events: \[\]/;
                if (empty_events_re.test(content)) {
                    content = content.replace(empty_events_re, `m_Events:\n${event_yaml}`);
                    changes.push(`added event: ${functionName} at ${time}`);
                } else if (content.includes('m_Events:')) {
                    // Find the end of the m_Events section and append
                    const events_lines = content.split('\n');
                    let in_events = false;
                    let insert_idx = -1;
                    for (let ei = 0; ei < events_lines.length; ei++) {
                        const et = events_lines[ei].trimStart();
                        if (et.startsWith('m_Events:')) {
                            in_events = true;
                            continue;
                        }
                        if (in_events) {
                            // Detect end of events section (next m_ field at same or lower indent)
                            if (et.startsWith('m_') && et.includes(':') && !et.startsWith('messageOptions') && !et.startsWith('m_Events')) {
                                insert_idx = ei;
                                break;
                            }
                        }
                    }
                    if (insert_idx >= 0) {
                        events_lines.splice(insert_idx, 0, event_yaml);
                        content = events_lines.join('\n');
                        changes.push(`added event: ${functionName} at ${time}`);
                    } else {
                        // Append at the very end of the events section
                        content = content.replace(/(m_Events:[\s\S]*?)(\n\s*m_|\n---|\n$)/, `$1\n${event_yaml}$2`);
                        changes.push(`added event: ${functionName} at ${time}`);
                    }
                } else {
                    // No m_Events field at all -- add it before m_EditorCurves or at end
                    const insert_before = /^  m_EditorCurves:/m;
                    if (insert_before.test(content)) {
                        content = content.replace(insert_before, `m_Events:\n${event_yaml}\n  m_EditorCurves:`);
                    } else {
                        content += `\n  m_Events:\n${event_yaml}\n`;
                    }
                    changes.push(`added event: ${functionName} at ${time}`);
                }
            }

            // --remove-event
            if (options.removeEvent !== undefined) {
                const idx = parseInt(options.removeEvent as string, 10);
                if (isNaN(idx) || idx < 0) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --remove-event index. Must be a non-negative integer.' }, null, 2));
                    process.exit(1);
                }

                const event_lines = content.split('\n');
                let in_events = false;
                let event_count = 0;
                let remove_start = -1;
                let remove_end = -1;

                for (let ei = 0; ei < event_lines.length; ei++) {
                    const et = event_lines[ei].trimStart();
                    if (et.startsWith('m_Events:') && !et.endsWith('[]')) {
                        in_events = true;
                        continue;
                    }
                    if (in_events) {
                        if (et.startsWith('- time:')) {
                            if (event_count === idx) {
                                remove_start = ei;
                            }
                            if (event_count === idx + 1 && remove_start >= 0) {
                                remove_end = ei;
                                break;
                            }
                            event_count++;
                        }
                        // Detect end of events section
                        if (et.startsWith('m_') && et.includes(':') && !et.startsWith('- ') && !et.startsWith('time:') && !et.startsWith('functionName:') && !et.startsWith('data:') && !et.startsWith('objectReferenceParameter:') && !et.startsWith('floatParameter:') && !et.startsWith('intParameter:') && !et.startsWith('messageOptions:')) {
                            if (remove_start >= 0) {
                                remove_end = ei;
                            }
                            break;
                        }
                    }
                }

                if (remove_start < 0) {
                    console.log(JSON.stringify({ success: false, file, error: `Event index ${idx} not found (${event_count} events exist)` }, null, 2));
                    process.exitCode = 1;
                    return;
                } else {
                    if (remove_end < 0) remove_end = event_lines.length;
                    event_lines.splice(remove_start, remove_end - remove_start);

                    // Check if all events removed
                    const remaining = event_lines.join('\n');
                    if (event_count === 1) {
                        // Last event was removed, set to empty array
                        content = remaining.replace(/m_Events:\s*\n/, 'm_Events: []\n');
                    } else {
                        content = remaining;
                    }
                    changes.push(`removed event at index ${idx}`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set, --add-event, or --remove-event' }, null, 2));
                process.exit(1);
            }

            // Check if all changes were skipped (no real modifications)
            const has_real_anim_changes = changes.some(c => !c.includes('(skipped)'));
            if (!has_real_anim_changes) {
                console.log(JSON.stringify({ success: false, file, changes, error: 'No properties were modified (all targets not found)' }, null, 2));
                process.exitCode = 1;
                return;
            }

            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    // ========== P7.2: AnimatorController parameter editing ==========
    const PARAM_TYPE_MAP: Record<string, number> = { float: 1, int: 3, bool: 4, trigger: 9 };

    cmd.command('animator <file>')
        .description('Edit AnimatorController parameters')
        .option('--add-parameter <name>', 'Add a new parameter')
        .option('--type <float|int|bool|trigger>', 'Parameter type (required with --add-parameter)')
        .option('--remove-parameter <name>', 'Remove a parameter by name')
        .option('--set-default <param=value>', 'Set parameter default value (e.g., Speed=1.5)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }

            let content = readFileSync(file, 'utf-8');
            // Normalize line endings for consistent regex matching
            const had_crlf = content.includes('\r\n');
            if (had_crlf) content = content.replace(/\r\n/g, '\n');
            const changes: string[] = [];

            // Find m_AnimatorParameters section in the AnimatorController block
            const ctrl_match = content.match(/^--- !u!91 &(\d+)/m);
            if (!ctrl_match) {
                console.log(JSON.stringify({ success: false, error: 'No AnimatorController block found (class_id 91)' }, null, 2));
                process.exit(1);
            }
            const ctrl_file_id = ctrl_match[1];

            // --add-parameter
            if (options.addParameter) {
                const name = options.addParameter as string;
                const type_str = (options.type as string || '').toLowerCase();
                const type_num = PARAM_TYPE_MAP[type_str];
                if (type_num === undefined) {
                    const msg = !options.type
                        ? '--type is required with --add-parameter. Options: float, int, bool, trigger'
                        : `Invalid parameter type "${options.type}". Valid types: float, int, bool, trigger`;
                    console.log(JSON.stringify({ success: false, error: msg }, null, 2));
                    process.exit(1);
                }

                const param_entry = [
                    `  - m_Name: ${name}`,
                    `    m_Type: ${type_num}`,
                    `    m_DefaultFloat: 0`,
                    `    m_DefaultInt: 0`,
                    `    m_DefaultBool: 0`,
                    `    m_Controller: {fileID: ${ctrl_file_id}}`,
                ].join('\n');

                // Check for empty parameters array
                const empty_re = /m_AnimatorParameters: \[\]/;
                if (empty_re.test(content)) {
                    content = content.replace(empty_re, `m_AnimatorParameters:\n${param_entry}`);
                    changes.push(`added parameter "${name}" (${type_str})`);
                } else {
                    // Append before m_AnimatorLayers
                    const layers_re = /(  m_AnimatorLayers:)/;
                    if (layers_re.test(content)) {
                        content = content.replace(layers_re, `${param_entry}\n$1`);
                        changes.push(`added parameter "${name}" (${type_str})`);
                    } else {
                        changes.push(`parameter "${name}": could not find insertion point (skipped)`);
                    }
                }
            }

            // --remove-parameter
            if (options.removeParameter) {
                const name = options.removeParameter as string;
                // Match the full parameter entry block (from "  - m_Name: <name>" through to next "  - m_Name:" or "  m_Animator")
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const param_re = new RegExp(`  - m_Name: ${escaped}\\n(?:    [^\\n]+\\n)*`, 'g');
                if (param_re.test(content)) {
                    content = content.replace(param_re, '');
                    // If all parameters removed, restore empty array notation
                    if (/m_AnimatorParameters:\n  m_AnimatorLayers:/.test(content)) {
                        content = content.replace(/m_AnimatorParameters:\n(  m_AnimatorLayers:)/, 'm_AnimatorParameters: []\n$1');
                    }
                    changes.push(`removed parameter "${name}"`);
                } else {
                    changes.push(`parameter "${name}": not found (skipped)`);
                }
            }

            // --set-default
            for (const entry of (options.setDefault as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --set-default format: "${entry}". Use param=value` }, null, 2));
                    process.exit(1);
                }
                const param_name = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                const escaped = param_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Find the parameter entry and determine its type
                const param_block_re = new RegExp(`(  - m_Name: ${escaped}\\n    m_Type: (\\d+)\\n)`);
                const block_match = param_block_re.exec(content);
                if (!block_match) {
                    changes.push(`parameter "${param_name}": not found (skipped)`);
                    continue;
                }

                const ptype = parseInt(block_match[2], 10);
                // Update the appropriate default field based on type
                if (ptype === 1) {
                    // Float
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultFloat:\\s*)([\\d.e+-]+)`);
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${param_name} default -> ${val} (float)`);
                } else if (ptype === 3) {
                    // Int
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultInt:\\s*)(\\d+)`);
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${param_name} default -> ${val} (int)`);
                } else if (ptype === 4) {
                    // Bool
                    const bool_val = val === 'true' || val === '1' ? '1' : '0';
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultBool:\\s*)(\\d+)`);
                    content = content.replace(re, `$1${bool_val}`);
                    changes.push(`${param_name} default -> ${bool_val} (bool)`);
                } else {
                    changes.push(`${param_name}: trigger parameters have no default value (skipped)`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --add-parameter, --remove-parameter, or --set-default' }, null, 2));
                process.exit(1);
            }

            // Restore original line endings
            if (had_crlf) content = content.replace(/\n/g, '\r\n');
            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    // ========== Sibling ordering ==========
    cmd.command('sibling-index <file> <object_name> <index>')
        .description('Set the sibling index of a GameObject, renumbering all siblings')
        .option('-j, --json', 'Output as JSON')
        .action((file, object_name, index_str, _options) => {
            const target_index = parseInt(index_str, 10);
            if (!Number.isFinite(target_index) || target_index < 0) {
                console.log(JSON.stringify({ success: false, error: 'Index must be a non-negative integer' }, null, 2));
                process.exitCode = 1;
                return;
            }

            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            try {
                const doc = UnityDocument.from_file(file);
                const result = doc.require_unique_transform(object_name);
                if ('error' in result) {
                    console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const target_transform = result;

                // Get the parent fileID
                const father_val = target_transform.get_property('m_Father');
                if (!father_val) {
                    console.log(JSON.stringify({ success: false, error: 'Cannot determine parent Transform' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const father_match = father_val.match(/fileID:\s*(-?\d+)/);
                const father_id = father_match ? father_match[1] : '0';

                // Find all sibling Transforms (same m_Father)
                const all_transforms = doc.find_by_class_id(4);
                const siblings = all_transforms.filter(t => {
                    const f = t.get_property('m_Father');
                    if (!f) return false;
                    const m = f.match(/fileID:\s*(-?\d+)/);
                    return m && m[1] === father_id;
                });

                // Sort by current m_RootOrder
                siblings.sort((a, b) => {
                    const ao = parseInt(a.get_property('m_RootOrder') || '0', 10);
                    const bo = parseInt(b.get_property('m_RootOrder') || '0', 10);
                    return ao - bo;
                });

                // Remove target from current position
                const current_idx = siblings.findIndex(s => s.file_id === target_transform.file_id);
                if (current_idx < 0) {
                    console.log(JSON.stringify({ success: false, error: 'Target not found among siblings' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                siblings.splice(current_idx, 1);

                // Insert at new position (clamped)
                const clamped = Math.min(target_index, siblings.length);
                siblings.splice(clamped, 0, target_transform);

                // Renumber all siblings (update_root_order_in_block handles insert when m_RootOrder is missing)
                for (let i = 0; i < siblings.length; i++) {
                    const updated = update_root_order_in_block(siblings[i].raw, i);
                    siblings[i].replace_raw(updated);
                }

                // Reorder the actual data structures so readers see the new order
                const ordered_ids = siblings.map(s => s.file_id);
                if (father_id !== '0') {
                    // Non-root siblings: rewrite parent's m_Children array
                    doc.reorder_children(father_id, ordered_ids);
                }
                // Physical block order determines flat list order in read output
                doc.reorder_entities(ordered_ids);

                const save_result = doc.save();
                if (!save_result.success) {
                    console.log(JSON.stringify({ success: false, error: save_result.error ?? 'Failed to save file' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                console.log(JSON.stringify({
                    success: true,
                    file,
                    object: object_name,
                    new_index: clamped,
                    sibling_count: siblings.length,
                }, null, 2));
            } catch (err: unknown) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    // ========== Input Actions editing ==========
    cmd.command('input-actions <file>')
        .description('Edit a Unity Input Actions file (.inputactions)')
        .option('--add-map <name>', 'Add a new action map')
        .option('--remove-map <name>', 'Remove an action map')
        .option('--add-action <map:name>', 'Add an action to a map (format: MapName:ActionName)')
        .option('--remove-action <map:name>', 'Remove an action from a map (format: MapName:ActionName)')
        .option('--add-binding <map:action:path>', 'Add a binding (format: MapName:ActionName:<Path>/control)')
        .option('--remove-binding <map:action:path>', 'Remove a binding (format: MapName:ActionName:<Path>/control)')
        .option('--add-control-scheme <name:group>', 'Add a control scheme (format: Name:BindingGroup)')
        .option('--remove-control-scheme <name>', 'Remove a control scheme')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            let data = load_input_actions(file);
            if ('error' in data) {
                console.log(JSON.stringify({ success: false, error: data.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            let ia = data as InputActionsFile;
            const changes: string[] = [];

            if (options.addMap !== undefined) {
                const result = add_map(ia, options.addMap as string);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`added map "${options.addMap}"`);
            }
            if (options.removeMap) {
                const result = remove_map(ia, options.removeMap as string);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`removed map "${options.removeMap}"`);
            }
            if (options.addAction) {
                const parts = (options.addAction as string).split(':');
                if (parts.length < 2) { console.log(JSON.stringify({ success: false, error: 'Invalid --add-action format. Use MapName:ActionName' }, null, 2)); process.exitCode = 1; return; }
                const result = add_action(ia, parts[0], parts[1]);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`added action "${parts[1]}" to map "${parts[0]}"`);
            }
            if (options.removeAction) {
                const parts = (options.removeAction as string).split(':');
                if (parts.length < 2) { console.log(JSON.stringify({ success: false, error: 'Invalid --remove-action format. Use MapName:ActionName' }, null, 2)); process.exitCode = 1; return; }
                const result = remove_action(ia, parts[0], parts[1]);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`removed action "${parts[1]}" from map "${parts[0]}"`);
            }
            if (options.addBinding) {
                const parts = (options.addBinding as string).split(':');
                if (parts.length < 3) { console.log(JSON.stringify({ success: false, error: 'Invalid --add-binding format. Use MapName:ActionName:BindingPath' }, null, 2)); process.exitCode = 1; return; }
                const binding_path = parts.slice(2).join(':');
                const result = add_binding(ia, parts[0], parts[1], binding_path);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`added binding "${binding_path}" to "${parts[1]}"`);
            }
            if (options.removeBinding) {
                const parts = (options.removeBinding as string).split(':');
                if (parts.length < 3) { console.log(JSON.stringify({ success: false, error: 'Invalid --remove-binding format. Use MapName:ActionName:BindingPath' }, null, 2)); process.exitCode = 1; return; }
                const binding_path = parts.slice(2).join(':');
                const result = remove_binding(ia, parts[0], parts[1], binding_path);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`removed binding "${binding_path}" from "${parts[1]}"`);
            }
            if (options.addControlScheme) {
                const parts = (options.addControlScheme as string).split(':');
                if (parts.length < 2) { console.log(JSON.stringify({ success: false, error: 'Invalid --add-control-scheme format. Use Name:BindingGroup' }, null, 2)); process.exitCode = 1; return; }
                ia = add_control_scheme(ia, parts[0], parts[1]);
                changes.push(`added control scheme "${parts[0]}"`);
            }
            if (options.removeControlScheme) {
                const result = remove_control_scheme(ia, options.removeControlScheme as string);
                if ('error' in result) { console.log(JSON.stringify({ success: false, error: result.error }, null, 2)); process.exitCode = 1; return; }
                ia = result;
                changes.push(`removed control scheme "${options.removeControlScheme}"`);
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified.' }, null, 2));
                process.exitCode = 1;
                return;
            }

            save_input_actions(file, ia);
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    // ========== Animation curve authoring ==========
    // Extend existing 'animation' command options are handled by inserting new option processing
    // into the existing animation command above. Instead, we add curve operations as part of
    // the existing animation command. Since we can't modify the already-registered command,
    // we add a separate 'animation-curves' command.
    cmd.command('animation-curves <file>')
        .description('Add, remove, or modify animation curves in an .anim file')
        .option('--add-curve <json>', 'Add a curve (JSON: {"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]})')
        .option('--remove-curve <spec>', 'Remove a curve by path:attribute (e.g., Body/Mesh:m_Alpha)')
        .option('--set-keyframes <json>', 'Replace keyframes (JSON: {"curve":"path:attribute","keyframes":[{"time":0,"value":10}]})')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            // Bug 7: Validate file is an .anim file
            if (!file.endsWith('.anim')) {
                console.log(JSON.stringify({ success: false, error: `File is not an AnimationClip (.anim): ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            let content = readFileSync(file, 'utf-8');
            const had_crlf = content.includes('\r\n');
            if (had_crlf) content = content.replace(/\r\n/g, '\n');
            const changes: string[] = [];

            // Curve type -> YAML section mapping
            const CURVE_SECTIONS: Record<string, string> = {
                float: 'm_FloatCurves',
                position: 'm_PositionCurves',
                rotation: 'm_RotationCurves',
                scale: 'm_ScaleCurves',
                euler: 'm_EulerCurves',
            };

            /** Check if a curve with the given path+attribute already exists in the file. */
            function curve_exists(content: string, target_path: string, target_attr: string): boolean {
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === '- curve:') {
                        let cp = '', ca = '';
                        for (let j = i + 1; j < lines.length; j++) {
                            const t = lines[j].trimStart();
                            if (t.startsWith('- curve:') || /^  m_\w+:/.test(lines[j])) break;
                            if (t.startsWith('path:')) cp = t.slice('path:'.length).trim();
                            if (t.startsWith('attribute:')) ca = t.slice('attribute:'.length).trim();
                        }
                        if (cp === target_path && ca === target_attr) return true;
                    }
                }
                return false;
            }

            /** Validate that all keyframe time/value fields are finite numbers. */
            function validate_keyframes(keyframes: { time: unknown; value: unknown; inSlope?: unknown; outSlope?: unknown }[]): string | null {
                for (let i = 0; i < keyframes.length; i++) {
                    const kf = keyframes[i];
                    if (typeof kf.time !== 'number' || !Number.isFinite(kf.time)) {
                        return `Keyframe[${i}].time must be a finite number, got ${JSON.stringify(kf.time)}`;
                    }
                    if (typeof kf.value !== 'number' || !Number.isFinite(kf.value)) {
                        return `Keyframe[${i}].value must be a finite number, got ${JSON.stringify(kf.value)}`;
                    }
                    if (kf.inSlope !== undefined && (typeof kf.inSlope !== 'number' || !Number.isFinite(kf.inSlope))) {
                        return `Keyframe[${i}].inSlope must be a finite number, got ${JSON.stringify(kf.inSlope)}`;
                    }
                    if (kf.outSlope !== undefined && (typeof kf.outSlope !== 'number' || !Number.isFinite(kf.outSlope))) {
                        return `Keyframe[${i}].outSlope must be a finite number, got ${JSON.stringify(kf.outSlope)}`;
                    }
                }
                return null;
            }

            // --add-curve
            if (options.addCurve) {
                let spec: { type?: string; path?: string; attribute?: string; classID?: number; keyframes?: { time: number; value: number; inSlope?: number; outSlope?: number }[] };
                try {
                    spec = JSON.parse(options.addCurve as string);
                } catch {
                    console.log(JSON.stringify({ success: false, error: 'Invalid JSON for --add-curve' }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                // Validate required fields (path can be empty string for root transforms)
                const missing: string[] = [];
                if (!spec.type) missing.push('type');
                if (spec.path === undefined || spec.path === null) missing.push('path');
                if (!spec.attribute) missing.push('attribute');
                if (spec.classID === undefined) missing.push('classID');
                if (!spec.keyframes || !Array.isArray(spec.keyframes) || spec.keyframes.length === 0) missing.push('keyframes');
                if (missing.length > 0) {
                    console.log(JSON.stringify({ success: false, error: `Missing required field(s): ${missing.join(', ')}. Required: type, path, attribute, classID, keyframes` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const kf_error = validate_keyframes(spec.keyframes!);
                if (kf_error) {
                    console.log(JSON.stringify({ success: false, error: kf_error }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const section = CURVE_SECTIONS[spec.type!];
                if (!section) {
                    console.log(JSON.stringify({ success: false, error: `Unknown curve type "${spec.type}". Valid: ${Object.keys(CURVE_SECTIONS).join(', ')}` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                // Bug 4: Duplicate guard
                if (curve_exists(content, spec.path!, spec.attribute!)) {
                    console.log(JSON.stringify({ success: false, error: `Curve "${spec.path}:${spec.attribute}" already exists. Use --remove-curve first or --set-keyframes to modify.` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                // Build keyframe YAML
                const kf_lines = spec.keyframes!.map(kf => [
                    `      - serializedVersion: 3`,
                    `        time: ${kf.time}`,
                    `        value: ${kf.value}`,
                    `        inSlope: ${kf.inSlope ?? 0}`,
                    `        outSlope: ${kf.outSlope ?? 0}`,
                    `        tangentMode: 0`,
                    `        weightedMode: 0`,
                    `        inWeight: 0.333`,
                    `        outWeight: 0.333`,
                ].join('\n')).join('\n');

                const curve_yaml = [
                    `  - curve:`,
                    `      serializedVersion: 2`,
                    `      m_Curve:`,
                    kf_lines,
                    `      m_PreInfinity: 2`,
                    `      m_PostInfinity: 2`,
                    `      m_RotationOrder: 4`,
                    `    path: ${spec.path}`,
                    `    attribute: ${spec.attribute}`,
                    `    classID: ${spec.classID}`,
                    `    script: {fileID: 0}`,
                    `    flags: 0`,
                ].join('\n');

                // Find section and insert
                const empty_re = new RegExp(`(  ${section}:) \\[\\]`);
                if (empty_re.test(content)) {
                    content = content.replace(empty_re, `$1\n${curve_yaml}`);
                    changes.push(`added ${spec.type} curve: ${spec.path}:${spec.attribute}`);
                } else {
                    // Find end of section (next m_ field at indent 2)
                    const section_re = new RegExp(`^  ${section}:`, 'm');
                    const section_match = section_re.exec(content);
                    if (section_match) {
                        const lines = content.split('\n');
                        const section_line_idx = lines.findIndex(l => l.match(new RegExp(`^  ${section}:`)));
                        let insert_idx = lines.length;
                        for (let i = section_line_idx + 1; i < lines.length; i++) {
                            const t = lines[i];
                            if (/^  m_\w+:/.test(t)) {
                                insert_idx = i;
                                break;
                            }
                        }
                        lines.splice(insert_idx, 0, curve_yaml);
                        content = lines.join('\n');
                        changes.push(`added ${spec.type} curve: ${spec.path}:${spec.attribute}`);
                    }
                }
            }

            // --remove-curve
            if (options.removeCurve) {
                const spec_str = options.removeCurve as string;
                const colon_idx = spec_str.lastIndexOf(':');
                if (colon_idx < 0) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --remove-curve format. Use path:attribute (e.g., Body/Mesh:m_Alpha)' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const target_path = spec_str.slice(0, colon_idx);
                const target_attr = spec_str.slice(colon_idx + 1);

                const lines = content.split('\n');
                let found = false;

                // Find the curve entry matching path and attribute
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === '- curve:') {
                        // Scan forward for path and attribute
                        let curve_start = i;
                        let curve_end = lines.length;
                        let curve_path = '';
                        let curve_attr = '';

                        for (let j = i + 1; j < lines.length; j++) {
                            const t = lines[j].trimStart();
                            if (t.startsWith('- curve:') || /^  m_\w+:/.test(lines[j])) {
                                curve_end = j;
                                break;
                            }
                            if (t.startsWith('path:')) curve_path = t.slice('path:'.length).trim();
                            if (t.startsWith('attribute:')) curve_attr = t.slice('attribute:'.length).trim();
                        }

                        if (curve_path === target_path && curve_attr === target_attr) {
                            lines.splice(curve_start, curve_end - curve_start);
                            found = true;
                            changes.push(`removed curve: ${target_path}:${target_attr}`);
                            break;
                        }
                    }
                }

                // Bug 6: Specific error when curve not found
                if (!found) {
                    console.log(JSON.stringify({ success: false, error: `Curve "${target_path}:${target_attr}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                content = lines.join('\n');
                // Check if section is now empty and restore []
                for (const [, section_name] of Object.entries(CURVE_SECTIONS)) {
                    const section_re = new RegExp(`^(  ${section_name}:)\\s*$`, 'm');
                    const match = content.match(section_re);
                    if (match) {
                        // Check if next non-empty line is another section
                        const after = content.slice(content.indexOf(match[0]) + match[0].length);
                        const next_line = after.split('\n').find(l => l.trim() !== '');
                        if (next_line && /^  m_\w+:/.test(next_line)) {
                            content = content.replace(section_re, `$1 []`);
                        }
                    }
                }
            }

            // --set-keyframes (Bug 3: single JSON object to avoid Commander.js arg splitting)
            if (options.setKeyframes) {
                const raw_val = options.setKeyframes as string;
                let parsed: { curve?: string; keyframes?: { time: number; value: number; inSlope?: number; outSlope?: number }[] };
                try {
                    parsed = JSON.parse(raw_val);
                } catch {
                    console.log(JSON.stringify({ success: false, error: 'Invalid JSON for --set-keyframes. Use: {"curve":"path:attribute","keyframes":[{"time":0,"value":10}]}' }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                if (!parsed.curve || !parsed.keyframes || !Array.isArray(parsed.keyframes) || parsed.keyframes.length === 0) {
                    console.log(JSON.stringify({ success: false, error: 'Missing required fields. --set-keyframes needs: {"curve":"path:attribute","keyframes":[...]}' }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const sk_kf_error = validate_keyframes(parsed.keyframes);
                if (sk_kf_error) {
                    console.log(JSON.stringify({ success: false, error: sk_kf_error }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const colon_idx = parsed.curve.lastIndexOf(':');
                if (colon_idx < 0) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid curve spec. "curve" must be "path:attribute"' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const target_path = parsed.curve.slice(0, colon_idx);
                const target_attr = parsed.curve.slice(colon_idx + 1);
                const keyframes = parsed.keyframes;

                const lines = content.split('\n');
                let sk_found = false;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === '- curve:') {
                        let curve_path = '';
                        let curve_attr = '';
                        let m_curve_start = -1;
                        let m_pre_infinity_line = -1;

                        for (let j = i + 1; j < lines.length; j++) {
                            const t = lines[j].trimStart();
                            if (t.startsWith('- curve:') || /^  m_\w+:/.test(lines[j])) {
                                break;
                            }
                            if (t.startsWith('path:')) curve_path = t.slice('path:'.length).trim();
                            if (t.startsWith('attribute:')) curve_attr = t.slice('attribute:'.length).trim();
                            if (t.startsWith('m_Curve:')) m_curve_start = j;
                            if (t.startsWith('m_PreInfinity:')) m_pre_infinity_line = j;
                        }

                        if (curve_path === target_path && curve_attr === target_attr && m_curve_start >= 0 && m_pre_infinity_line >= 0) {
                            // Replace keyframes between m_Curve: and m_PreInfinity:
                            const new_kf_lines = keyframes.map(kf => [
                                `      - serializedVersion: 3`,
                                `        time: ${kf.time}`,
                                `        value: ${kf.value}`,
                                `        inSlope: ${kf.inSlope ?? 0}`,
                                `        outSlope: ${kf.outSlope ?? 0}`,
                                `        tangentMode: 0`,
                                `        weightedMode: 0`,
                                `        inWeight: 0.333`,
                                `        outWeight: 0.333`,
                            ].join('\n')).join('\n');

                            lines.splice(m_curve_start + 1, m_pre_infinity_line - m_curve_start - 1, new_kf_lines);
                            changes.push(`set keyframes on ${target_path}:${target_attr}`);
                            sk_found = true;
                            break;
                        }
                    }
                }

                if (!sk_found) {
                    console.log(JSON.stringify({ success: false, error: `Curve "${target_path}:${target_attr}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                content = lines.join('\n');
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --add-curve, --remove-curve, or --set-keyframes' }, null, 2));
                process.exitCode = 1;
                return;
            }

            if (had_crlf) content = content.replace(/\n/g, '\r\n');
            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    // ========== Animator state/transition authoring ==========
    // Extend the existing 'animator' command with state/transition operations
    // Since we can't modify the already-registered command, we add 'animator-state' command
    cmd.command('animator-state <file>')
        .description('Add/remove states and transitions in an AnimatorController')
        .option('--add-state <name>', 'Add a new AnimatorState')
        .option('--motion <guid-or-path>', 'Motion clip GUID or file path (companion to --add-state)')
        .option('--layer <name>', 'Target layer name (default: first layer)')
        .option('--speed <n>', 'State speed (companion to --add-state, default: 1)')
        .option('--remove-state <name>', 'Remove a state and all its transitions')
        .option('--add-transition <src:dst>', 'Add a transition (use "any" for AnyState source)')
        .option('--condition <param,mode,threshold>', 'Transition condition (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--has-exit-time', 'Enable exit time on transition')
        .option('--exit-time <n>', 'Exit time value (default: 0.75)')
        .option('--duration <n>', 'Transition duration (default: 0.25)')
        .option('--remove-transition <src:dst>', 'Remove a transition by source:destination state names')
        .option('--set-default-state <name>', 'Set the default state in the state machine')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            let content = readFileSync(file, 'utf-8');
            const had_crlf = content.includes('\r\n');
            if (had_crlf) content = content.replace(/\r\n/g, '\n');
            const changes: string[] = [];
            const existing_ids = collect_file_ids(content);

            // Locate controller block
            const blocks = split_yaml_blocks(content);
            const controller_block = blocks.find(b => b.class_id === 91);
            if (!controller_block) {
                console.log(JSON.stringify({ success: false, error: 'No AnimatorController block found (class_id 91)' }, null, 2));
                process.exitCode = 1;
                return;
            }

            const sm = find_state_machine_for_layer(blocks, controller_block, options.layer as string | undefined);
            if (!sm) {
                console.log(JSON.stringify({ success: false, error: 'No state machine found for the specified layer' }, null, 2));
                process.exitCode = 1;
                return;
            }

            // --add-state
            if (options.addState) {
                const state_name = options.addState as string;

                // Bug 8: Duplicate guard
                if (find_state_by_name(blocks, state_name)) {
                    console.log(JSON.stringify({ success: false, error: `State "${state_name}" already exists` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const speed = parseFloat(options.speed as string || '1');
                let motion_guid = options.motion as string || '';
                if (motion_guid && !/^[a-f0-9]{32}$/.test(motion_guid)) {
                    const meta_path = motion_guid.endsWith('.meta') ? motion_guid : `${motion_guid}.meta`;
                    const resolved = extractGuidFromMeta(meta_path);
                    if (!resolved) {
                        console.log(JSON.stringify({ success: false, error: `Cannot resolve motion GUID: no valid .meta file at "${meta_path}"` }, null, 2));
                        process.exitCode = 1;
                        return;
                    }
                    motion_guid = resolved;
                }

                const state_id = generate_file_id(existing_ids);
                existing_ids.add(state_id);

                const motion_ref = motion_guid
                    ? `{fileID: 2100000, guid: ${motion_guid}, type: 2}`
                    : '{fileID: 0}';

                const state_block = `--- !u!1102 &${state_id}
AnimatorState:
  serializedVersion: 6
  m_ObjectHideFlags: 1
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${state_name}
  m_Transitions: []
  m_StateMachineBehaviours: []
  m_Position: {x: 50, y: 50, z: 0}
  m_IKOnFeet: 0
  m_WriteDefaultValues: 1
  m_Mirror: 0
  m_SpeedParameterActive: 0
  m_MirrorParameterActive: 0
  m_CycleOffsetParameterActive: 0
  m_TimeParameterActive: 0
  m_Motion: ${motion_ref}
  m_Tag:
  m_SpeedParameter:
  m_MirrorParameter:
  m_CycleOffsetParameter:
  m_TimeParameter:
  m_Speed: ${speed}
`;

                // Append state block to file
                content = content.trimEnd() + '\n' + state_block;

                // Add m_ChildStates entry to state machine
                const child_entry = `  - serializedVersion: 1\n    m_State: {fileID: ${state_id}}\n    m_Position: {x: 200, y: 0, z: 0}`;
                const empty_children_re = new RegExp(`(--- !u!1107 &${sm.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?m_ChildStates:) \\[\\]`);
                if (empty_children_re.test(content)) {
                    content = content.replace(empty_children_re, `$1\n${child_entry}`);
                } else {
                    // Append before m_ChildStateMachines
                    const before_machines_re = new RegExp(`(--- !u!1107 &${sm.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)(  m_ChildStateMachines:)`);
                    content = content.replace(before_machines_re, `$1${child_entry}\n$2`);
                }

                changes.push(`added state "${state_name}" (fileID: ${state_id})`);
            }

            // --remove-state
            if (options.removeState) {
                const state_name = options.removeState as string;
                // Re-parse since content may have changed
                const curr_blocks = split_yaml_blocks(content);
                const target = find_state_by_name(curr_blocks, state_name);
                if (!target) {
                    console.log(JSON.stringify({ success: false, error: `State "${state_name}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const ids_to_remove = new Set<string>([target.file_id]);

                // Find all transitions referencing this state (as source or destination)
                const transition_blocks = curr_blocks.filter(b => b.class_id === 1101);
                for (const tb of transition_blocks) {
                    const dst_line = tb.raw.split(/\r?\n/).find(l => l.trimStart().startsWith('m_DstState:'));
                    const dst_ref = dst_line ? parse_inline_ref(dst_line) : null;
                    if (dst_ref && dst_ref.fileID === target.file_id) {
                        ids_to_remove.add(tb.file_id);
                    }
                }

                // Also remove transitions that are in the state's m_Transitions
                const trans_re = /m_Transitions:[\s\S]*?(?=\s*m_StateMachineBehaviours:)/;
                const trans_match = target.raw.match(trans_re);
                if (trans_match) {
                    const ref_matches = trans_match[0].matchAll(/fileID:\s*(-?\d+)/g);
                    for (const rm of ref_matches) {
                        if (rm[1] !== '0') ids_to_remove.add(rm[1]);
                    }
                }

                // Remove blocks
                for (const id of ids_to_remove) {
                    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const block_re = new RegExp(`--- !u!\\d+ &${escaped}\\n[\\s\\S]*?(?=--- !u!|$)`);
                    content = content.replace(block_re, '');
                }

                // Remove m_ChildStates entry from state machine
                const child_state_re = new RegExp(`  - serializedVersion: 1\\n    m_State: \\{fileID: ${target.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\n    m_Position: \\{[^}]+\\}\\n?`, 'g');
                content = content.replace(child_state_re, '');

                // Remove from m_AnyStateTransitions if present
                for (const id of ids_to_remove) {
                    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const any_trans_line_re = new RegExp(`\\n?\\s*- \\{fileID: ${escaped}\\}`, 'g');
                    content = content.replace(any_trans_line_re, '');
                }

                // Clean up empty arrays that might have been created
                content = content.replace(/m_ChildStates:\s*\n(  m_ChildStateMachines:)/g, 'm_ChildStates: []\n$1');
                content = content.replace(/m_AnyStateTransitions:\s*\n(  m_EntryTransitions:)/g, 'm_AnyStateTransitions: []\n$1');

                changes.push(`removed state "${state_name}" and ${ids_to_remove.size - 1} related transitions`);
            }

            // --add-transition
            if (options.addTransition) {
                const parts = (options.addTransition as string).split(':');
                if (parts.length < 2) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --add-transition format. Use source:destination' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                // Strip layer prefix (e.g., "Base Layer.Idle" -> "Idle")
                const src_name = parts[0].includes('.') ? parts[0].split('.').pop()! : parts[0];
                const dst_name = parts[1].includes('.') ? parts[1].split('.').pop()! : parts[1];
                const is_any = src_name.toLowerCase() === 'any';

                // Re-parse blocks
                const curr_blocks = split_yaml_blocks(content);

                const dst_state = find_state_by_name(curr_blocks, dst_name);
                if (!dst_state) {
                    console.log(JSON.stringify({ success: false, error: `Destination state "${dst_name}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                let src_state: AnimatorBlock | null = null;
                if (!is_any) {
                    src_state = find_state_by_name(curr_blocks, src_name);
                    if (!src_state) {
                        console.log(JSON.stringify({ success: false, error: `Source state "${src_name}" not found` }, null, 2));
                        process.exitCode = 1;
                        return;
                    }
                }

                const trans_id = generate_file_id(existing_ids);
                existing_ids.add(trans_id);

                const duration = parseFloat(options.duration as string || '0.25');
                const exit_time = parseFloat(options.exitTime as string || '0.75');
                const has_exit_time = options.hasExitTime ? 1 : 0;

                // Build conditions
                let conditions_yaml = '[]';
                const conds = options.condition as string[] | undefined;
                if (conds && conds.length > 0) {
                    // Extract parameter names from controller block for validation
                    const param_names: string[] = [];
                    const ctrl_lines = controller_block.raw.split('\n');
                    for (let pi = 0; pi < ctrl_lines.length; pi++) {
                        const pm = ctrl_lines[pi].match(/^\s+-\s+m_Name:\s*(.+)/);
                        if (pm && pi > 0 && ctrl_lines.slice(0, pi).some(l => l.includes('m_AnimatorParameters'))) {
                            // Only capture names under m_AnimatorParameters, stop at m_AnimatorLayers
                            const before = ctrl_lines.slice(0, pi + 1).join('\n');
                            if (before.includes('m_AnimatorParameters') && !before.split('m_AnimatorParameters')[1].includes('m_AnimatorLayers')) {
                                param_names.push(pm[1].trim());
                            }
                        }
                    }

                    for (const c of conds) {
                        const param_name = c.split(',')[0];
                        if (param_names.length > 0 && !param_names.includes(param_name)) {
                            console.log(JSON.stringify({ success: false, error: `Parameter "${param_name}" not found in controller. Available: ${param_names.join(', ')}` }, null, 2));
                            process.exitCode = 1;
                            return;
                        }
                    }

                    const cond_entries = conds.map(c => {
                        const cp = c.split(',');
                        if (cp.length < 2) return null;
                        const COND_MODES: Record<string, number> = { if: 1, ifnot: 2, greater: 3, less: 4, equals: 6, notequal: 7 };
                        const mode = COND_MODES[cp[1].toLowerCase()] ?? parseInt(cp[1], 10);
                        const threshold = cp[2] ? parseFloat(cp[2]) : 0;
                        return `  - m_ConditionMode: ${mode}\n    m_ConditionEvent: ${cp[0]}\n    m_EventTreshold: ${threshold}`;
                    }).filter(Boolean);

                    if (cond_entries.length > 0) {
                        conditions_yaml = `\n${cond_entries.join('\n')}`;
                    }
                }

                const trans_block = `--- !u!1101 &${trans_id}
AnimatorStateTransition:
  m_ObjectHideFlags: 1
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name:
  m_Conditions: ${conditions_yaml}
  m_DstStateMachine: {fileID: 0}
  m_DstState: {fileID: ${dst_state.file_id}}
  m_Solo: 0
  m_Mute: 0
  m_IsExit: 0
  serializedVersion: 3
  m_TransitionDuration: ${duration}
  m_TransitionOffset: 0
  m_ExitTime: ${exit_time}
  m_HasExitTime: ${has_exit_time}
  m_HasFixedDuration: 1
  m_InterruptionSource: 0
  m_OrderedInterruption: 1
  m_CanTransitionToSelf: 1
`;

                content = content.trimEnd() + '\n' + trans_block;

                // Add transition reference
                if (is_any) {
                    // Add to m_AnyStateTransitions in the state machine
                    const curr_sm = find_state_machine_for_layer(split_yaml_blocks(content), controller_block, options.layer as string | undefined);
                    if (curr_sm) {
                        const escaped_sm_id = curr_sm.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const empty_any_re = new RegExp(`(--- !u!1107 &${escaped_sm_id}[\\s\\S]*?m_AnyStateTransitions:) \\[\\]`);
                        if (empty_any_re.test(content)) {
                            content = content.replace(empty_any_re, `$1\n  - {fileID: ${trans_id}}`);
                        } else {
                            const any_before_entry_re = new RegExp(`(--- !u!1107 &${escaped_sm_id}[\\s\\S]*?m_AnyStateTransitions:[\\s\\S]*?)(  m_EntryTransitions:)`);
                            content = content.replace(any_before_entry_re, `$1  - {fileID: ${trans_id}}\n$2`);
                        }
                    }
                } else if (src_state) {
                    // Add to source state's m_Transitions
                    const escaped_src_id = src_state.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    // Normalize bare null "m_Transitions:" (no [] and no list items) to "m_Transitions: []"
                    const bare_null_re = new RegExp(`(--- !u!1102 &${escaped_src_id}[\\s\\S]*?m_Transitions:)[ \\t]*\\n(  m_StateMachineBehaviours:)`);
                    if (bare_null_re.test(content)) {
                        content = content.replace(bare_null_re, `$1 []\n$2`);
                    }

                    const empty_trans_re = new RegExp(`(--- !u!1102 &${escaped_src_id}[\\s\\S]*?m_Transitions:) \\[\\]`);
                    if (empty_trans_re.test(content)) {
                        content = content.replace(empty_trans_re, `$1\n  - {fileID: ${trans_id}}`);
                    } else {
                        const trans_before_behaviours_re = new RegExp(`(--- !u!1102 &${escaped_src_id}[\\s\\S]*?m_Transitions:[\\s\\S]*?)(  m_StateMachineBehaviours:)`);
                        content = content.replace(trans_before_behaviours_re, `$1  - {fileID: ${trans_id}}\n$2`);
                    }
                }

                changes.push(`added transition ${src_name} -> ${dst_name} (fileID: ${trans_id})`);
            }

            // --remove-transition
            if (options.removeTransition) {
                const parts = (options.removeTransition as string).split(':');
                if (parts.length < 2) {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --remove-transition format. Use source:destination' }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                // Strip layer prefix (e.g., "Base Layer.Idle" -> "Idle")
                const src_name = parts[0].includes('.') ? parts[0].split('.').pop()! : parts[0];
                const dst_name = parts[1].includes('.') ? parts[1].split('.').pop()! : parts[1];
                const is_any = src_name.toLowerCase() === 'any';

                const curr_blocks = split_yaml_blocks(content);
                const dst_state = find_state_by_name(curr_blocks, dst_name);
                if (!dst_state) {
                    console.log(JSON.stringify({ success: false, error: `Destination state "${dst_name}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                // Find transition blocks pointing to destination
                const transition_blocks = curr_blocks.filter(b => b.class_id === 1101);
                const to_remove: string[] = [];

                for (const tb of transition_blocks) {
                    const dst_line = tb.raw.split(/\r?\n/).find(l => l.trimStart().startsWith('m_DstState:'));
                    const dst_ref = dst_line ? parse_inline_ref(dst_line) : null;
                    if (dst_ref && dst_ref.fileID === dst_state.file_id) {
                        if (is_any) {
                            // Check if this transition is referenced in m_AnyStateTransitions
                            const curr_sm = find_state_machine_for_layer(curr_blocks, controller_block, options.layer as string | undefined);
                            if (curr_sm && curr_sm.raw.includes(`fileID: ${tb.file_id}`)) {
                                to_remove.push(tb.file_id);
                            }
                        } else {
                            const src_state = find_state_by_name(curr_blocks, src_name);
                            if (src_state && src_state.raw.includes(`fileID: ${tb.file_id}`)) {
                                to_remove.push(tb.file_id);
                            }
                        }
                    }
                }

                if (to_remove.length === 0) {
                    console.log(JSON.stringify({ success: false, error: `No transition found from "${src_name}" to "${dst_name}"` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                for (const id of to_remove) {
                    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Remove the block
                    const block_re = new RegExp(`--- !u!1101 &${escaped}\\n[\\s\\S]*?(?=--- !u!|$)`);
                    content = content.replace(block_re, '');
                    // Remove references
                    const ref_re = new RegExp(`\\n?\\s*- \\{fileID: ${escaped}\\}`, 'g');
                    content = content.replace(ref_re, '');
                }

                // Restore empty arrays
                content = content.replace(/m_Transitions:\s*\n(  m_StateMachineBehaviours:)/g, 'm_Transitions: []\n$1');
                content = content.replace(/m_AnyStateTransitions:\s*\n(  m_EntryTransitions:)/g, 'm_AnyStateTransitions: []\n$1');

                changes.push(`removed ${to_remove.length} transition(s) ${src_name} -> ${dst_name}`);
            }

            // --set-default-state
            if (options.setDefaultState) {
                const state_name = options.setDefaultState as string;
                const curr_blocks = split_yaml_blocks(content);
                const target = find_state_by_name(curr_blocks, state_name);
                if (!target) {
                    console.log(JSON.stringify({ success: false, error: `State "${state_name}" not found` }, null, 2));
                    process.exitCode = 1;
                    return;
                }

                const curr_sm = find_state_machine_for_layer(curr_blocks, controller_block, options.layer as string | undefined);
                if (curr_sm) {
                    const escaped_sm_id = curr_sm.file_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const default_re = new RegExp(`(--- !u!1107 &${escaped_sm_id}[\\s\\S]*?m_DefaultState: )\\{fileID: -?\\d+\\}`);
                    content = content.replace(default_re, `$1{fileID: ${target.file_id}}`);
                    changes.push(`set default state to "${state_name}"`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified.' }, null, 2));
                process.exitCode = 1;
                return;
            }

            if (had_crlf) content = content.replace(/\n/g, '\r\n');
            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    cmd.addCommand(prefab_cmd);

    return cmd;
}
