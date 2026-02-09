#!/usr/bin/env bun
import { program } from 'commander';
import { UnityScanner, isNativeModuleAvailable, getNativeModuleError } from './scanner';
import { setup } from './setup';
import { cleanup } from './cleanup';
import * as path from 'path';
const { exec } = require('child_process');

if (!(process as any).versions.bun) {
  console.error('CRITICAL ERROR: This tool MUST be run with BUN.');
  console.error('You are currently using: Node.js');
  console.error('Please run with: bun unity-yaml/dist/cli.js <command>');
  process.exit(1);
}

// Lazily create scanner only when needed
let _scanner: UnityScanner | null = null;
function getScanner(): UnityScanner {
  if (!_scanner) {
    if (!isNativeModuleAvailable()) {
      console.error(getNativeModuleError());
      process.exit(1);
    }
    _scanner = new UnityScanner();
  }
  return _scanner;
}

program
  .name('unity-yaml')
  .description('Fast, token-efficient Unity YAML parser')
  .version('1.0.0');

// List command
program.command('list <file>')
  .description('List GameObject hierarchy in Unity file')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal Unity IDs')
  .option('--page-size <n>', 'Max objects per page (default 200, max 1000)', '200')
  .option('--cursor <n>', 'Start offset for pagination (default 0)', '0')
  .option('--max-depth <n>', 'Max hierarchy depth (default 10, max 50)', '10')
  .action((file, options) => {
    const pageSize = Math.min(parseInt(options.pageSize, 10) || 200, 1000);
    const cursor = parseInt(options.cursor, 10) || 0;
    const maxDepth = Math.min(parseInt(options.maxDepth, 10) || 10, 50);

    const result = getScanner().inspect_all_paginated({
      file,
      verbose: options.verbose === true,
      page_size: pageSize,
      cursor,
      max_depth: maxDepth,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Find command
program.command('find <file> <pattern>')
  .description('Find GameObjects and PrefabInstances by name pattern')
  .option('-e, --exact', 'Use exact matching')
  .option('-j, --json', 'Output as JSON')
  .action((file, pattern, options) => {
    const fuzzy = options.exact !== true;
    const result = getScanner().find_by_name(file, pattern, fuzzy);
    const output = {
      file,
      pattern,
      fuzzy,
      count: result.length,
      matches: result,
    };
    console.log(JSON.stringify(output, null, 2));
  });

// Get command
program.command('get <file> <object_id>')
  .description('Get GameObject details by ID')
  .option('-c, --component <type>', 'Get specific component type')
  .option('-p, --properties', 'Include component properties')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal Unity IDs')
  .action((file, object_id, options) => {
    const result = getScanner().inspect({
      file,
      identifier: object_id,
      include_properties: options.properties === true,
      verbose: options.verbose
    });

    if (!result) {
      console.log(JSON.stringify({ error: `GameObject with ID ${object_id} not found` }, null, 2));
      return;
    }

    if (options.component) {
      const comp = result.components.find((c: any) => c.type === options.component);
      if (comp) {
        console.log(JSON.stringify({ file, component: comp }, null, 2));
        return;
      }
    }

    console.log(JSON.stringify({ file, object: result }, null, 2));
  });

// Inspect command
program.command('inspect <file> [identifier]')
  .description('Inspect Unity file or specific GameObject')
  .option('-p, --properties', 'Include component properties')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal Unity IDs')
  .option('--page-size <n>', 'Max objects per page when no identifier (default 200)')
  .option('--cursor <n>', 'Start offset for pagination (default 0)')
  .option('--max-depth <n>', 'Max hierarchy depth (default 10)')
  .action((file, identifier, options) => {
    // If no identifier provided, inspect the entire file (with pagination)
    if (!identifier) {
      const result = getScanner().inspect_all_paginated({
        file,
        include_properties: options.properties === true,
        verbose: options.verbose === true,
        page_size: options.pageSize ? Math.min(parseInt(options.pageSize, 10), 1000) : undefined,
        cursor: options.cursor ? parseInt(options.cursor, 10) : undefined,
        max_depth: options.maxDepth ? Math.min(parseInt(options.maxDepth, 10), 50) : undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const result = getScanner().inspect({
      file,
      identifier,
      include_properties: options.properties === true,
      verbose: options.verbose
    });

    if (!result) {
      console.log(JSON.stringify({ error: `GameObject '${identifier}' not found` }, null, 2));
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  });

// Inspect-all command
program.command('inspect-all <file>')
  .description('Inspect entire Unity file with all details')
  .option('-p, --properties', 'Include component properties')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal Unity IDs')
  .option('--page-size <n>', 'Max objects per page (default 200, max 1000)')
  .option('--cursor <n>', 'Start offset for pagination (default 0)')
  .option('--max-depth <n>', 'Max hierarchy depth (default 10, max 50)')
  .action((file, options) => {
    const result = getScanner().inspect_all_paginated({
      file,
      include_properties: options.properties === true,
      verbose: options.verbose === true,
      page_size: options.pageSize ? Math.min(parseInt(options.pageSize, 10), 1000) : undefined,
      cursor: options.cursor ? parseInt(options.cursor, 10) : undefined,
      max_depth: options.maxDepth ? Math.min(parseInt(options.maxDepth, 10), 50) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Edit command
import { editProperty, createGameObject, editTransform, addComponent, createPrefabVariant, editComponentByFileId, removeComponent, deleteGameObject, copyComponent, duplicateGameObject, createScriptableObject, unpackPrefab, reparentGameObject, createMetaFile } from './editor';

program.command('edit <file> <object_name> <property> <value>')
  .description('Edit GameObject property value safely')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, property, value, _options) => {
    const result = editProperty({
      file_path: file,
      object_name: object_name,
      property: property,
      new_value: value
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Create command
program.command('create <file> <name>')
  .description('Create a new GameObject in a Unity file')
  .option('-p, --parent <name|id>', 'Parent GameObject name or Transform fileID')
  .option('-j, --json', 'Output as JSON')
  .action((file, name, options) => {
    let parent: string | number | undefined;
    if (options.parent) {
      // Check if it's a number (Transform fileID)
      const asNumber = parseInt(options.parent, 10);
      parent = isNaN(asNumber) ? options.parent : asNumber;
    }

    const result = createGameObject({
      file_path: file,
      name: name,
      parent: parent
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Edit transform command
program.command('edit-transform <file> <transform_id>')
  .description('Edit Transform component properties by fileID')
  .option('-p, --position <x,y,z>', 'Set local position')
  .option('-r, --rotation <x,y,z>', 'Set local rotation (Euler angles in degrees)')
  .option('-s, --scale <x,y,z>', 'Set local scale')
  .option('-j, --json', 'Output as JSON')
  .action((file, transform_id, options) => {
    const parseVector = (str: string) => {
      const parts = str.split(',').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) {
        console.error('Invalid vector format. Use: x,y,z (e.g., 1,2,3)');
        process.exit(1);
      }
      return { x: parts[0], y: parts[1], z: parts[2] };
    };

    const result = editTransform({
      file_path: file,
      transform_id: parseInt(transform_id, 10),
      position: options.position ? parseVector(options.position) : undefined,
      rotation: options.rotation ? parseVector(options.rotation) : undefined,
      scale: options.scale ? parseVector(options.scale) : undefined
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Add component command
program.command('add-component <file> <object_name> <component>')
  .description('Add any Unity component (e.g., MeshRenderer, Animator, Rigidbody) or custom script')
  .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, component, options) => {
    const result = addComponent({
      file_path: file,
      game_object_name: object_name,
      component_type: component,
      project_path: options.project
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Edit component by file ID command
program.command('edit-component <file> <file_id> <property> <value>')
  .description('Edit any component property by file ID. Supports dotted paths (m_LocalPosition.x) and array paths (m_Materials.Array.data[0])')
  .option('-j, --json', 'Output as JSON')
  .action((file, file_id, property, value, _options) => {
    const result = editComponentByFileId({
      file_path: file,
      file_id: file_id,
      property: property,
      new_value: value
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Create prefab variant command
program.command('create-variant <source_prefab> <output_path>')
  .description('Create a Prefab Variant from a source prefab')
  .option('-n, --name <name>', 'Override variant name')
  .option('-j, --json', 'Output as JSON')
  .action((source_prefab, output_path, options) => {
    const result = createPrefabVariant({
      source_prefab,
      output_path,
      variant_name: options.name
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Remove component command
program.command('remove-component <file> <file_id>')
  .description('Remove a component from a Unity file by file ID')
  .option('-j, --json', 'Output as JSON')
  .action((file, file_id, _options) => {
    const result = removeComponent({
      file_path: file,
      file_id: file_id
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Delete command
program.command('delete <file> <object_name>')
  .description('Delete a GameObject and its hierarchy from a Unity file')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, _options) => {
    const result = deleteGameObject({
      file_path: file,
      object_name: object_name
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Copy component command
program.command('copy-component <file> <source_file_id> <target_object_name>')
  .description('Copy a component to a target GameObject')
  .option('-j, --json', 'Output as JSON')
  .action((file, source_file_id, target_object_name, _options) => {
    const result = copyComponent({
      file_path: file,
      source_file_id: source_file_id,
      target_game_object_name: target_object_name
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Duplicate command
program.command('duplicate <file> <object_name>')
  .description('Duplicate a GameObject and its hierarchy')
  .option('-n, --name <new_name>', 'Name for the duplicated object')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, options) => {
    const result = duplicateGameObject({
      file_path: file,
      object_name: object_name,
      new_name: options.name
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Create ScriptableObject command
program.command('create-scriptable-object <output_path> <script>')
  .description('Create a new ScriptableObject .asset file')
  .option('-p, --project <path>', 'Unity project path (for script GUID lookup)')
  .option('-j, --json', 'Output as JSON')
  .action((output_path, script, options) => {
    const result = createScriptableObject({
      output_path: output_path,
      script: script,
      project_path: options.project
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Unpack prefab command
program.command('unpack-prefab <file> <prefab_instance>')
  .description('Unpack a PrefabInstance into standalone GameObjects')
  .option('-p, --project <path>', 'Unity project path (for GUID cache lookup)')
  .option('-j, --json', 'Output as JSON')
  .action((file, prefab_instance, options) => {
    const result = unpackPrefab({
      file_path: file,
      prefab_instance: prefab_instance,
      project_path: options.project
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Reparent command
program.command('reparent <file> <object_name> <new_parent>')
  .description('Move a GameObject under a new parent. Use "root" to move to scene root')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, new_parent, _options) => {
    const result = reparentGameObject({
      file_path: file,
      object_name: object_name,
      new_parent: new_parent
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Create meta file command
program.command('create-meta <script_path>')
  .description('Generate a Unity .meta file for a script (MonoImporter)')
  .option('-j, --json', 'Output as JSON')
  .action((script_path, _options) => {
    const result = createMetaFile({
      script_path: script_path
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Read asset command
program.command('read-asset <file>')
  .description('Read a .asset file (ScriptableObject) and show its objects with properties')
  .option('-j, --json', 'Output as JSON')
  .action((file, _options) => {
    const objects = getScanner().read_asset(file);
    const output = {
      file,
      count: objects.length,
      objects,
    };
    console.log(JSON.stringify(output, null, 2));
  });

// Edit asset command
program.command('edit-asset <file> <property> <value>')
  .description('Edit a property in the first MonoBehaviour block of a .asset file')
  .option('-j, --json', 'Output as JSON')
  .action((file, property, value, _options) => {
    // Read the asset to find the first MonoBehaviour (class_id 114) file_id
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

// Settings commands
import { read_settings, edit_settings, edit_tag, edit_layer, edit_sorting_layer } from './settings';

program.command('read-settings <project_path>')
  .description('Read Unity project settings (TagManager, DynamicsManager, QualitySettings, TimeManager, etc.)')
  .option('-s, --setting <name>', 'Setting name or alias (tags, physics, quality, time)', 'TagManager')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, options) => {
    const result = read_settings({
      project_path,
      setting: options.setting,
    });

    console.log(JSON.stringify(result, null, 2));
  });

program.command('edit-settings <project_path>')
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

program.command('edit-tag <project_path> <action> <tag>')
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

program.command('edit-layer <project_path> <index> <name>')
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

program.command('edit-sorting-layer <project_path> <action> <name>')
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

// Create scene command
import { createScene } from './editor';

program.command('create-scene <output_path>')
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

// Project search commands
import { search_project, grep_project } from './project-search';

program.command('search <project_path>')
  .description('Search across all scene/prefab files in a Unity project')
  .option('-n, --name <pattern>', 'Search by GameObject name (supports wildcards)')
  .option('-c, --component <type>', 'Filter by component type')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-l, --layer <index>', 'Filter by layer index')
  .option('--type <type>', 'File type filter: scene, prefab, all', 'all')
  .option('--page-size <n>', 'Max files per page', '50')
  .option('--cursor <n>', 'Start offset for pagination', '0')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, options) => {
    const result = search_project({
      project_path,
      name: options.name,
      component: options.component,
      tag: options.tag,
      layer: options.layer !== undefined ? parseInt(options.layer, 10) : undefined,
      file_type: options.type as 'scene' | 'prefab' | 'all',
      page_size: parseInt(options.pageSize, 10) || 50,
      cursor: parseInt(options.cursor, 10) || 0,
    });

    console.log(JSON.stringify(result, null, 2));
  });

program.command('grep <project_path> <pattern>')
  .description('Search for a regex pattern across project files')
  .option('--type <type>', 'File type filter: cs, yaml, unity, prefab, asset, all', 'all')
  .option('-m, --max <n>', 'Max results', '100')
  .option('-C, --context <n>', 'Context lines around matches', '0')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, pattern, options) => {
    const result = grep_project({
      project_path,
      pattern,
      file_type: options.type as any,
      max_results: parseInt(options.max, 10) || 100,
      context_lines: parseInt(options.context, 10) || 0,
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Search docs command (uses doc-indexer CLI)
import { find_unity_project_root } from './utils';

program.command('search-docs <query>')
  .description('Search Unity documentation (auto-indexes on first use)')
  .option('-s, --summarize', 'Summarize results')
  .option('-c, --compress', 'Compress results')
  .option('-j, --json', 'Output as JSON')
  .action((query, options) => {
    const docIndexerPath = path.join(__dirname, '..', '..', 'doc-indexer', 'dist', 'cli.js');
    const projectRoot = find_unity_project_root();
    const globalArgs: string[] = [];
    if (projectRoot) {
      globalArgs.push('--project-root', projectRoot);
      const storagePath = path.join(projectRoot, '.unity-agentic', 'doc-index.json');
      globalArgs.push('--storage-path', storagePath);
    }

    const args = [docIndexerPath, ...globalArgs, 'search', JSON.stringify(query)];
    if (options.summarize) args.push('-s');
    if (options.compress) args.push('-c');
    if (options.json) args.push('-j');

    exec(`bun ${args.join(' ')}`, (error, stdout, stderr) => {
      if (stderr) process.stderr.write(stderr);
      if (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }

      console.log(stdout);
    });
  });

// Index docs command
program.command('index-docs [path]')
  .description('Index Unity documentation (auto-discovers sources if no path given)')
  .action((pathArg) => {
    const docIndexerPath = path.join(__dirname, '..', '..', 'doc-indexer', 'dist', 'cli.js');
    const projectRoot = find_unity_project_root();
    const globalArgs: string[] = [];
    if (projectRoot) {
      globalArgs.push('--project-root', projectRoot);
      const storagePath = path.join(projectRoot, '.unity-agentic', 'doc-index.json');
      globalArgs.push('--storage-path', storagePath);
    }

    const args = [docIndexerPath, ...globalArgs, 'index'];
    if (pathArg) args.push(pathArg);

    exec(`bun ${args.join(' ')}`, (error, stdout, stderr) => {
      if (stderr) process.stderr.write(stderr);
      if (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }

      console.log(stdout);
    });
  });

// Build settings bridge commands
import { get_build_settings, add_scene, remove_scene, enable_scene, disable_scene, move_scene, read_project_version } from '../../unity-build-settings/src/index';

program.command('build-settings <project_path>')
  .description('Read build settings (scene list, build profiles)')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, _options) => {
    try {
      const result = get_build_settings(project_path);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

program.command('build-add-scene <project_path> <scene_path>')
  .description('Add a scene to build settings')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, scene_path, _options) => {
    try {
      const result = add_scene(project_path, scene_path);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

program.command('build-remove-scene <project_path> <scene_path>')
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

program.command('build-enable-scene <project_path> <scene_path>')
  .description('Enable a scene in build settings')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, scene_path, _options) => {
    try {
      const result = enable_scene(project_path, scene_path);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

program.command('build-disable-scene <project_path> <scene_path>')
  .description('Disable a scene in build settings')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, scene_path, _options) => {
    try {
      const result = disable_scene(project_path, scene_path);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

program.command('build-move-scene <project_path> <scene_path> <new_index>')
  .description('Move a scene to a new position in build settings')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, scene_path, new_index, _options) => {
    try {
      const result = move_scene(project_path, scene_path, parseInt(new_index, 10));
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

program.command('project-version <project_path>')
  .description('Read Unity project version')
  .option('-j, --json', 'Output as JSON')
  .action((project_path, _options) => {
    try {
      const version = read_project_version(project_path);
      console.log(JSON.stringify(version, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
    }
  });

// Setup command
program.command('setup')
  .description('Set up unity-agentic tools for a Unity project')
  .option('-p, --project <path>', 'Path to Unity project (defaults to current directory)')
  .option('--index-docs', 'Also create documentation index')
  .action((options) => {
    const result = setup({
      project: options.project,
      indexDocs: options.indexDocs,
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      process.exit(1);
    }
  });

// Cleanup command
program.command('cleanup')
  .description('Clean up unity-agentic files from a Unity project')
  .option('-p, --project <path>', 'Path to Unity project (defaults to current directory)')
  .option('--all', 'Remove entire .unity-agentic directory')
  .action((options) => {
    const result = cleanup({
      project: options.project,
      all: options.all,
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Status command
program.command('status')
  .description('Show current configuration and status')
  .option('-p, --project <path>', 'Path to Unity project (defaults to current directory)')
  .action((options) => {
    const projectPath = path.resolve(options.project || process.cwd());
    const configPath = path.join(projectPath, '.unity-agentic');
    const configFile = path.join(configPath, 'config.json');

    let config = null;
    let guidCacheCount = 0;

    try {
      const { existsSync, readFileSync } = require('fs');
      if (existsSync(configFile)) {
        config = JSON.parse(readFileSync(configFile, 'utf-8'));
      }
      const guidCachePath = path.join(configPath, 'guid-cache.json');
      if (existsSync(guidCachePath)) {
        const guidCache = JSON.parse(readFileSync(guidCachePath, 'utf-8'));
        guidCacheCount = Object.keys(guidCache).length;
      }
    } catch {
      // Ignore errors
    }

    const status = {
      project_path: projectPath,
      configured: config !== null,
      config: config,
      guid_cache_count: guidCacheCount,
      runtime: 'bun',
      version: '1.0.0',
      native_module: isNativeModuleAvailable(),
      native_module_error: isNativeModuleAvailable() ? null : getNativeModuleError(),
    };

    console.log(JSON.stringify(status, null, 2));
  });

program.parse();
