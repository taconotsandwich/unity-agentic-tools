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
  .action((file, options) => {
    const result = getScanner().scan_scene_with_components(file, { verbose: options.verbose });
    const output = {
      file,
      count: result.length,
      objects: result,
    };
    console.log(JSON.stringify(output, null, 2));
  });

// Find command
program.command('find <file> <pattern>')
  .description('Find GameObjects by name pattern')
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
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal Unity IDs')
  .action((file, object_id, options) => {
    const result = getScanner().inspect({
      file,
      identifier: object_id,
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
  .action((file, identifier, options) => {
    // If no identifier provided, inspect the entire file
    if (!identifier) {
      const result = getScanner().inspect_all(
        file,
        options.properties === true,
        options.verbose === true
      );
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
  .action((file, options) => {
    const result = getScanner().inspect_all(
      file,
      options.properties === true,
      options.verbose === true
    );
    console.log(JSON.stringify(result, null, 2));
  });

// Edit command
import { editProperty, createGameObject } from './editor';

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
  .option('-j, --json', 'Output as JSON')
  .action((file, name, _options) => {
    const result = createGameObject({
      file_path: file,
      name: name
    });

    console.log(JSON.stringify(result, null, 2));
  });

// Search docs command (uses doc-indexer CLI)
program.command('search-docs <query>')
  .description('Search Unity documentation')
  .option('--summarize', '-s', 'Summarize results')
  .option('--compress', '-c', 'Compress results')
  .option('-j, --json', 'Output as JSON')
  .action((query, options) => {
    const docIndexerPath = path.join(__dirname, '..', '..', 'doc-indexer', 'dist', 'cli.js');
    const args = [docIndexerPath, 'search', query];
    if (options.summarize) args.push('-s');
    if (options.compress) args.push('-c');
    if (options.json) args.push('-j');

    exec(`bun ${args.join(' ')}`, (error, stdout, _stderr) => {
      if (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }

      console.log(stdout);
    });
  });

// Index docs command
program.command('index-docs <path>')
  .description('Index Unity documentation')
  .action((pathArg) => {
    const docIndexerPath = path.join(__dirname, '..', '..', 'doc-indexer', 'dist', 'cli.js');
    const args = [docIndexerPath, 'index', pathArg];

    exec(`bun ${args.join(' ')}`, (error, stdout, _stderr) => {
      if (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }

      console.log(stdout);
    });
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
