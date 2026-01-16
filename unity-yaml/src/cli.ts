#!/usr/bin/env bun
import { program } from 'commander';
import { UnityScanner } from './scanner';

const scanner = new UnityScanner();

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
    const result = scanner.scan_scene_with_components(file, { verbose: options.verbose });
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
    const result = scanner.find_by_name(file, pattern, fuzzy);
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
    const result = scanner.inspect({
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
    const result = scanner.inspect({
      file,
      identifier: identifier || '',
      include_properties: options.properties === true,
      verbose: options.verbose
    });

    if (!result && identifier) {
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
    const result = scanner.inspect_all(
      file,
      options.properties === true,
      options.verbose === true
    );
    console.log(JSON.stringify(result, null, 2));
  });

// Edit command
import { editProperty } from './editor';

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

// Search docs command (uses doc-indexer CLI)
const { exec } = require('child_process');

program.command('search-docs <query>')
  .description('Search Unity documentation')
  .option('--summarize', '-s', 'Summarize results')
  .option('--compress', '-c', 'Compress results')
  .option('-j, --json', 'Output as JSON')
  .action((query, options) => {
    const args = ['doc-indexer', 'search', query];
    if (options.summarize) args.push('-s');
    if (options.compress) args.push('-c');
    if (options.json) args.push('-j');

    exec(`node ${args.join(' ')}`, (error, stdout, _stderr) => {
      if (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }

      console.log(stdout);
    });
  });

program.parse();
