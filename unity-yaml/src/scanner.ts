import { createRequire } from 'module';
import { join, dirname } from 'path';
import { GameObject, GameObjectDetail, SceneInspection, InspectOptions, ScanOptions } from './types';

// Load the native Rust module
let RustScanner: any = null;
let nativeModuleError: string | null = null;

try {
  const customRequire = createRequire(import.meta.url || __filename);
  const rustCorePath = join(dirname(__filename), '..', '..', 'rust-core');
  const rustModule = customRequire(rustCorePath);
  RustScanner = rustModule.Scanner;
} catch (err) {
  nativeModuleError =
    `Failed to load native Rust module. Please install the pre-built binary for your platform.\n` +
    `Download from: https://github.com/taconotsandwich/unity-agentic-tools/releases\n` +
    `Run: /initial-install (if using as Claude Code plugin)\n` +
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
  private scanner: any;

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
  scan_scene_with_components(file: string, options?: ScanOptions): any[] {
    return this.scanner.scanSceneWithComponents(file, options);
  }

  /**
   * Find GameObjects by name pattern
   */
  find_by_name(file: string, pattern: string, fuzzy: boolean = true): GameObject[] {
    return this.scanner.findByName(file, pattern, fuzzy);
  }

  /**
   * Inspect a specific GameObject
   */
  inspect(options: InspectOptions): any | null {
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
}
