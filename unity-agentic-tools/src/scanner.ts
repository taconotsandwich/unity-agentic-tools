import { createRequire } from 'module';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { AssetObject, FindResult, GameObject, GameObjectDetail, GameObjectWithComponents, SceneInspection, InspectOptions, ScanOptions, NativeScanner, NativeScannerInstance, PaginationOptions, PaginatedInspection } from './types';

// Load the native Rust module
// bun's bundler hardcodes import.meta.url and __dirname at build time, so we
// use process.argv[1] (always a runtime value) to find the actual script location.
let RustScanner: NativeScanner | null = null;
let nativeModuleError: string | null = null;

// Native walker functions (standalone, not Scanner methods)
let nativeWalkProjectFiles: ((projectPath: string, extensions: string[], excludeDirs?: string[] | null) => string[]) | null = null;
let nativeGrepProject: ((options: unknown) => unknown) | null = null;
let nativeBuildGuidCache: ((projectRoot: string) => unknown) | null = null;

try {
  const scriptDir = process.argv[1]
    ? dirname(resolve(process.argv[1]))
    : __dirname;

  let rustModule: Record<string, unknown>;

  // Strategy 1: Published package — native/ directory bundled alongside dist/
  const nativeLoaderPath = join(scriptDir, '..', 'native', 'index.js');
  if (existsSync(nativeLoaderPath)) {
    const nativeRequire = createRequire(nativeLoaderPath);
    rustModule = nativeRequire(nativeLoaderPath) as Record<string, unknown>;
  } else {
    // Strategy 2: Dev workspace — resolve 'unity-file-tools' via workspace link
    // Anchor createRequire to script dir for correct node_modules traversal
    const wsRequire = createRequire(join(scriptDir, '_'));
    rustModule = wsRequire('unity-file-tools') as Record<string, unknown>;
  }

  RustScanner = rustModule.Scanner as NativeScanner;
  nativeWalkProjectFiles = (rustModule.walkProjectFiles as typeof nativeWalkProjectFiles) || null;
  nativeGrepProject = (rustModule.grepProject as typeof nativeGrepProject) || null;
  nativeBuildGuidCache = (rustModule.buildGuidCache as typeof nativeBuildGuidCache) || null;
} catch (err) {
  nativeModuleError =
    `Failed to load native Rust module.\n` +
    `Run: bun install (in the project root)\n` +
    `Original error: ${(err as Error).message}`;
}

/**
 * Check if the native Rust module is available
 */
export function isNativeModuleAvailable(): boolean {
  return RustScanner !== null;
}

/**
 * Get the native module error message if it failed to load
 */
export function getNativeModuleError(): string | null {
  return nativeModuleError;
}

/**
 * Unity scene/prefab scanner powered by Rust
 */
export class UnityScanner {
  private scanner: NativeScannerInstance;

  constructor() {
    if (!RustScanner) {
      throw new Error(nativeModuleError || 'Native module not available');
    }
    this.scanner = new RustScanner();
  }

  /**
   * Set project root for GUID resolution
   */
  setProjectRoot(path: string): void {
    this.scanner.setProjectRoot(path);
  }

  /**
   * Scan scene for basic GameObject information
   */
  scan_scene_minimal(file: string): GameObject[] {
    return this.scanner.scanSceneMinimal(file);
  }

  /**
   * Scan scene with component information
   */
  scan_scene_with_components(file: string, options?: ScanOptions): GameObjectWithComponents[] {
    return this.scanner.scanSceneWithComponents(file, options);
  }

  /**
   * Find GameObjects and PrefabInstances by name pattern
   */
  find_by_name(file: string, pattern: string, fuzzy: boolean = true): FindResult[] {
    return this.scanner.findByName(file, pattern, fuzzy);
  }

  /**
   * Inspect a specific GameObject
   */
  inspect(options: InspectOptions): GameObjectDetail | null {
    return this.scanner.inspect({
      file: options.file,
      identifier: options.identifier,
      includeProperties: options.include_properties,
      verbose: options.verbose,
    });
  }

  /**
   * Inspect entire file
   */
  inspect_all(file: string, include_properties: boolean = false, verbose: boolean = false): SceneInspection {
    return this.scanner.inspectAll(file, include_properties, verbose);
  }

  /**
   * Inspect entire file with pagination
   */
  inspect_all_paginated(options: PaginationOptions): PaginatedInspection {
    return this.scanner.inspectAllPaginated({
      file: options.file,
      includeProperties: options.include_properties,
      verbose: options.verbose,
      pageSize: options.page_size,
      cursor: options.cursor,
      maxDepth: options.max_depth,
      filterComponent: options.filter_component,
    });
  }

  /**
   * Read a .asset file (ScriptableObject) and return its root objects with properties
   */
  read_asset(file: string): AssetObject[] {
    return this.scanner.readAsset(file);
  }
}

/**
 * Get native walk_project_files if available, or null
 */
export function getNativeWalkProjectFiles(): typeof nativeWalkProjectFiles {
  return nativeWalkProjectFiles;
}

/**
 * Get native grep_project if available, or null
 */
export function getNativeGrepProject(): typeof nativeGrepProject {
  return nativeGrepProject;
}

/**
 * Get native build_guid_cache if available, or null
 */
export function getNativeBuildGuidCache(): typeof nativeBuildGuidCache {
  return nativeBuildGuidCache;
}
