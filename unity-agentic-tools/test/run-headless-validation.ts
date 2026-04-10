import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { execFileSync, spawn } from 'child_process';
import { dirname, isAbsolute, join, resolve } from 'path';

export interface RunnerOptions {
    unity_bin: string;
    scenario: string;
    timeout_ms: number;
    keep_temp: boolean;
}

export interface UnityLogSummary {
    validation_errors: string[];
    validation_warnings: string[];
    compiler_errors: string[];
    fatal_errors: string[];
    licensing_errors: string[];
}

interface ScenarioContext {
    project_path: string;
    unity_bin: string;
    timeout_ms: number;
    bootstrapped: boolean;
}

interface ScenarioDefinition {
    name: string;
    expect_failure?: boolean;
    expected_validation_error?: string;
    run: (context: ScenarioContext, scene_path: string, scene_asset_path: string) => Promise<string[]>;
}

const PACKAGE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..');
const CLI_PATH = resolve(PACKAGE_ROOT, 'dist', 'cli.js');
const FIXTURE_ROOT = resolve(__dirname, 'fixtures', 'headless-validation');
const LOCAL_FIXTURES_ROOT = resolve(__dirname, 'fixtures');
const EXTERNAL_FIXTURES_ROOT = resolve(REPO_ROOT, 'test', 'fixtures', 'external');
const TEMP_ROOT = resolve(PACKAGE_ROOT, '.tmp');
const MANIFEST_NAME = 'UATValidationTargets.json';
const SCENE_ASSET_PATH = 'Assets/Scenes/ValidationScene.unity';
const GENERATED_ASSET_DIR = 'Assets/Generated';
const UNITY_EXECUTE_METHOD = 'UnityAgenticTools.Editor.HeadlessValidator.RunValidation';
const TMP_SHADER_GUID = 'fe393ace9b354375a9cb14cdbbc28be4';
const TMP_SHADER_DIR = 'Assets/TextMesh Pro/Shaders';
const DEFAULT_TIMEOUT_MS = 600_000;
const COPY_EXCLUDES = new Set(['Library', 'Logs', 'Temp', '.DS_Store']);
const LOG_POLL_INTERVAL_MS = 1_000;
const PROCESS_KILL_GRACE_MS = 5_000;

function ensure_cli_is_built(): void {
    if (!existsSync(CLI_PATH)) {
        throw new Error(`CLI build not found at ${CLI_PATH}. Run bun run build first.`);
    }
}

function filter_fixture_copy(source_path: string): boolean {
    const segments = source_path.split(/[\\/]/);
    const last_segment = segments[segments.length - 1];

    if (COPY_EXCLUDES.has(last_segment)) {
        return false;
    }

    if (last_segment.endsWith('.csproj') || last_segment.endsWith('.sln')) {
        return false;
    }

    return true;
}

export function parse_args(args: string[]): RunnerOptions {
    let unity_bin = '';
    let scenario = 'all';
    let timeout_ms = DEFAULT_TIMEOUT_MS;
    let keep_temp = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case '--unity-bin':
                unity_bin = require_arg_value(args, ++index, arg);
                break;
            case '--scenario':
                scenario = require_arg_value(args, ++index, arg);
                break;
            case '--timeout-ms': {
                const timeout_value = require_arg_value(args, ++index, arg);
                const parsed_timeout = parseInt(timeout_value, 10);
                if (!Number.isFinite(parsed_timeout) || parsed_timeout <= 0) {
                    throw new Error(`Invalid --timeout-ms value: ${timeout_value}`);
                }
                timeout_ms = parsed_timeout;
                break;
            }
            case '--keep-temp':
                keep_temp = true;
                break;
            case '--help':
                print_help();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (unity_bin === '') {
        throw new Error('--unity-bin is required');
    }

    if (!isAbsolute(unity_bin)) {
        throw new Error('--unity-bin must be an absolute path');
    }

    return { unity_bin, scenario, timeout_ms, keep_temp };
}

