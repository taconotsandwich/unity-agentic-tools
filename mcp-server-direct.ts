import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { UnityScanner } from './unity-yaml/dist/scanner';

const server = new McpServer({
  name: 'unity-agentic-tools',
  version: '1.0.0',
});

server.registerTool('unity-list-hierarchy', {
  description: 'List all GameObjects in Unity file',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity, .prefab, or .asset file')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.scan_scene_with_components(args.file_path);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        count: result.length,
        objects: result
      })
    }]
  };
});

server.registerTool('unity-inspect', {
  description: 'Inspect Unity scene or prefab file with complete GameObject information',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity or .prefab file'),
    identifier: z.string().optional().describe('GameObject name or file ID (omit to inspect entire file)'),
    include_properties: z.boolean().optional().describe('Include component properties in output')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = args.identifier
    ? scanner.inspect({ file: args.file_path, identifier: args.identifier, include_properties: args.include_properties })
    : scanner.inspect_all(args.file_path, args.include_properties);

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.registerTool('unity-scene-find', {
  description: 'Find GameObjects in Unity scene by name pattern',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity file'),
    pattern: z.string().describe('Name pattern to search for'),
    exact: z.boolean().optional().describe('Use exact matching instead of fuzzy (optional)')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.find_by_name(args.file_path, args.pattern, args.exact !== true);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        pattern: args.pattern,
        fuzzy: args.exact !== true,
        count: result.length,
        matches: result
      })
    }]
  };
});

server.registerTool('unity-scene-get', {
  description: 'Get detailed GameObject information from Unity scene',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .unity file'),
    object_id: z.string().describe('GameObject file ID')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.inspect({ file: args.file_path, identifier: args.object_id });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        object: result
      })
    }]
  };
});

server.registerTool('unity-prefab-list', {
  description: 'List all GameObjects in Unity prefab',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.scan_scene_with_components(args.file_path);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        count: result.length,
        objects: result
      })
    }]
  };
});

server.registerTool('unity-prefab-find', {
  description: 'Find GameObjects in Unity prefab by name pattern',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file'),
    pattern: z.string().describe('Name pattern to search for'),
    exact: z.boolean().optional().describe('Use exact matching instead of fuzzy (optional)')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.find_by_name(args.file_path, args.pattern, args.exact !== true);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        pattern: args.pattern,
        fuzzy: args.exact !== true,
        count: result.length,
        matches: result
      })
    }]
  };
});

server.registerTool('unity-prefab-get', {
  description: 'Get detailed GameObject information from Unity prefab',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .prefab file'),
    object_id: z.string().describe('GameObject file ID')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.inspect({ file: args.file_path, identifier: args.object_id });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        object: result
      })
    }]
  };
});

server.registerTool('unity-asset-show', {
  description: 'List all GameObjects in Unity asset file',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .asset file')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.scan_scene_with_components(args.file_path);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        count: result.length,
        objects: result
      })
    }]
  };
});

server.registerTool('unity-asset-get', {
  description: 'Get specific GameObject or property from Unity asset',
  inputSchema: z.object({
    file_path: z.string().describe('Path to .asset file'),
    object_name: z.string().describe('GameObject name')
  })
}, async (args: any) => {
  const scanner = new UnityScanner();
  const result = scanner.inspect({ file: args.file_path, identifier: args.object_name });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file: args.file_path,
        object: result
      })
    }]
  };
});

server.registerTool('unity-edit-value', {
  description: 'Edit a property value in Unity file safely with GUID preservation',
  inputSchema: z.object({
    file_path: z.string().describe('Path to Unity file'),
    object_name: z.string().describe('GameObject name to edit'),
    property: z.string().describe('Property name (without m_ prefix)'),
    value: z.string().describe('New property value')
  })
}, async () => {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'Edit functionality requires unity-yaml/editor module which is not yet integrated into this direct-import version',
        suggestion: 'Use the original CLI-based version for editing operations'
      })
    }]
  };
});

server.registerTool('unity-index-docs', {
  description: 'Index Unity package documentation for fast semantic search',
  inputSchema: z.object({
    path: z.string().describe('Path to documentation or registry:com.unity.packagename')
  })
}, async () => {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'Documentation indexing requires doc-indexer module which is not yet integrated into this direct-import version',
        suggestion: 'Use the original CLI-based version for documentation operations'
      })
    }]
  };
});

server.registerTool('unity-search-docs', {
  description: 'Search indexed Unity documentation with hybrid semantic + keyword search',
  inputSchema: z.object({
    query: z.string().describe('Search query for Unity documentation')
  })
}, async () => {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'Documentation search requires doc-indexer module which is not yet integrated into this direct-import version',
        suggestion: 'Use the original CLI-based version for documentation operations'
      })
    }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
