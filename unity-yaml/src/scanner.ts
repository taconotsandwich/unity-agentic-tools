import { createRequire } from 'module';
import { FindResult, GameObject, GameObjectDetail, GameObjectWithComponents, SceneInspection, InspectOptions, ScanOptions, NativeScanner, NativeScannerInstance, PaginationOptions, PaginatedInspection } from './types';

// Load the native Rust module via workspace dependency
// Use createRequire to prevent the bundler from inlining the native .node binary
let RustScanner: NativeScanner | null = null;
let nativeModuleError: string | null = null;

try {
  const nativeRequire = createRequire(import.meta.url || __filename);
  const rustModule = nativeRequire('unity-agentic-tool');
  RustScanner = rustModule.Scanner;
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
    });
  }
}
