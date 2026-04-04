#!/usr/bin/env bun
import { program } from 'commander';
import { UnityScanner, isNativeModuleAvailable, getNativeModuleError } from './scanner';
import { setup } from './setup';
import { cleanup } from './cleanup';
import { build_create_command } from './cmd-create';
import { build_read_command } from './cmd-read';
import { build_update_command } from './cmd-update';
import { build_delete_command } from './cmd-delete';
import { build_editor_command } from './cmd-editor';
import { duplicateGameObject } from './editor';
import { search_project, grep_project } from './project-search';
import type { ProjectGrepFileType, ProjectSearchOptions, GameObjectWithComponents, Component } from './types';
import { read_project_version } from './build-version';
import { find_unity_project_root, glob_match, resolve_project_path } from './utils';
import { load_guid_cache } from './guid-cache';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Version is inlined at build time by bun's bundler (no runtime path resolution)
const VERSION: string = (require('../package.json') as { version: string }).version;

if (!(process as any).versions.bun) {
  console.error('CRITICAL ERROR: This tool MUST be run with BUN.');
  console.error('You are currently using: Node.js');
  console.error('Please run with: bun unity-agentic-tools/dist/cli.js <command>');
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
  .name('unity-agentic-tools')
  .description('Fast, token-efficient Unity YAML parser')
  .version(VERSION);

// CRUD command groups
program.addCommand(build_create_command());
program.addCommand(build_read_command(getScanner));
program.addCommand(build_update_command(getScanner));
program.addCommand(build_delete_command());
program.addCommand(build_editor_command());

// Clone command (top-level — duplicates a GameObject and its hierarchy)
program.command('clone <file> <object_name>')
  .description('Duplicate a GameObject and its hierarchy')
  .option('-n, --name <new_name>', 'Name for the duplicated object')
  .option('-j, --json', 'Output as JSON')
  .action((file, object_name, options) => {
    const result = duplicateGameObject({
      file_path: file,
      object_name: object_name,
      new_name: options.name,
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  });

// Search command (top-level — auto-detects file vs directory)
// File path → single-file find (like old `find`)
// Directory → project-wide search (like old `search`)
program.command('search <path> [pattern]')
  .description('Search for GameObjects. File path: find by name. Directory: search across project')
  .option('-n, --name <pattern>', 'Search by GameObject name (project mode, supports wildcards)')
  .option('-e, --exact', 'Use exact name matching (default is substring/fuzzy)')
  .option('-c, --component <type>', 'Filter by component type')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-l, --layer <index>', 'Filter by layer index')
  .option('-T, --type <type>', 'File type filter: scene, prefab, mat, anim, controller, asset, all', 'all')
  .option('-m, --max-matches <n>', 'Max total matches (caps results across all files)')
  .option('-j, --json', 'Output as JSON')
  .action((search_path, pattern, options) => {
    const { existsSync, statSync } = require('fs');
    if (!existsSync(search_path)) {
      console.log(JSON.stringify({ success: false, error: `Path not found: ${search_path}` }, null, 2));
      process.exit(1);
    }

    const stat = statSync(search_path);
    if (stat.isDirectory()) {
      // Resolve to absolute and try to find Unity project root
      const abs_path = path.resolve(search_path);
      const project_root = find_unity_project_root(abs_path);
      if (project_root) {
        search_path = project_root;
      }
    }
    if (stat.isFile()) {
      // File mode — single-file search
      // Pattern can come from positional arg or --name flag
      const effective_pattern = pattern || options.name;
      const has_filters = !!(options.tag || options.layer !== undefined || options.component);

      if (!effective_pattern && !has_filters) {
        console.log(JSON.stringify({ error: 'Provide a name pattern (positional or --name) or filter flags (--tag, --layer, --component)' }, null, 2));
        process.exit(1);
      }

      const scanner = getScanner();

      if (!has_filters && effective_pattern) {
        // Fast path: name-only search via find_by_name
        const fuzzy = options.exact !== true;
        const result = scanner.find_by_name(search_path, effective_pattern, fuzzy);
        console.log(JSON.stringify({
          file: search_path,
          pattern: effective_pattern,
          fuzzy,
          count: result.length,
          matches: result,
        }, null, 2));
      } else {
        // Filter path: use metadata/component scan + post-filter
        let gameObjects: GameObjectWithComponents[] = options.component
          ? scanner.scan_scene_with_components(search_path)
          : scanner.scan_scene_metadata(search_path);

        // Apply name filter if provided
        if (effective_pattern) {
          const nameLower = effective_pattern.toLowerCase();
          const hasWildcard = effective_pattern.includes('*') || effective_pattern.includes('?');
          const fuzzy = options.exact !== true;
          gameObjects = gameObjects.filter((go: GameObjectWithComponents) => {
            if (!go.name) return false;
            if (hasWildcard) return glob_match(effective_pattern, go.name);
            if (!fuzzy) return go.name === effective_pattern;
            return go.name.toLowerCase().includes(nameLower);
          });
        }

        // Apply tag filter
        if (options.tag) {
          gameObjects = gameObjects.filter((go: GameObjectWithComponents) => go.tag === options.tag);
        }

        // Apply layer filter
        if (options.layer !== undefined) {
          const layerNum = parseInt(options.layer, 10);
          gameObjects = gameObjects.filter((go: GameObjectWithComponents) => go.layer === layerNum);
        }

        // Apply component filter
        if (options.component) {
          gameObjects = gameObjects.filter((go: GameObjectWithComponents) =>
            go.components?.some((c: Component) => glob_match(options.component, c.type))
          );
        }

        const matches = gameObjects.map((go: GameObjectWithComponents) => ({
          game_object: go.name,
          file_id: go.file_id,
          tag: go.tag,
          layer: go.layer,
          ...(go.components?.length ? { components: go.components.map((c: Component) => c.type) } : {}),
        }));

        console.log(JSON.stringify({
          file: search_path,
          ...(effective_pattern ? { pattern: effective_pattern } : {}),
          filters: {
            ...(options.tag ? { tag: options.tag } : {}),
            ...(options.layer !== undefined ? { layer: parseInt(options.layer, 10) } : {}),
            ...(options.component ? { component: options.component } : {}),
          },
          count: matches.length,
          matches,
        }, null, 2));
      }
    } else {
      // Directory mode — project-wide search (like old `search` command)
      const VALID_SEARCH_TYPES = ['scene', 'prefab', 'mat', 'anim', 'controller', 'asset', 'all'];
      if (!VALID_SEARCH_TYPES.includes(options.type)) {
        console.log(JSON.stringify({ error: `Invalid file type "${options.type}". Valid types: ${VALID_SEARCH_TYPES.join(', ')}` }, null, 2));
        process.exit(1);
      }
      const result = search_project({
        project_path: search_path,
        name: pattern || options.name,
        exact: options.exact === true,
        component: options.component,
        tag: options.tag,
        layer: options.layer !== undefined ? parseInt(options.layer, 10) : undefined,
        file_type: options.type as ProjectSearchOptions['file_type'],
        max_matches: options.maxMatches ? parseInt(options.maxMatches, 10) : undefined,
      });

      console.log(JSON.stringify(result, null, 2));
    }
  });

// Grep command (top-level — regex search across project)
program.command('grep <pattern>')
  .description('Search for a regex pattern across project files')
  .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
  .option('--type <type>', 'File type filter: cs, yaml, unity, prefab, asset, all', 'all')
  .option('-m, --max <n>', 'Max results (default: 100)', '100')
  .option('-C, --context <n>', 'Context lines around matches', '0')
  .option('-j, --json', 'Output as JSON')
  .action((pattern, options) => {
    if (!pattern || pattern.trim() === '') {
      console.log(JSON.stringify({ success: false, error: 'Pattern must not be empty' }, null, 2));
      process.exit(1);
    }
    let project_path = resolve_project_path(options.project);
    const abs_path = path.resolve(project_path);
    const project_root = find_unity_project_root(abs_path);
    if (project_root) {
      project_path = project_root;
    }
    const VALID_GREP_TYPES = ['cs', 'yaml', 'unity', 'prefab', 'asset', 'mat', 'anim', 'controller', 'all'];
    if (!VALID_GREP_TYPES.includes(options.type)) {
      console.log(JSON.stringify({ success: false, error: `Invalid file type "${options.type}". Valid types: ${VALID_GREP_TYPES.join(', ')}` }, null, 2));
      process.exit(1);
    }
    const parsed_max = parseInt(options.max, 10);
    if (isNaN(parsed_max) || parsed_max < 1) {
      console.log(JSON.stringify({ success: false, error: `Invalid --max value "${options.max}". Must be a positive integer.` }, null, 2));
      process.exitCode = 1;
      return;
    }
    const result = grep_project({
      project_path,
      pattern,
      file_type: options.type as ProjectGrepFileType,
      max_results: parsed_max,
      context_lines: parseInt(options.context, 10) || 0,
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  });

// Version command (top-level — reads Unity project version)
program.command('version')
  .description('Read Unity project version')
  .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    try {
      const project_path = resolve_project_path(options.project);
      const version = read_project_version(project_path);
      console.log(JSON.stringify(version, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
      process.exit(1);
    }
  });

// Docs command (top-level — searches Unity documentation)
program.command('docs <query>')
  .description('Search Unity documentation (auto-indexes on first use)')
  .option('-j, --json', 'Output as JSON')
  .action((query, options) => {
    const { existsSync } = require('fs');
    // Resolve paths at runtime (bun hardcodes __dirname at build time)
    const cliDir = path.dirname(path.resolve(process.argv[1]));
    // Bundled (npm install): dist/doc-indexer-cli.js alongside dist/cli.js
    // Dev (workspace): ../../doc-indexer/dist/cli.js from dist/
    const bundledPath = path.join(cliDir, 'doc-indexer-cli.js');
    const workspacePath = path.join(cliDir, '..', '..', 'doc-indexer', 'dist', 'cli.js');
    const docIndexerPath = existsSync(bundledPath) ? bundledPath : workspacePath;
    const projectRoot = find_unity_project_root();
    const globalArgs: string[] = [];
    if (projectRoot) {
      globalArgs.push('--project-root', projectRoot);
      const storagePath = path.join(projectRoot, '.unity-agentic', 'doc-index.json');
      globalArgs.push('--storage-path', storagePath);
    }

    const args = [docIndexerPath, ...globalArgs, 'search', query];
    if (options.json) args.push('-j');

    // ✅ SAFE: Use spawn with an array of arguments to avoid shell command injection.
    // Unlike exec(), spawn() does not invoke a shell, treating user input as literal text.
    const child = spawn('bun', args, { stdio: 'inherit' });

    child.on('error', (error: Error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        process.exit(code ?? 1);
      }
    });
  });

// Setup command
program.command('setup')
  .description('Set up unity-agentic tools for a Unity project')
  .option('-p, --project <path>', 'Path to Unity project (defaults to current directory)')
  .option('--index-docs', 'Also create documentation index')
  .option('-j, --json', 'Output as JSON')
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
  .option('-j, --json', 'Output as JSON')
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
  .option('-j, --json', 'Output as JSON')
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
      const guidCacheObj = load_guid_cache(projectPath);
      guidCacheCount = guidCacheObj?.count ?? 0;
    } catch {
      // Ignore errors
    }

    const status = {
      project_path: projectPath,
      configured: config !== null,
      config: config,
      guid_cache_count: guidCacheCount,
      runtime: 'bun',
      version: VERSION,
      native_module: isNativeModuleAvailable(),
      native_module_error: isNativeModuleAvailable() ? null : getNativeModuleError(),
    };

    console.log(JSON.stringify(status, null, 2));
  });

program.parse();