function require_arg_value(args: string[], index: number, flag: string): string {
    const value = args[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

function print_help(): void {
    console.log(`Usage: bun test/run-headless-validation.ts --unity-bin <absolute-path> [options]

Options:
  --unity-bin <absolute-path>  Unity editor binary to run in batchmode
  --scenario <name|all>        Scenario to execute (default: all)
  --timeout-ms <n>             Unity process timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --keep-temp                  Preserve temp projects after execution
  --help                       Show this help text`);
}

function run_cli_json(args: string[], cwd: string = PACKAGE_ROOT): Record<string, unknown> {
    const stdout = execFileSync('bun', [CLI_PATH, ...args, '--json'], {
        cwd,
        encoding: 'utf-8',
    });

    return JSON.parse(stdout) as Record<string, unknown>;
}

function copy_fixture_project(): string {
    mkdirSync(TEMP_ROOT, { recursive: true });
    const temp_dir = mkdtempSync(join(TEMP_ROOT, 'headless-validation-'));
    rmSync(temp_dir, { recursive: true, force: true });
    cpSync(FIXTURE_ROOT, temp_dir, { recursive: true, filter: filter_fixture_copy });
    return temp_dir;
}

function write_validation_manifest(project_path: string, targets: string[]): void {
    const manifest_path = join(project_path, MANIFEST_NAME);
    writeFileSync(manifest_path, JSON.stringify({ targets }, null, 2));
}

function copy_path_into_project(project_path: string, source_path: string, destination_relative_path: string): string {
    const destination_path = join(project_path, destination_relative_path);
    mkdirSync(dirname(destination_path), { recursive: true });
    cpSync(source_path, destination_path, { recursive: true });
    return destination_path;
}

function copy_local_fixture(project_path: string, source_relative_path: string, destination_relative_path: string): string {
    return copy_path_into_project(
        project_path,
        resolve(LOCAL_FIXTURES_ROOT, source_relative_path),
        destination_relative_path,
    );
}

function copy_external_fixture(project_path: string, source_relative_path: string, destination_relative_path: string): string {
    return copy_path_into_project(
        project_path,
        resolve(EXTERNAL_FIXTURES_ROOT, source_relative_path),
        destination_relative_path,
    );
}

function write_project_text_file(project_path: string, destination_relative_path: string, content: string): string {
    const destination_path = join(project_path, destination_relative_path);
    mkdirSync(dirname(destination_path), { recursive: true });
    writeFileSync(destination_path, content, 'utf-8');
    return destination_path;
}

function assert_cli_success(result: Record<string, unknown>, scenario_name: string): void {
    if (result.success === false) {
        throw new Error(`CLI scenario ${scenario_name} failed: ${String(result.error ?? result.message ?? 'unknown error')}`);
    }
}

function read_scene_objects(scene_path: string): Array<Record<string, unknown>> {
    const result = run_cli_json(['read', 'scene', scene_path]);
    return Array.isArray(result.gameobjects) ? result.gameobjects as Array<Record<string, unknown>> : [];
}

function get_gameobject_entry(scene_path: string, object_name: string): Record<string, unknown> {
    const gameobject = read_scene_objects(scene_path).find((entry) => entry.name === object_name);
    if (!gameobject) {
        throw new Error(`Could not find GameObject "${object_name}" in ${scene_path}`);
    }
    return gameobject;
}

function get_component_file_id(scene_path: string, object_name: string, component_type: string): string {
    const gameobject = get_gameobject_entry(scene_path, object_name);
    const components = Array.isArray(gameobject.components) ? gameobject.components as Array<Record<string, unknown>> : [];
    const component = components.find((entry) => entry.type === component_type);

    if (!component || typeof component.fileId !== 'string') {
        throw new Error(`Could not find component "${component_type}" on GameObject "${object_name}"`);
    }

    return component.fileId;
}

function get_transform_file_id(scene_path: string, object_name: string): string {
    return get_component_file_id(scene_path, object_name, 'Transform');
}

function require_result_string(result: Record<string, unknown>, key: string, scenario_name: string): string {
    const value = result[key];
    if (typeof value !== 'string') {
        throw new Error(`CLI scenario ${scenario_name} did not return string field "${key}"`);
    }
    return value;
}

function material_shader_setup(project_path: string): void {
    copy_external_fixture(project_path, TMP_SHADER_DIR, TMP_SHADER_DIR);
}

function create_script_with_meta(project_path: string, script_asset_path: string, script_content: string, scenario_name: string): string {
    const script_path = write_project_text_file(project_path, script_asset_path, script_content);
    assert_cli_success(
        run_cli_json(['create', 'meta', script_path]),
        `${scenario_name} setup meta`,
    );
    return script_path;
}

function mono_behaviour_script_content(class_name: string): string {
    return [
        'using UnityEngine;',
        '',
        `public class ${class_name} : MonoBehaviour`,
        '{',
        '    public int value = 1;',
        '    public string label = "default";',
        '}',
        '',
    ].join('\n');
}

function scriptable_object_script_content(class_name: string): string {
    return [
        'using UnityEngine;',
        '',
        `[CreateAssetMenu(menuName = "Headless/${class_name}")]`,
        `public class ${class_name} : ScriptableObject`,
        '{',
        '    public int amount = 3;',
        '    public string note = "seed";',
        '}',
        '',
    ].join('\n');
}

function get_prefab_target(prefab_path: string, gameobject_name: string, component_type: string | null, scenario_name: string): string {
    const args = ['read', 'target', prefab_path, gameobject_name];
    if (component_type) {
        args.push(component_type);
    }
    const result = run_cli_json(args);
    return require_result_string(result, 'target', scenario_name);
}

async function bootstrap_project(context: ScenarioContext): Promise<void> {
    if (context.bootstrapped) {
        return;
    }

    write_validation_manifest(context.project_path, [SCENE_ASSET_PATH]);
    const result = await run_unity_validation(context.unity_bin, context.project_path, context.timeout_ms);

    if (!result.success) {
        throw new Error(`Failed to bootstrap Unity project state: ${format_result_message(result)}`);
    }

    context.bootstrapped = true;
}

const SCENARIOS: Record<string, ScenarioDefinition> = {
    baseline: {
        name: 'baseline',
        async run(_context, _scene_path, scene_asset_path) {
            return [scene_asset_path];
        },
    },
    'create-gameobject': {
        name: 'create-gameobject',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['create', 'gameobject', scene_path, 'HeadlessCreated']),
                'create-gameobject',
            );
            return [scene_asset_path];
        },
    },
    'create-gameobject-parented': {
        name: 'create-gameobject-parented',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['create', 'gameobject', scene_path, 'HeadlessChild', '--parent', 'TestObject']),
                'create-gameobject-parented',
            );
            return [scene_asset_path];
        },
    },
    'update-gameobject': {
        name: 'update-gameobject',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['update', 'gameobject', scene_path, 'TestObject', 'm_IsActive', 'false']),
                'update-gameobject',
            );
            return [scene_asset_path];
        },
    },
    'update-component': {
        name: 'update-component',
        async run(_context, scene_path, scene_asset_path) {
            const camera_id = get_component_file_id(scene_path, 'Main Camera', 'Camera');
            assert_cli_success(
                run_cli_json(['update', 'component', scene_path, camera_id, 'm_FieldOfView', '55']),
                'update-component',
            );
            return [scene_asset_path];
        },
    },
    'update-transform': {
        name: 'update-transform',
        async run(_context, scene_path, scene_asset_path) {
            const transform_id = get_transform_file_id(scene_path, 'TestObject');
            assert_cli_success(
                run_cli_json(['update', 'transform', scene_path, transform_id, '--position', '3,4,5', '--scale', '2,2,2']),
                'update-transform',
            );
            return [scene_asset_path];
        },
    },
    'create-component': {
        name: 'create-component',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['create', 'component', scene_path, 'TestObject', 'BoxCollider']),
                'create-component',
            );
            return [scene_asset_path];
        },
    },
    'create-component-custom-script': {
        name: 'create-component-custom-script',
        async run(context, scene_path, scene_asset_path) {
            const script_asset_path = 'Assets/Scripts/HeadlessBehaviour.cs';
            const script_path = create_script_with_meta(
                context.project_path,
                script_asset_path,
                mono_behaviour_script_content('HeadlessBehaviour'),
                'create-component-custom-script',
            );
            assert_cli_success(
                run_cli_json([
                    'create', 'component', scene_path, 'TestObject', script_path,
                    '--project', context.project_path,
                ]),
                'create-component-custom-script',
            );
            return [scene_asset_path, script_asset_path];
        },
    },
    'update-component-custom-script': {
        name: 'update-component-custom-script',
        async run(context, scene_path, scene_asset_path) {
            const script_asset_path = 'Assets/Scripts/HeadlessEditableBehaviour.cs';
            const script_path = create_script_with_meta(
                context.project_path,
                script_asset_path,
                mono_behaviour_script_content('HeadlessEditableBehaviour'),
                'update-component-custom-script',
            );
            const create_result = run_cli_json([
                'create', 'component', scene_path, 'TestObject', script_path,
                '--project', context.project_path,
            ]);
            assert_cli_success(create_result, 'update-component-custom-script setup component');
            const component_id = require_result_string(create_result, 'component_id', 'update-component-custom-script');
            assert_cli_success(
                run_cli_json(['update', 'component', scene_path, component_id, 'value', '7']),
                'update-component-custom-script',
            );
            return [scene_asset_path, script_asset_path];
        },
    },
    'create-component-copy': {
        name: 'create-component-copy',
        async run(_context, scene_path, scene_asset_path) {
            const source_component_id = get_component_file_id(scene_path, 'Main Camera', 'Camera');
            assert_cli_success(
                run_cli_json(['create', 'component-copy', scene_path, source_component_id, 'TestObject']),
                'create-component-copy',
            );
            return [scene_asset_path];
        },
    },
    'update-parent': {
        name: 'update-parent',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['update', 'parent', scene_path, 'TestObject', 'Main Camera']),
                'update-parent',
            );
            return [scene_asset_path];
        },
    },
    'update-sibling-index': {
        name: 'update-sibling-index',
        async run(_context, scene_path, scene_asset_path) {
            assert_cli_success(
                run_cli_json(['update', 'sibling-index', scene_path, 'TestObject', '0']),
                'update-sibling-index',
            );
            return [scene_asset_path];
        },
    },
    'update-batch': {
        name: 'update-batch',
        async run(_context, scene_path, scene_asset_path) {
            const edits = JSON.stringify([
                { object_name: 'TestObject', property: 'm_IsActive', value: 'false' },
                { object_name: 'Main Camera', property: 'm_TagString', value: 'Untagged' },
            ]);
            assert_cli_success(
                run_cli_json(['update', 'batch', scene_path, edits]),
                'update-batch',
            );
            return [scene_asset_path];
        },
    },
    'update-batch-components': {
        name: 'update-batch-components',
        async run(_context, scene_path, scene_asset_path) {
            const camera_id = get_component_file_id(scene_path, 'Main Camera', 'Camera');
            const transform_id = get_transform_file_id(scene_path, 'TestObject');
            const edits = JSON.stringify([
                { file_id: camera_id, property: 'm_FieldOfView', value: '48' },
                { file_id: transform_id, property: 'm_LocalScale.x', value: '1.5' },
            ]);
            assert_cli_success(
                run_cli_json(['update', 'batch-components', scene_path, edits]),
                'update-batch-components',
            );
            return [scene_asset_path];
        },
    },
    'create-scene': {
        name: 'create-scene',
        async run(context) {
            const created_scene_asset_path = 'Assets/Scenes/GeneratedEmpty.unity';
            const created_scene_path = join(context.project_path, created_scene_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'scene', created_scene_path]),
                'create-scene',
            );
            return [created_scene_asset_path];
        },
    },
    'create-scene-defaults': {
        name: 'create-scene-defaults',
        async run(context) {
            const created_scene_asset_path = 'Assets/Scenes/GeneratedDefaults.unity';
            const created_scene_path = join(context.project_path, created_scene_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'scene', created_scene_path, '--defaults']),
                'create-scene-defaults',
            );
            return [created_scene_asset_path];
        },
    },
    'create-build': {
        name: 'create-build',
        async run(context) {
            assert_cli_success(
                run_cli_json(['create', 'build', SCENE_ASSET_PATH, '--project', context.project_path]),
                'create-build',
            );
            return ['ProjectSettings/EditorBuildSettings.asset'];
        },
    },
    'update-build-disable': {
        name: 'update-build-disable',
        async run(context) {
            assert_cli_success(
                run_cli_json(['create', 'build', SCENE_ASSET_PATH, '--project', context.project_path]),
                'update-build-disable setup',
            );
            assert_cli_success(
                run_cli_json(['update', 'build', SCENE_ASSET_PATH, '--project', context.project_path, '--disable']),
                'update-build-disable',
            );
            return ['ProjectSettings/EditorBuildSettings.asset'];
        },
    },
    'update-tag': {
        name: 'update-tag',
        async run(context) {
            await bootstrap_project(context);
            assert_cli_success(
                run_cli_json(['update', 'tag', 'add', 'HeadlessTag', '--project', context.project_path]),
                'update-tag',
            );
            return ['ProjectSettings/TagManager.asset'];
        },
    },
    'update-layer': {
        name: 'update-layer',
        async run(context) {
            await bootstrap_project(context);
            assert_cli_success(
                run_cli_json(['update', 'layer', '8', 'HeadlessLayer', '--project', context.project_path]),
                'update-layer',
            );
            return ['ProjectSettings/TagManager.asset'];
        },
    },
    'update-sorting-layer': {
        name: 'update-sorting-layer',
        async run(context) {
            await bootstrap_project(context);
            assert_cli_success(
                run_cli_json(['update', 'sorting-layer', 'add', 'HeadlessSorting', '--project', context.project_path]),
                'update-sorting-layer',
            );
            return ['ProjectSettings/TagManager.asset'];
        },
    },
    'update-settings-time': {
        name: 'update-settings-time',
        async run(context) {
            await bootstrap_project(context);
            assert_cli_success(
                run_cli_json([
                    'update', 'settings',
                    '--project', context.project_path,
                    '--setting', 'time',
                    '--property', 'fixed_timestep',
                    '--value', '0.0333333',
                ]),
                'update-settings-time',
            );
            return ['ProjectSettings/TimeManager.asset'];
        },
    },
    'create-prefab': {
        name: 'create-prefab',
        async run(context) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/HeadlessBlank.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'create-prefab',
            );
            return [prefab_asset_path];
        },
    },
    'create-prefab-variant': {
        name: 'create-prefab-variant',
        async run(context) {
            const source_prefab_asset_path = `${GENERATED_ASSET_DIR}/HeadlessBase.prefab`;
            const variant_asset_path = `${GENERATED_ASSET_DIR}/HeadlessVariant.prefab`;
            const source_prefab_path = join(context.project_path, source_prefab_asset_path);
            const variant_path = join(context.project_path, variant_asset_path);

            assert_cli_success(
                run_cli_json(['create', 'prefab', source_prefab_path]),
                'create-prefab-variant setup',
            );
            assert_cli_success(
                run_cli_json(['create', 'prefab-variant', source_prefab_path, variant_path, '--name', 'Headless Variant']),
                'create-prefab-variant',
            );

            return [source_prefab_asset_path, variant_asset_path];
        },
    },
    'create-prefab-instance': {
        name: 'create-prefab-instance',
        async run(context, scene_path, scene_asset_path) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/InstanceSource.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'create-prefab-instance setup',
            );
            assert_cli_success(
                run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'InstancedBlank']),
                'create-prefab-instance',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-remove-component': {
        name: 'update-prefab-remove-component',
        async run(context, scene_path, scene_asset_path) {
            const prefab_name = 'RemoveComponentSource';
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/${prefab_name}.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-remove-component setup prefab',
            );
            assert_cli_success(
                run_cli_json(['create', 'component', prefab_path, prefab_name, 'BoxCollider']),
                'update-prefab-remove-component setup collider',
            );
            const target = get_prefab_target(prefab_path, prefab_name, 'BoxCollider', 'update-prefab-remove-component');
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'RemoveComponentInstance']);
            assert_cli_success(create_result, 'update-prefab-remove-component setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-remove-component');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'remove-component', scene_path, prefab_instance_id, target]),
                'update-prefab-remove-component',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-restore-component': {
        name: 'update-prefab-restore-component',
        async run(context, scene_path, scene_asset_path) {
            const prefab_name = 'RestoreComponentSource';
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/${prefab_name}.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-restore-component setup prefab',
            );
            assert_cli_success(
                run_cli_json(['create', 'component', prefab_path, prefab_name, 'BoxCollider']),
                'update-prefab-restore-component setup collider',
            );
            const target = get_prefab_target(prefab_path, prefab_name, 'BoxCollider', 'update-prefab-restore-component');
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'RestoreComponentInstance']);
            assert_cli_success(create_result, 'update-prefab-restore-component setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-restore-component');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'remove-component', scene_path, prefab_instance_id, target]),
                'update-prefab-restore-component setup remove',
            );
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'restore-component', scene_path, prefab_instance_id, target]),
                'update-prefab-restore-component',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-remove-gameobject': {
        name: 'update-prefab-remove-gameobject',
        async run(context, scene_path, scene_asset_path) {
            const prefab_name = 'RemoveGameObjectSource';
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/${prefab_name}.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-remove-gameobject setup prefab',
            );
            assert_cli_success(
                run_cli_json(['create', 'gameobject', prefab_path, 'RemovedChild', '--parent', prefab_name]),
                'update-prefab-remove-gameobject setup child',
            );
            const target = get_prefab_target(prefab_path, 'RemovedChild', null, 'update-prefab-remove-gameobject');
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'RemoveGameObjectInstance']);
            assert_cli_success(create_result, 'update-prefab-remove-gameobject setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-remove-gameobject');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'remove-gameobject', scene_path, prefab_instance_id, target]),
                'update-prefab-remove-gameobject',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-restore-gameobject': {
        name: 'update-prefab-restore-gameobject',
        async run(context, scene_path, scene_asset_path) {
            const prefab_name = 'RestoreGameObjectSource';
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/${prefab_name}.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-restore-gameobject setup prefab',
            );
            assert_cli_success(
                run_cli_json(['create', 'gameobject', prefab_path, 'RestoredChild', '--parent', prefab_name]),
                'update-prefab-restore-gameobject setup child',
            );
            const target = get_prefab_target(prefab_path, 'RestoredChild', null, 'update-prefab-restore-gameobject');
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'RestoreGameObjectInstance']);
            assert_cli_success(create_result, 'update-prefab-restore-gameobject setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-restore-gameobject');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'remove-gameobject', scene_path, prefab_instance_id, target]),
                'update-prefab-restore-gameobject setup remove',
            );
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'restore-gameobject', scene_path, prefab_instance_id, target]),
                'update-prefab-restore-gameobject',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-override': {
        name: 'update-prefab-override',
        async run(context, scene_path, scene_asset_path) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/OverrideSource.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-override setup prefab',
            );
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'OverrideInstance']);
            assert_cli_success(create_result, 'update-prefab-override setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-override');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'override', scene_path, prefab_instance_id, 'm_LocalPosition.x', '7']),
                'update-prefab-override',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-batch-overrides': {
        name: 'update-prefab-batch-overrides',
        async run(context, scene_path, scene_asset_path) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/BatchOverrideSource.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-batch-overrides setup prefab',
            );
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'BatchOverrideInstance']);
            assert_cli_success(create_result, 'update-prefab-batch-overrides setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-batch-overrides');
            const edits = JSON.stringify([
                { property_path: 'm_LocalPosition.x', value: '4' },
                { property_path: 'm_LocalPosition.y', value: '2' },
            ]);
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'batch-overrides', scene_path, prefab_instance_id, edits]),
                'update-prefab-batch-overrides',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-remove-override': {
        name: 'update-prefab-remove-override',
        async run(context, scene_path, scene_asset_path) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/RemoveOverrideSource.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-remove-override setup prefab',
            );
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'RemoveOverrideInstance']);
            assert_cli_success(create_result, 'update-prefab-remove-override setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-remove-override');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'remove-override', scene_path, prefab_instance_id, 'm_LocalPosition.x']),
                'update-prefab-remove-override',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'update-prefab-unpack': {
        name: 'update-prefab-unpack',
        async run(context, scene_path, scene_asset_path) {
            const prefab_asset_path = `${GENERATED_ASSET_DIR}/UnpackSource.prefab`;
            const prefab_path = join(context.project_path, prefab_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'prefab', prefab_path]),
                'update-prefab-unpack setup prefab',
            );
            const create_result = run_cli_json(['create', 'prefab-instance', scene_path, prefab_path, '--name', 'UnpackInstance']);
            assert_cli_success(create_result, 'update-prefab-unpack setup instance');
            const prefab_instance_id = require_result_string(create_result, 'prefab_instance_id', 'update-prefab-unpack');
            assert_cli_success(
                run_cli_json(['update', 'prefab', 'unpack', scene_path, prefab_instance_id]),
                'update-prefab-unpack',
            );
            return [scene_asset_path, prefab_asset_path];
        },
    },
    'create-animation': {
        name: 'create-animation',
        async run(context) {
            const animation_asset_path = `${GENERATED_ASSET_DIR}/HeadlessAnim.anim`;
            const animation_path = join(context.project_path, animation_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'animation', animation_path, 'HeadlessAnim', '--loop', '--sample-rate', '60']),
                'create-animation',
            );
            return [animation_asset_path];
        },
    },
    'update-animation-remove-event': {
        name: 'update-animation-remove-event',
        async run(context) {
            const animation_asset_path = `${GENERATED_ASSET_DIR}/AnimationRemoveEvent.anim`;
            const animation_path = copy_local_fixture(context.project_path, 'events-test.anim', animation_asset_path);
            assert_cli_success(
                run_cli_json(['update', 'animation', animation_path, '--remove-event', '0']),
                'update-animation-remove-event',
            );
            return [animation_asset_path];
        },
    },
    'update-animation': {
        name: 'update-animation',
        async run(context) {
            const animation_asset_path = `${GENERATED_ASSET_DIR}/AnimationEvents.anim`;
            const animation_path = copy_local_fixture(context.project_path, 'keyframe-test.anim', animation_asset_path);
            assert_cli_success(
                run_cli_json(['update', 'animation', animation_path, '--add-event', '0.25,OnStep,left']),
                'update-animation',
            );
            return [animation_asset_path];
        },
    },
    'update-animation-curves': {
        name: 'update-animation-curves',
        async run(context) {
            const animation_asset_path = `${GENERATED_ASSET_DIR}/AnimationCurves.anim`;
            const animation_path = copy_local_fixture(context.project_path, 'keyframe-test.anim', animation_asset_path);
            const curve_spec = JSON.stringify({
                type: 'float',
                path: 'NewPath',
                attribute: 'm_Enabled',
                classID: 23,
                keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0 }],
            });
            assert_cli_success(
                run_cli_json(['update', 'animation-curves', animation_path, '--add-curve', curve_spec]),
                'update-animation-curves',
            );
            return [animation_asset_path];
        },
    },
    'create-animator': {
        name: 'create-animator',
        async run(context) {
            const animator_asset_path = `${GENERATED_ASSET_DIR}/Headless.controller`;
            const animator_path = join(context.project_path, animator_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'animator', animator_path]),
                'create-animator',
            );
            return [animator_asset_path];
        },
    },
    'update-animator-parameter': {
        name: 'update-animator-parameter',
        async run(context) {
            const animator_asset_path = `${GENERATED_ASSET_DIR}/AnimatorParameters.controller`;
            const animator_path = join(context.project_path, animator_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'animator', animator_path]),
                'update-animator-parameter setup',
            );
            assert_cli_success(
                run_cli_json(['update', 'animator', animator_path, '--add-parameter', 'Speed', '--type', 'float']),
                'update-animator-parameter',
            );
            return [animator_asset_path];
        },
    },
    'update-animator-state-add': {
        name: 'update-animator-state-add',
        async run(context) {
            const animator_asset_path = `${GENERATED_ASSET_DIR}/AnimatorAddState.controller`;
            const animator_path = copy_local_fixture(context.project_path, 'test-animator.controller', animator_asset_path);
            assert_cli_success(
                run_cli_json(['update', 'animator-state', animator_path, '--add-state', 'Run', '--speed', '1.5']),
                'update-animator-state-add',
            );
            return [animator_asset_path];
        },
    },
    'update-animator-state-transition': {
        name: 'update-animator-state-transition',
        async run(context) {
            const animator_asset_path = `${GENERATED_ASSET_DIR}/AnimatorTransition.controller`;
            const animator_path = copy_local_fixture(context.project_path, 'test-animator.controller', animator_asset_path);
            assert_cli_success(
                run_cli_json([
                    'update', 'animator-state', animator_path,
                    '--add-transition', 'Idle:Walk',
                    '--condition', 'Speed,greater,0.1',
                    '--duration', '0.25',
                ]),
                'update-animator-state-transition',
            );
            return [animator_asset_path];
        },
    },
    'update-animator-default-state': {
        name: 'update-animator-default-state',
        async run(context) {
            const animator_asset_path = `${GENERATED_ASSET_DIR}/AnimatorDefaultState.controller`;
            const animator_path = copy_local_fixture(context.project_path, 'test-animator.controller', animator_asset_path);
            assert_cli_success(
                run_cli_json(['update', 'animator-state', animator_path, '--set-default-state', 'Walk']),
                'update-animator-default-state',
            );
            return [animator_asset_path];
        },
    },
    'create-material': {
        name: 'create-material',
        async run(context) {
            material_shader_setup(context.project_path);
            const material_asset_path = `${GENERATED_ASSET_DIR}/HeadlessMaterial.mat`;
            const material_path = join(context.project_path, material_asset_path);
            assert_cli_success(
                run_cli_json(['create', 'material', material_path, '--shader', TMP_SHADER_GUID]),
                'create-material',
            );
            return [material_asset_path];
        },
    },
    'update-material': {
        name: 'update-material',
        async run(context) {
            material_shader_setup(context.project_path);
            const material_asset_path = `${GENERATED_ASSET_DIR}/UpdatedMaterial.mat`;
            const material_path = join(context.project_path, material_asset_path);
            assert_cli_success(
                run_cli_json([
                    'create', 'material', material_path,
                    '--shader', TMP_SHADER_GUID,
                    '--properties', JSON.stringify({ floats: { _FaceDilate: 0.1 } }),
                ]),
                'update-material setup',
            );
            assert_cli_success(
                run_cli_json(['update', 'material', material_path, '--set', '_FaceDilate=0.3']),
                'update-material',
            );
            return [material_asset_path];
        },
    },
    'create-meta-script': {
        name: 'create-meta-script',
        async run(context) {
            const script_asset_path = 'Assets/Scripts/GeneratedMetaScript.cs';
            write_project_text_file(
                context.project_path,
                script_asset_path,
                mono_behaviour_script_content('GeneratedMetaScript'),
            );
            assert_cli_success(
                run_cli_json(['create', 'meta', join(context.project_path, script_asset_path)]),
                'create-meta-script',
            );
            return [script_asset_path];
        },
    },
    'update-meta-texture': {
        name: 'update-meta-texture',
        async run(context) {
            const texture_asset_path = `${GENERATED_ASSET_DIR}/Circle.png`;
            copy_external_fixture(context.project_path, 'Assets/Prefabs/Circle.png', texture_asset_path);
            copy_external_fixture(context.project_path, 'Assets/Prefabs/Circle.png.meta', `${texture_asset_path}.meta`);
            assert_cli_success(
                run_cli_json(['update', 'meta', join(context.project_path, texture_asset_path), '--read-write']),
                'update-meta-texture',
            );
            return [texture_asset_path];
        },
    },
    'create-scriptable-object': {
        name: 'create-scriptable-object',
        async run(context) {
            const script_asset_path = 'Assets/Scripts/HeadlessData.cs';
            const script_path = create_script_with_meta(
                context.project_path,
                script_asset_path,
                scriptable_object_script_content('HeadlessData'),
                'create-scriptable-object',
            );
            const asset_asset_path = `${GENERATED_ASSET_DIR}/HeadlessData.asset`;
            const asset_path = join(context.project_path, asset_asset_path);
            assert_cli_success(
                run_cli_json([
                    'create', 'scriptable-object', asset_path, script_path,
                    '--project', context.project_path,
                ]),
                'create-scriptable-object',
            );
            return [script_asset_path, asset_asset_path];
        },
    },
    'update-scriptable-object': {
        name: 'update-scriptable-object',
        async run(context) {
            const script_asset_path = 'Assets/Scripts/HeadlessMutableData.cs';
            const script_path = create_script_with_meta(
                context.project_path,
                script_asset_path,
                scriptable_object_script_content('HeadlessMutableData'),
                'update-scriptable-object',
            );
            const asset_asset_path = `${GENERATED_ASSET_DIR}/HeadlessMutableData.asset`;
            const asset_path = join(context.project_path, asset_asset_path);
            assert_cli_success(
                run_cli_json([
                    'create', 'scriptable-object', asset_path, script_path,
                    '--project', context.project_path,
                ]),
                'update-scriptable-object setup',
            );
            assert_cli_success(
                run_cli_json(['update', 'scriptable-object', asset_path, 'amount', '9']),
                'update-scriptable-object',
            );
            return [script_asset_path, asset_asset_path];
        },
    },
    'negative-harness': {
        name: 'negative-harness',
        expect_failure: true,
        expected_validation_error: `Target asset is missing: ${SCENE_ASSET_PATH}`,
        async run(_context, scene_path, scene_asset_path) {
            rmSync(scene_path, { force: true });
            return [scene_asset_path];
        },
    },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

