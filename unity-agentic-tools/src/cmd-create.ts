import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
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
            const ext = file.toLowerCase().split('.').pop();
            if (!ext || !['unity', 'prefab', 'asset'].includes(ext)) {
                console.log(JSON.stringify({ success: false, error: `Invalid file type ".${ext}". create gameobject only works with .unity, .prefab, or .asset files` }, null, 2));
                process.exitCode = 1;
                return;
            }

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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('meta <script_path>')
        .description('Generate a Unity .meta file for a script (MonoImporter)')
        .option('-j, --json', 'Output as JSON')
        .action((script_path, _options) => {
            const result = createMetaFile({
                script_path: script_path,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
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
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('build <project_path> <scene_path>')
        .description('Add a scene to build settings')
        .option('--index <n>', 'Insert at position (0-based)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, scene_path, options) => {
            try {
                const position = options.index !== undefined ? parseInt(options.index, 10) : undefined;
                const result = add_scene(project_path, scene_path, { position });
                console.log(JSON.stringify(result, null, 2));
                if (!result.success) process.exitCode = 1;
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    // ========== P2.3: Create Material ==========
    cmd.command('material <output_path>')
        .description('Create a new Unity Material file (.mat)')
        .option('--shader <guid>', 'Shader GUID (required)')
        .option('--shader-fileid <id>', 'Shader fileID (default: 4800000)', '4800000')
        .option('--name <name>', 'Material name (defaults to filename)')
        .option('--properties <json>', 'Initial properties JSON: {"floats":{"_Metallic":0.5},"colors":{"_Color":[1,0,0,1]}}')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, options) => {
            if (!options.shader) {
                console.log(JSON.stringify({ success: false, error: '--shader <guid> is required' }, null, 2));
                process.exit(1);
            }

            if (existsSync(output_path)) {
                console.log(JSON.stringify({ success: false, error: `File already exists: ${output_path}` }, null, 2));
                process.exit(1);
            }

            const name = (options.name as string) || output_path.replace(/.*[/\\]/, '').replace(/\.mat$/, '');
            const shader_guid = options.shader as string;
            if (!/^[a-f0-9]{32}$/.test(shader_guid)) {
                console.log(JSON.stringify({ success: false, error: `Invalid shader GUID "${shader_guid}". Must be a 32-character hex string (e.g., "0000000000000000f000000000000000")` }, null, 2));
                process.exit(1);
            }
            const shader_fid = options.shaderFileid as string;

            // Parse optional initial properties
            let floats: Record<string, number> = {};
            let colors: Record<string, number[]> = {};
            if (options.properties) {
                try {
                    const props = JSON.parse(options.properties as string) as {
                        floats?: Record<string, number>;
                        colors?: Record<string, number[]>;
                    };
                    floats = props.floats || {};
                    colors = props.colors || {};
                } catch {
                    console.log(JSON.stringify({ success: false, error: 'Invalid --properties JSON' }, null, 2));
                    process.exit(1);
                }
            }

            // Build float entries
            let float_section = '{}';
            const float_entries = Object.entries(floats);
            if (float_entries.length > 0) {
                float_section = '\n' + float_entries.map(([k, v]) => `    - ${k}: ${v}`).join('\n');
            }

            // Build color entries
            let color_section = '\n    - _Color: {r: 1, g: 1, b: 1, a: 1}';
            const color_entries = Object.entries(colors);
            if (color_entries.length > 0) {
                color_section = '\n' + color_entries.map(([k, v]) => {
                    const [r, g, b, a] = v;
                    return `    - ${k}: {r: ${r}, g: ${g}, b: ${b}, a: ${a}}`;
                }).join('\n');
            }

            const mat_content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  serializedVersion: 8
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${name}
  m_Shader: {fileID: ${shader_fid}, guid: ${shader_guid}, type: 3}
  m_ValidKeywords: []
  m_InvalidKeywords: []
  m_LightmapFlags: 4
  m_EnableInstancingVariants: 0
  m_DoubleSidedGI: 0
  m_CustomRenderQueue: -1
  stringTagMap: {}
  disabledShaderPasses: []
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:
    - _MainTex:
        m_Texture: {fileID: 0}
        m_Scale: {x: 1, y: 1}
        m_Offset: {x: 0, y: 0}
    m_Ints: []
    m_Floats: ${float_section}
    m_Colors: ${color_section}
  m_BuildTextureStacks: []
`;

            writeFileSync(output_path, mat_content, 'utf-8');

            // Generate .meta file
            const guid = randomBytes(16).toString('hex');
            const meta_content = `fileFormatVersion: 2
guid: ${guid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 2100000
  userData:
  assetBundleName:
  assetBundleVariant:
`;
            writeFileSync(`${output_path}.meta`, meta_content, 'utf-8');

            console.log(JSON.stringify({
                success: true,
                file: output_path,
                meta_file: `${output_path}.meta`,
                guid,
                name,
                shader_guid,
            }, null, 2));
        });

    return cmd;
}
