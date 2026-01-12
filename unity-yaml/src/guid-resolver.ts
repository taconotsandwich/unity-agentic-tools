import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';

export interface GuidMap {
  [guid: string]: string;
}

export class GuidResolver {
  private guidMap: GuidMap = {};
  private projectRoot: string;
  private initialized: boolean = false;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Build GUID map by scanning all .meta files in the project
   */
  buildGuidMap(): void {
    if (!existsSync(this.projectRoot)) {
      console.warn(`Project root does not exist: ${this.projectRoot}`);
      return;
    }

    const assetsDir = join(this.projectRoot, 'Assets');
    if (!existsSync(assetsDir)) {
      console.warn(`Assets directory not found: ${assetsDir}`);
      return;
    }

    this.guidMap = {};
    this.scanDirectory(assetsDir);
    this.initialized = true;
  }

  /**
   * Recursively scan directory for .meta files
   */
  private scanDirectory(dir: string): void {
    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.scanDirectory(fullPath);
        } else if (entry.endsWith('.meta')) {
          this.parseMetaFile(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }

  /**
   * Parse a .meta file and extract GUID
   */
  private parseMetaFile(metaPath: string): void {
    try {
      const content = readFileSync(metaPath, 'utf-8');
      const guidMatch = content.match(/^guid:\s*([a-f0-9]{32})/m);

      if (guidMatch) {
        const guid = guidMatch[1];
        // Remove .meta extension to get actual asset path
        const assetPath = metaPath.slice(0, -5);
        // Convert to relative path from project root
        const relativePath = relative(this.projectRoot, assetPath);
        this.guidMap[guid] = relativePath;
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  /**
   * Resolve a GUID to its asset path
   */
  resolve(guid: string): string | undefined {
    if (!this.initialized) {
      this.buildGuidMap();
    }
    return this.guidMap[guid];
  }

  /**
   * Get the entire GUID map
   */
  getGuidMap(): GuidMap {
    if (!this.initialized) {
      this.buildGuidMap();
    }
    return { ...this.guidMap };
  }

  /**
   * Clear the GUID map cache
   */
  clear(): void {
    this.guidMap = {};
    this.initialized = false;
  }

  /**
   * Find the Unity project root by looking for Assets folder
   */
  static findProjectRoot(startPath: string): string | null {
    let currentPath = startPath;

    // Go up the directory tree looking for Assets folder
    while (currentPath !== dirname(currentPath)) {
      const assetsPath = join(currentPath, 'Assets');
      if (existsSync(assetsPath) && statSync(assetsPath).isDirectory()) {
        return currentPath;
      }
      currentPath = dirname(currentPath);
    }

    return null;
  }
}