export function analyze_unity_log(log_text: string): UnityLogSummary {
    const lines = log_text.split(/\r?\n/);
    const validation_errors = collect_prefixed_messages(lines, 'VALIDATION_ERROR:');
    const validation_warnings = collect_prefixed_messages(lines, 'VALIDATION_WARNING:');
    const compiler_errors = lines.filter((line) => /error CS\d+/i.test(line));
    const fatal_patterns = [
        /Scripts have compiler errors/i,
        /Aborting batchmode due to failure/i,
        /executeMethod class .* could not be found/i,
        /executeMethod method .* threw exception/i,
        /Unhandled exception/i,
        /YAMLException/i,
        /Failed to deserialize/i,
        /Error while importing/i,
    ];
    const licensing_patterns = [
        /com\.unity\.editor\.headless/i,
        /No valid Unity Editor license found/i,
        /Activation of your license failed/i,
        /offline grace period/i,
    ];
    const fatal_errors = lines.filter((line) => fatal_patterns.some((pattern) => pattern.test(line)));
    const licensing_errors = lines.filter((line) => licensing_patterns.some((pattern) => pattern.test(line)));

    return {
        validation_errors: unique_lines(validation_errors),
        validation_warnings: unique_lines(validation_warnings),
        compiler_errors: unique_lines(compiler_errors),
        fatal_errors: unique_lines(fatal_errors),
        licensing_errors: unique_lines(licensing_errors),
    };
}

