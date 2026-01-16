import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: 'unity-agentic-tools',
  version: '1.0.0',
});

async function runUnityCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(__dirname, 'unity-yaml', 'dist', 'cli.js');
    const child = spawn('bun', [cliPath, ...args], {
      cwd: __dirname,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Unity CLI exited with code ${code}: ${stderr}`));
      }
    });
  });
}

server.registerTool('unity-inspect', {
  description: 'Inspect Unity scene or prefab file with complete GameObject information',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity or .prefab file'),
    identifier: z.string().optional().describe('GameObject name or file ID (omit to inspect entire file)'),
    include_properties: z.boolean().optional().describe('Include component properties in output')
  })
}, async (args: any) => {
  const cliArgs = ['inspect', args.file_path];
  if (args.identifier) cliArgs.push(args.identifier);
  if (args.include_properties) cliArgs.push('--properties');

  const result = await runUnityCli(cliArgs);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-list-hierarchy', {
  description: 'List all GameObjects in Unity file',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity, .prefab, or .asset file')
  })
}, async (args: any) => {
  const result = await runUnityCli(['list', args.file_path]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-scene-find', {
  description: 'Find GameObjects in Unity scene by name pattern',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity file'),
    pattern: z.string().describe('Name pattern to search for'),
    exact: z.boolean().optional().describe('Use exact matching instead of fuzzy (optional)')
  })
}, async (args: any) => {
  const cliArgs = ['find', args.file_path, args.pattern];
  if (args.exact) cliArgs.push('--exact');

  const result = await runUnityCli(cliArgs);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-scene-get', {
  description: 'Get detailed GameObject information from Unity scene',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity file'),
    object_id: z.string().describe('GameObject file ID')
  })
}, async (args: any) => {
  const result = await runUnityCli(['get', args.file_path, args.object_id]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-prefab-list', {
  description: 'List all GameObjects in Unity prefab',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file')
  })
}, async (args: any) => {
  const result = await runUnityCli(['list', args.file_path]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-prefab-find', {
  description: 'Find GameObjects in Unity prefab by name pattern',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file'),
    pattern: z.string().describe('Name pattern to search for'),
    exact: z.boolean().optional().describe('Use exact matching (optional)')
  })
}, async (args: any) => {
  const cliArgs = ['find', args.file_path, args.pattern];
  if (args.exact) cliArgs.push('--exact');

  const result = await runUnityCli(cliArgs);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-prefab-get', {
  description: 'Get detailed GameObject information from Unity prefab',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file'),
    object_id: z.string().describe('GameObject file ID')
  })
}, async (args: any) => {
  const result = await runUnityCli(['get', args.file_path, args.object_id]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-asset-show', {
  description: 'List all GameObjects in Unity asset file',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .asset file')
  })
}, async (args: any) => {
  const result = await runUnityCli(['list', args.file_path]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-asset-get', {
  description: 'Get specific GameObject or property from Unity asset',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .asset file'),
    object_name: z.string().describe('GameObject name')
  })
}, async (args: any) => {
  const result = await runUnityCli(['get', args.file_path, args.object_name]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-edit-value', {
  description: 'Edit a property value in Unity file safely with GUID preservation',
  inputSchema: z.object({
    file_path: z.string().describe('Path to Unity file'),
    object_name: z.string().describe('GameObject name to edit'),
    property: z.string().describe('Property name (without m_ prefix)'),
    value: z.string().describe('New property value')
  })
}, async (args: any) => {
  const result = await runUnityCli(['edit', args.file_path, args.object_name, args.property, args.value]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-index-docs', {
  description: 'Index Unity package documentation for fast semantic search',
  inputSchema: z.object({
    path: z.string().describe('Path to documentation or registry:com.unity.packagename')
  })
}, async (args: any) => {
  const result = await runUnityCli(['index-docs', args.path]);
  return { content: [{ type: 'text', text: result }] };
});

server.registerTool('unity-search-docs', {
  description: 'Search indexed Unity documentation with hybrid semantic + keyword search',
  inputSchema: z.object({
    query: z.string().describe('Search query for Unity documentation')
  })
}, async (args: any) => {
  const result = await runUnityCli(['search-docs', args.query]);
  return { content: [{ type: 'text', text: result }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
