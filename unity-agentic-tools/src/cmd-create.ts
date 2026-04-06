import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { randomBytes } from 'crypto';
import { ensure_parent_dir, resolve_project_path } from './utils';
import {
    createGameObject,
    createScene,
    createPrefabVariant,
    createPrefabInstance,
    createScriptableObject,
    createMetaFile,
    addComponent,
    copyComponent,
    duplicateGameObject,
} from './editor';
import { add_scene } from './build-editor';
import { add_package } from './packages';
import { save_input_actions } from './input-actions';
import type { InputActionsFile } from './input-actions';
import { enforce_loaded_edit_protection } from './loaded-protection';

export function build_create_command(): Command {
    const cmd = new Command('create')
        .description('Create Unity objects (GameObjects, scenes, prefabs, components)');

    cmd.command('clone <file> <object_name>')
        .description('Duplicate a GameObject and its hierarchy')
        .option('-n, --name <new_name>', 'Name for the duplicated object')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, object_name, options) => {
            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }

            const result = duplicateGameObject({
                file_path: file,
                object_name,
                new_name: options.name,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('gameobject <file> [name]')
        .description('Create a new GameObject in a Unity file')
        .option('-p, --parent <name|id>', 'Parent GameObject name or Transform fileID')
        .option('-n, --name <name>', 'GameObject name (alternative to positional arg)')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, name_positional, options) => {
            const name = name_positional || options.name;
            if (!name) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing required name. Provide as positional argument or --name flag.',
                    correct_usage: [
                        'unity-agentic-tools create gameobject <file> <name>',
                        'unity-agentic-tools create gameobject <file> --name <name>',
                    ],
                }, null, 2));
                process.exitCode = 1;
                return;
            }
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

            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
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

    cmd.command('prefab-instance <scene_file> <prefab_path>')
        .description('Instantiate a prefab into a scene file')
        .option('-n, --name <name>', 'Instance name (defaults to prefab filename)')
        .option('-p, --parent <name|id>', 'Parent GameObject name or Transform fileID')
        .option('--position <x,y,z>', 'Local position (default: 0,0,0)')
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (scene_file, prefab_path_arg, options) => {
            let position: { x: number; y: number; z: number } | undefined;
            if (options.position) {
                const parts = (options.position as string).split(',').map(Number);
                if (parts.length !== 3 || parts.some(isNaN)) {
                    console.log(JSON.stringify({
                        success: false,
                        error: '--position must be three comma-separated numbers, e.g. 1,2,3'
                    }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                position = { x: parts[0], y: parts[1], z: parts[2] };
            }

            let parent: string | number | undefined;
            if (options.parent) {
                const asNumber = parseInt(options.parent, 10);
                parent = isNaN(asNumber) ? options.parent : asNumber;
            }

            const guard = await enforce_loaded_edit_protection(scene_file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: scene_file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }

            const result = createPrefabInstance({
                scene_path: scene_file,
                prefab_path: prefab_path_arg,
                name: options.name,
                parent,
                position,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('scriptable-object <output_path> <script>')
        .description('Create a new ScriptableObject .asset file')
        .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
        .option('--set <json>', 'Initial field values as JSON object (e.g. \'{"damage": "10", "targetScope": "1"}\')')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, script, options) => {
            let initial_values: Record<string, unknown> | undefined;
            if (options.set) {
                try {
                    initial_values = JSON.parse(options.set);
                } catch {
                    console.log(JSON.stringify({ success: false, error: `Invalid JSON for --set: ${options.set}` }, null, 2));
                    process.exitCode = 1;
                    return;
                }
            }
            const result = createScriptableObject({
                output_path: output_path,
                script: script,
                project_path: options.project,
                initial_values,
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
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, object_name, component, options) => {
            if (!component || component.trim() === '') {
                console.log(JSON.stringify({ success: false, file_path: file, error: 'Component name must not be empty' }, null, 2));
                process.exitCode = 1;
                return;
            }

            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection, options.project);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }

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
        .option('--bypass-loaded-protection', 'Allow editing files currently loaded in Unity Editor')
        .option('-j, --json', 'Output as JSON')
        .action(async (file, source_file_id, target_object_name, options) => {
            const guard = await enforce_loaded_edit_protection(file, options.bypassLoadedProtection);
            if (!guard.allowed) {
                console.log(JSON.stringify({ success: false, file_path: file, error: guard.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            const result = copyComponent({
                file_path: file,
                source_file_id: source_file_id,
                target_game_object_name: target_object_name,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exitCode = 1;
        });

     cmd.command('build <scene_path>')
         .description('Add a scene to build settings')
         .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
         .option('--index <n>', 'Insert at position (0-based)')
         .option('-j, --json', 'Output as JSON')
         .action((scene_path, options) => {
             try {
                 const resolvedProjectPath = resolve_project_path(options.project);
                 const position = options.index !== undefined ? parseInt(options.index, 10) : undefined;
                 const result = add_scene(resolvedProjectPath, scene_path, { position });
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

            ensure_parent_dir(output_path);
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

     // ========== Package creation ==========
     cmd.command('package <name> <version>')
         .description('Add a package to Packages/manifest.json')
         .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
         .option('-j, --json', 'Output as JSON')
         .action((name, version, options) => {
             try {
                 const resolvedProjectPath = resolve_project_path(options.project);
                 const result = add_package(resolvedProjectPath, name, version);
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

    // ========== Input Actions creation ==========
    cmd.command('input-actions <output_path> <name>')
        .description('Create a blank .inputactions file')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, name, _options) => {
            if (!output_path.endsWith('.inputactions')) {
                console.log(JSON.stringify({ success: false, error: 'Output path must end with .inputactions' }, null, 2));
                process.exitCode = 1;
                return;
            }
            if (existsSync(output_path)) {
                console.log(JSON.stringify({ success: false, error: `File already exists: ${output_path}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            const blank: InputActionsFile = {
                name,
                maps: [],
                controlSchemes: [],
            };
            save_input_actions(output_path, blank);

            // Generate .meta file
            const guid = randomBytes(16).toString('hex');
            const meta_content = `fileFormatVersion: 2
guid: ${guid}
ScriptedImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 2
  userData:
  assetBundleName:
  assetBundleVariant:
  script: {fileID: 11500000, guid: 8404be70184654265930450def6a9037, type: 3}
  generateWrapperCode: 0
  wrapperCodePath:
  wrapperClassName:
  wrapperCodeNamespace:
`;
            writeFileSync(`${output_path}.meta`, meta_content, 'utf-8');

            console.log(JSON.stringify({
                success: true,
                file: output_path,
                meta_file: `${output_path}.meta`,
                guid,
                name,
            }, null, 2));
        });

    // ========== Animation creation ==========
    cmd.command('animation <output_path> [name]')
        .description('Create a blank .anim AnimationClip file (name defaults to filename without extension)')
        .option('--sample-rate <n>', 'Sample rate (default: 60)', '60')
        .option('--loop', 'Enable loop time')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, name_arg, options) => {
            if (!output_path.endsWith('.anim')) {
                console.log(JSON.stringify({ success: false, error: 'Output path must end with .anim' }, null, 2));
                process.exitCode = 1;
                return;
            }
            const name = name_arg || basename(output_path).replace(/\.anim$/i, '');
            if (existsSync(output_path)) {
                console.log(JSON.stringify({ success: false, error: `File already exists: ${output_path}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            const parsed_rate = parseInt(options.sampleRate as string, 10);
            if (isNaN(parsed_rate) || parsed_rate < 1) {
                console.log(JSON.stringify({ success: false, error: `Invalid --sample-rate "${options.sampleRate}". Must be a positive integer.` }, null, 2));
                process.exitCode = 1;
                return;
            }
            const sample_rate = parsed_rate;
            const loop_time = options.loop ? 1 : 0;

            const anim_content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!74 &7400000
AnimationClip:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${name}
  serializedVersion: 7
  m_Legacy: 0
  m_Compressed: 0
  m_UseHighQualityCurve: 1
  m_RotationCurves: []
  m_CompressedRotationCurves: []
  m_EulerCurves: []
  m_PositionCurves: []
  m_ScaleCurves: []
  m_FloatCurves: []
  m_PPtrCurves: []
  m_SampleRate: ${sample_rate}
  m_WrapMode: 0
  m_Bounds:
    m_Center: {x: 0, y: 0, z: 0}
    m_Extent: {x: 0, y: 0, z: 0}
  m_ClipBindingConstant:
    genericBindings: []
    pptrCurveMapping: []
  m_AnimationClipSettings:
    serializedVersion: 2
    m_AdditiveReferencePoseClip: {fileID: 0}
    m_AdditiveReferencePoseTime: 0
    m_StartTime: 0
    m_StopTime: 1
    m_OrientationOffsetY: 0
    m_Level: 0
    m_CycleOffset: 0
    m_HasAdditiveReferencePose: 0
    m_LoopTime: ${loop_time}
    m_LoopBlend: 0
    m_LoopBlendOrientation: 0
    m_LoopBlendPositionY: 0
    m_LoopBlendPositionXZ: 0
    m_KeepOriginalOrientation: 0
    m_KeepOriginalPositionY: 1
    m_KeepOriginalPositionXZ: 0
    m_HeightFromFeet: 0
    m_Mirror: 0
  m_EditorCurves: []
  m_EulerEditorCurves: []
  m_HasGenericRootTransform: 0
  m_HasMotionFloatCurves: 0
  m_Events: []
`;

            ensure_parent_dir(output_path);
            writeFileSync(output_path, anim_content, 'utf-8');

            // Generate .meta file
            const guid = randomBytes(16).toString('hex');
            const meta_content = `fileFormatVersion: 2
guid: ${guid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 7400000
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
                sample_rate,
                loop_time: loop_time === 1,
            }, null, 2));
        });

    // ========== create animator ==========
    cmd.command('animator <output_path> [name]')
        .description('Create a blank .controller AnimatorController file (name defaults to filename without extension)')
        .option('--layer <name>', 'Name of the initial layer (default: "Base Layer")', 'Base Layer')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, name_arg, options) => {
            const name = name_arg || basename(output_path).replace(/\.controller$/i, '');
            if (!output_path.toLowerCase().endsWith('.controller')) {
                console.log(JSON.stringify({ success: false, error: 'Output path must end with .controller' }, null, 2));
                process.exitCode = 1;
                return;
            }
            if (existsSync(output_path)) {
                console.log(JSON.stringify({ success: false, error: `File already exists: ${output_path}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            const layer_name = options.layer as string;
            const ctrl_content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!91 &9100000
AnimatorController:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${name}
  serializedVersion: 5
  m_AnimatorParameters: []
  m_AnimatorLayers:
  - serializedVersion: 5
    m_Name: ${layer_name}
    m_StateMachine: {fileID: 1107000010}
    m_Mask: {fileID: 0}
    m_Motions: []
    m_Behaviours: []
    m_BlendingMode: 0
    m_SyncedLayerIndex: -1
    m_DefaultWeight: 0
    m_IKPass: 0
    m_SyncedLayerAffectsTiming: 0
    m_Controller: {fileID: 9100000}
--- !u!1107 &1107000010
AnimatorStateMachine:
  serializedVersion: 6
  m_ObjectHideFlags: 1
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${layer_name}
  m_ChildStates: []
  m_ChildStateMachines: []
  m_AnyStateTransitions: []
  m_EntryTransitions: []
  m_StateMachineTransitions: {}
  m_StateMachineBehaviours: []
  m_AnyStatePosition: {x: 50, y: 20, z: 0}
  m_EntryPosition: {x: 50, y: 120, z: 0}
  m_ExitPosition: {x: 800, y: 120, z: 0}
  m_ParentStateMachinePosition: {x: 800, y: 20, z: 0}
  m_DefaultState: {fileID: 0}
`;

            ensure_parent_dir(output_path);
            writeFileSync(output_path, ctrl_content, 'utf-8');

            const guid = randomBytes(16).toString('hex');
            const meta_content = `fileFormatVersion: 2
guid: ${guid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 9100000
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
                layer: layer_name,
            }, null, 2));
        });

    // ========== create prefab ==========
    cmd.command('prefab <output_path> [name]')
        .description('Create a blank .prefab file (name defaults to filename without extension)')
        .option('-j, --json', 'Output as JSON')
        .action((output_path, name_arg) => {
            const name = name_arg || basename(output_path).replace(/\.prefab$/i, '');
            if (!output_path.toLowerCase().endsWith('.prefab')) {
                console.log(JSON.stringify({ success: false, error: 'Output path must end with .prefab' }, null, 2));
                process.exitCode = 1;
                return;
            }
            if (existsSync(output_path)) {
                console.log(JSON.stringify({ success: false, error: `File already exists: ${output_path}` }, null, 2));
                process.exitCode = 1;
                return;
            }

            const prefab_content = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 400000}
  m_Layer: 0
  m_Name: ${name}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &400000
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
`;

            ensure_parent_dir(output_path);
            writeFileSync(output_path, prefab_content, 'utf-8');

            const guid = randomBytes(16).toString('hex');
            const meta_content = `fileFormatVersion: 2
guid: ${guid}
PrefabImporter:
  externalObjects: {}
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
            }, null, 2));
        });

    return cmd;
}