function collect_prefixed_messages(lines: string[], prefix: string): string[] {
    return lines
        .filter((line) => line.includes(prefix))
        .map((line) => line.slice(line.indexOf(prefix) + prefix.length).trim());
}

function unique_lines(lines: string[]): string[] {
    return Array.from(new Set(lines.filter((line) => line.trim() !== '')));
}

function build_log_excerpt(log_text: string): string {
    const lines = log_text.trim().split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - 40)).join('\n');
}

function detect_early_unity_failure(log_text: string): { kind: 'licensing'; message: string } | null {
    if (/com\.unity\.editor\.headless/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing/headless entitlement failure detected.',
                'The log contains "com.unity.editor.headless was not found", which means batchmode could not obtain the required local licensing entitlement.',
                'Open Unity Hub, confirm the editor license is active, open the editor once normally, and then retry.',
            ].join(' '),
        };
    }

    if (/No valid Unity Editor license found/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing failure detected.',
                'No valid Unity Editor license was found in the batchmode log.',
                'Confirm the editor is activated in Unity Hub and retry after opening the editor normally once.',
            ].join(' '),
        };
    }

    if (/offline grace period/i.test(log_text) || /Activation of your license failed/i.test(log_text)) {
        return {
            kind: 'licensing',
            message: [
                'Unity licensing failure detected.',
                'The batchmode log indicates an offline-grace or activation problem.',
                'Reconnect Unity Hub, verify activation, and retry.',
            ].join(' '),
        };
    }

    return null;
}

