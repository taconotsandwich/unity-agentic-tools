import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const CONFIG_DIR = '.unity-agentic';
const CONFIG_FILE = 'config.json';
const GUID_CACHE_FILE = 'guid-cache.json';
const DOC_INDEX_FILE = 'doc-index.json';

export interface SetupOptions {
  project?: string;
  indexDocs?: boolean;
}

export interface SetupResult {
  success: boolean;
  project_path: string;
  config_path: string;
  guid_cache_created: boolean;
  doc_index_created: boolean;
  guid_count?: number;
  error?: string;
}

export interface GuidCache {
  [guid: string]: string;
}

/**
 * Set up unity-agentic tools for a Unity project
 */
export function setup(options: SetupOptions = {}): SetupResult {
  const projectPath = resolve(options.project || process.cwd());

  // Verify this is a Unity project
  const assetsPath = join(projectPath, 'Assets');
  if (!existsSync(assetsPath)) {
    return {
      success: false,
      project_path: projectPath,
      config_path: '',
      guid_cache_created: false,
      doc_index_created: false,
      error: `Not a Unity project: Assets folder not found at ${assetsPath}`,
    };
  }

  const configPath = join(projectPath, CONFIG_DIR);

  // Create config directory
  if (!existsSync(configPath)) {
    mkdirSync(configPath, { recursive: true });
  }

  // Create config.json
  const config = {
    version: '1.0.0',
    project_path: projectPath,
    created_at: new Date().toISOString(),
    rust_enabled: isRustAvailable(),
  };
  writeFileSync(join(configPath, CONFIG_FILE), JSON.stringify(config, null, 2));

  // Build GUID cache
  const guidCache = buildGuidCache(projectPath);
  const guidCachePath = join(configPath, GUID_CACHE_FILE);
  writeFileSync(guidCachePath, JSON.stringify(guidCache, null, 2));

  // Optionally create doc index
  let docIndexCreated = false;
  if (options.indexDocs) {
    const docIndex = { chunks: {}, last_updated: Date.now() };
    writeFileSync(join(configPath, DOC_INDEX_FILE), JSON.stringify(docIndex, null, 2));
    docIndexCreated = true;
  }

  return {
    success: true,
    project_path: projectPath,
    config_path: configPath,
    guid_cache_created: true,
    doc_index_created: docIndexCreated,
    guid_count: Object.keys(guidCache).length,
  };
}

/**
 * Build GUID cache by scanning all .meta files
 */
function buildGuidCache(projectRoot: string): GuidCache {
  const cache: GuidCache = {};
  const assetsDir = join(projectRoot, 'Assets');

  if (!existsSync(assetsDir)) {
    return cache;
  }

  scanMetaFiles(assetsDir, projectRoot, cache);
  return cache;
}

function scanMetaFiles(dir: string, projectRoot: string, cache: GuidCache): void {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanMetaFiles(fullPath, projectRoot, cache);
      } else if (entry.endsWith('.meta')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const guidMatch = content.match(/^guid:\s*([a-f0-9]{32})/m);

          if (guidMatch) {
            const guid = guidMatch[1];
            // Remove .meta extension to get actual asset path
            const assetPath = fullPath.slice(0, -5);
            const relativePath = relative(projectRoot, assetPath);
            cache[guid] = relativePath;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
  } catch {
    // Skip directories we can't access
  }
}

/**
 * Check if Rust native module is available
 */
function isRustAvailable(): boolean {
  try {
    require('../../rust-core');
    return true;
  } catch {
    return false;
  }
}
