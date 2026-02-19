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
        .description('Batch edit multiple GameObject properties in a single file operation. JSON format: [{"object_name":"...","property":"...","value":"..."}]')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let raw_edits: Array<{ object_name: string; property: string; new_value?: string; value?: string }>;
            try {
                raw_edits = JSON.parse(edits_json);
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
            // Validate no missing values (allow falsy values like false, 0, "")
            for (const edit of edits) {
                if (edit.new_value === undefined || edit.new_value === null) {
                    console.log(JSON.stringify({ success: false, error: `Missing "value" for ${edit.object_name}.${edit.property}. JSON format: [{"object_name":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
            }
            const result = batchEditProperties(file, edits);
            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('batch-components <file> <edits_json>')
        .description('Batch edit multiple component properties by fileID in a single operation. JSON format: [{"file_id":"...","property":"...","value":"..."}]')
        .option('-j, --json', 'Output as JSON')
        .action((file, edits_json, _options) => {
            let raw_edits: Array<{ file_id: string; property: string; new_value?: string; value?: string }>;
            try {
                raw_edits = JSON.parse(edits_json);
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
            // Validate no missing values (allow falsy values like false, 0, "")
            for (const edit of edits) {
                if (edit.new_value === undefined || edit.new_value === null) {
                    console.log(JSON.stringify({ success: false, error: `Missing "value" for component ${edit.file_id}.${edit.property}. JSON format: [{"file_id":"...","property":"...","value":"..."}]` }, null, 2));
                    process.exit(1);
                }
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
                content = content.replace(
                    /(m_Shader:\s*\{[^}]*guid:\s*)[a-f0-9]+/,
                    `$1${guid}`
                );
                changes.push(`shader -> ${guid}`);
            }

            // --set: float properties in m_Floats section
            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                const re = new RegExp(`(- ${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*)[\\d.e+-]+`);
                if (re.test(content)) {
                    content = content.replace(re, `$1${val}`);
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
            for (const kw of (options.keywordAdd as string[])) {
                const kw_re = /m_ShaderKeywords:\s*(.*)/;
                const m = kw_re.exec(content);
                if (m) {
                    const existing = m[1].trim();
                    const keywords = existing.length > 0 ? existing.split(' ') : [];
                    if (!keywords.includes(kw)) keywords.push(kw);
                    content = content.replace(kw_re, `m_ShaderKeywords: ${keywords.join(' ')}`);
                    changes.push(`keyword added: ${kw}`);
                }
            }
            for (const kw of (options.keywordRemove as string[])) {
                const kw_re = /m_ShaderKeywords:\s*(.*)/;
                const m = kw_re.exec(content);
                if (m) {
                    const existing = m[1].trim();
                    const keywords = existing.split(' ').filter(k => k !== kw);
                    content = content.replace(kw_re, `m_ShaderKeywords: ${keywords.join(' ')}`);
                    changes.push(`keyword removed: ${kw}`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set, --set-color, --set-texture, --shader, --keyword-add, or --keyword-remove' }, null, 2));
                process.exit(1);
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
            if (options.maxSize) edits.push({ key: 'maxTextureSize', value: options.maxSize as string });
            if (options.compression) edits.push({ key: 'textureCompression', value: options.compression as string });
            if (options.filterMode) edits.push({ key: 'filterMode', value: options.filterMode as string });
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
                        const re = new RegExp(`^(\\s*${edit.key}:\\s*).+$`, 'm');
                        if (re.test(mc)) {
                            mc = mc.replace(re, `$1${edit.value}`);
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
                const re = new RegExp(`^(\\s*${edit.key}:\\s*).+$`, 'm');
                if (re.test(content)) {
                    content = content.replace(re, `$1${edit.value}`);
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
        .description('Edit AnimationClip settings')
        .option('--set <property=value>', 'Set a clip property (e.g., wrap-mode=2 for Loop)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
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

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set property=value' }, null, 2));
                process.exit(1);
            }

            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ success: true, file, changes }, null, 2));
        });

    cmd.addCommand(prefab_cmd);

    return cmd;
}