async function run_unity_validation(unity_bin: string, project_path: string, timeout_ms: number): Promise<{ success: boolean; log_path: string; summary: UnityLogSummary; exit_code: number | null; message?: string }> {
    const log_path = join(project_path, 'unity-validation.log');
    const child = spawn(unity_bin, [
        '-batchmode',
        '-quit',
        '-projectPath',
        project_path,
        '-executeMethod',
        UNITY_EXECUTE_METHOD,
        '-logFile',
        log_path,
        '-silent-crashes',
    ], {
        cwd: project_path,
        stdio: 'ignore',
    });

    let spawn_error: Error | null = null;
    let exit_code: number | null = null;
    let termination_message: string | undefined;
    let timeout_handle: NodeJS.Timeout | null = null;
    let kill_handle: NodeJS.Timeout | null = null;
    let poll_handle: NodeJS.Timeout | null = null;

    const clear_handles = (): void => {
        if (timeout_handle) {
            clearTimeout(timeout_handle);
            timeout_handle = null;
        }
        if (kill_handle) {
            clearTimeout(kill_handle);
            kill_handle = null;
        }
        if (poll_handle) {
            clearInterval(poll_handle);
            poll_handle = null;
        }
    };

    const terminate_child = (message: string): void => {
        if (termination_message || child.exitCode !== null) {
            return;
        }

        termination_message = message;
        child.kill('SIGTERM');
        kill_handle = setTimeout(() => {
            if (child.exitCode === null) {
                child.kill('SIGKILL');
            }
        }, PROCESS_KILL_GRACE_MS);
    };

    await new Promise<void>((resolve_promise) => {
        child.once('error', (error) => {
            spawn_error = error;
            clear_handles();
            resolve_promise();
        });

        child.once('exit', (code) => {
            exit_code = code;
            clear_handles();
            resolve_promise();
        });

        timeout_handle = setTimeout(() => {
            terminate_child(`Unity validation timed out after ${timeout_ms}ms.`);
        }, timeout_ms);

        poll_handle = setInterval(() => {
            if (!existsSync(log_path)) {
                return;
            }

            const log_text = readFileSync(log_path, 'utf-8');
            const early_failure = detect_early_unity_failure(log_text);
            if (early_failure) {
                terminate_child(early_failure.message);
            }
        }, LOG_POLL_INTERVAL_MS);
    });

    if (spawn_error) {
        return {
            success: false,
            log_path,
            summary: { validation_errors: [], validation_warnings: [], compiler_errors: [], fatal_errors: [], licensing_errors: [] },
            exit_code,
            message: spawn_error.message,
        };
    }

    const log_text = existsSync(log_path) ? readFileSync(log_path, 'utf-8') : '';
    const summary = analyze_unity_log(log_text);
    const has_errors =
        summary.validation_errors.length > 0 ||
        summary.compiler_errors.length > 0 ||
        summary.fatal_errors.length > 0 ||
        summary.licensing_errors.length > 0;

    return {
        success: exit_code === 0 && !has_errors && !termination_message,
        log_path,
        summary,
        exit_code,
        message: termination_message ?? (has_errors ? build_log_excerpt(log_text) : undefined),
    };
}

