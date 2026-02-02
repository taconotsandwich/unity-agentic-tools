import { createRequire } from 'module';
import { existsSync } from 'fs';
import { GameObject, GameObjectDetail, SceneInspection, InspectOptions, ScanOptions } from './types';
import { getBinaryPath, getBinaryDir } from './binary-path';

// Load the native Rust module from host machine
let RustScanner: any = null;
let nativeModuleError: string | null = null;

try {
  const binaryPath = getBinaryPath();

  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found at: ${binaryPath}`);
  }

  // Load the .node file directly using require
  const customRequire = createRequire(import.meta.url || __filename);
  const rustModule = customRequire(binaryPath);
  RustScanner = rustModule.Scanner;
} catch (err) {
  const binaryDir = getBinaryDir();
  nativeModuleError =
    `Failed to load native Rust module from host location.\n` +
    `Expected location: ${binaryDir}\n` +
    `Run: /initial-install (if using as Claude Code plugin)\n` +
    `Or download from: https://github.com/taconotsandwich/unity-agentic-tools/releases\n` +
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
