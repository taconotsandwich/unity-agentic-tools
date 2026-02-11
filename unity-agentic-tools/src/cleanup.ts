import { existsSync, unlinkSync, rmdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const CONFIG_DIR = '.unity-agentic';
const CONFIG_FILE = 'config.json';
const GUID_CACHE_FILE = 'guid-cache.json';
const DOC_INDEX_FILE = 'doc-index.json';

export interface CleanupOptions {
  project?: string;
  all?: boolean;
}

export interface CleanupResult {
  success: boolean;
  project_path: string;
  files_removed: string[];
  directory_removed: boolean;
  error?: string;
}

/**
 * Clean up unity-agentic files from a Unity project
 */
export function cleanup(options: CleanupOptions = {}): CleanupResult {
  const projectPath = resolve(options.project || process.cwd());
  const configPath = join(projectPath, CONFIG_DIR);

  if (!existsSync(configPath)) {
    return {
      success: true,
      project_path: projectPath,
      files_removed: [],
      directory_removed: false,
      error: `No ${CONFIG_DIR} directory found`,
    };
  }

  const filesRemoved: string[] = [];
  let directoryRemoved = false;

  if (options.all) {
    // Remove entire directory
    try {
      removeDirectoryRecursive(configPath);
      directoryRemoved = true;
      filesRemoved.push(CONFIG_DIR);
    } catch (err) {
      return {
        success: false,
        project_path: projectPath,
        files_removed: filesRemoved,
        directory_removed: false,
        error: `Failed to remove directory: ${err}`,
      };
    }
  } else {
    // Remove only cache files, keep config
    const filesToRemove = [GUID_CACHE_FILE, DOC_INDEX_FILE];

    for (const file of filesToRemove) {
      const filePath = join(configPath, file);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
          filesRemoved.push(file);
        } catch {
          // Ignore errors for individual files
        }
      }
    }

    // Check if directory is now empty (except config)
    const remaining = readdirSync(configPath);
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === CONFIG_FILE)) {
      // Keep config.json but note that caches are cleared
    }
  }

  return {
    success: true,
    project_path: projectPath,
    files_removed: filesRemoved,
    directory_removed: directoryRemoved,
  };
}

/**
 * Recursively remove a directory and all its contents
 */
function removeDirectoryRecursive(dir: string): void {
  if (!existsSync(dir)) {
    return;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirectoryRecursive(fullPath);
    } else {
      unlinkSync(fullPath);
    }
  }

  rmdirSync(dir);
}