function format_result_message(result: { exit_code: number | null; summary: UnityLogSummary; message?: string }): string {
    const parts = [`Unity exit code: ${result.exit_code ?? 'null'}`];

    if (result.summary.validation_errors.length > 0) {
        parts.push(`Validation errors: ${result.summary.validation_errors.join(' | ')}`);
    }
    if (result.summary.compiler_errors.length > 0) {
        parts.push(`Compiler errors: ${result.summary.compiler_errors.join(' | ')}`);
    }
    if (result.summary.fatal_errors.length > 0) {
        parts.push(`Fatal log lines: ${result.summary.fatal_errors.join(' | ')}`);
    }
    if (result.summary.licensing_errors.length > 0) {
        parts.push(`Licensing errors: ${result.summary.licensing_errors.join(' | ')}`);
    }
    if (result.message) {
        parts.push(result.message);
    }

    return parts.join('\n');
}

function expected_failure_matched(result: { summary: UnityLogSummary }, scenario: ScenarioDefinition): boolean {
    if (!scenario.expected_validation_error) {
        return false;
    }

    if (!result.summary.validation_errors.includes(scenario.expected_validation_error)) {
        return false;
    }

    return (
        result.summary.compiler_errors.length === 0 &&
        result.summary.fatal_errors.length === 0 &&
        result.summary.licensing_errors.length === 0
    );
}

async function run_scenario(name: string, options: RunnerOptions): Promise<boolean> {
    const scenario = SCENARIOS[name];
    const project_path = copy_fixture_project();
    const scene_path = join(project_path, SCENE_ASSET_PATH);
    const context: ScenarioContext = {
        project_path,
        unity_bin: options.unity_bin,
        timeout_ms: options.timeout_ms,
        bootstrapped: false,
    };

    let preserve_temp = options.keep_temp;
    const started_at = Date.now();

    try {
        const targets = await scenario.run(context, scene_path, SCENE_ASSET_PATH);
        write_validation_manifest(project_path, targets);

        const result = await run_unity_validation(options.unity_bin, project_path, options.timeout_ms);
        const duration_ms = Date.now() - started_at;

        if (scenario.expect_failure) {
            if (result.success) {
                preserve_temp = true;
                console.error(`FAIL ${name} (${duration_ms}ms)`);
                console.error('  Expected validation to fail, but Unity exited cleanly.');
                console.error(`  Temp project: ${project_path}`);
                return false;
            }

            if (!expected_failure_matched(result, scenario)) {
                preserve_temp = true;
                console.error(`FAIL ${name} (${duration_ms}ms)`);
                console.error('  Unity failed, but not for the expected validation reason.');
                console.error(`  Expected validation error: ${scenario.expected_validation_error ?? 'none configured'}`);
                console.error(`  ${format_result_message(result)}`);
                console.error(`  Temp project: ${project_path}`);
                return false;
            }

            if (!options.keep_temp) {
                rmSync(project_path, { recursive: true, force: true });
            } else {
                console.log(`KEEP ${name} temp project: ${project_path}`);
            }

            console.log(`PASS ${name} (${duration_ms}ms)`);
            return true;
        }

        if (!result.success) {
            preserve_temp = true;
            console.error(`FAIL ${name} (${duration_ms}ms)`);
            console.error(`  ${format_result_message(result)}`);
            console.error(`  Temp project: ${project_path}`);
            return false;
        }

        if (options.keep_temp) {
            console.log(`KEEP ${name} temp project: ${project_path}`);
        } else {
            rmSync(project_path, { recursive: true, force: true });
        }

        console.log(`PASS ${name} (${duration_ms}ms)`);
        return true;
    } catch (error) {
        preserve_temp = true;
        console.error(`FAIL ${name}`);
        console.error(`  ${(error as Error).message}`);
        console.error(`  Temp project: ${project_path}`);
        return false;
    } finally {
        if (!preserve_temp && existsSync(project_path)) {
            rmSync(project_path, { recursive: true, force: true });
        }
    }
}

function resolve_requested_scenarios(requested_scenario: string): string[] {
    if (requested_scenario === 'all') {
        return SCENARIO_NAMES;
    }

    if (!(requested_scenario in SCENARIOS)) {
        throw new Error(`Unknown scenario: ${requested_scenario}`);
    }

    return [requested_scenario];
}

async function main(): Promise<void> {
    ensure_cli_is_built();
    const options = parse_args(process.argv.slice(2));

    if (!existsSync(options.unity_bin)) {
        throw new Error(`Unity binary not found: ${options.unity_bin}`);
    }

    let failures = 0;
    const scenario_names = resolve_requested_scenarios(options.scenario);

    for (const scenario_name of scenario_names) {
        if (!await run_scenario(scenario_name, options)) {
            failures += 1;
        }
    }

    if (failures > 0) {
        throw new Error(`${failures} headless validation scenario(s) failed`);
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error((error as Error).message);
        process.exit(1);
    });
}
