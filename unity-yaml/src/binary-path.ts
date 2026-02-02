/**
 * Binary path utilities for locating the native Rust module on the host machine.
 *
 * The native binary is stored in ~/.claude/unity-agentic-tools/bin/ to:
 * - Persist across plugin updates/reinstalls
 * - Keep platform-specific binaries separate from plugin code
 */

import { homedir } from 'os';
import { join } from 'path';

const BINARY_NAME = 'unity-agentic-core';

/**
 * Get the directory where native binaries are stored on the host machine.
 * @returns Path to ~/.claude/unity-agentic-tools/bin/
 */
export function getBinaryDir(): string {
    return join(homedir(), '.claude', 'unity-agentic-tools', 'bin');
}

/**
 * Get the platform-specific binary filename.
 * @returns Filename like unity-agentic-core.darwin-arm64.node
 * @throws Error if platform is unsupported
 */
export function getBinaryFilename(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'darwin' && arch === 'arm64') {
        return `${BINARY_NAME}.darwin-arm64.node`;
    } else if (platform === 'darwin' && arch === 'x64') {
        return `${BINARY_NAME}.darwin-x64.node`;
    } else if (platform === 'linux' && arch === 'x64') {
        return `${BINARY_NAME}.linux-x64-gnu.node`;
    } else if (platform === 'win32' && arch === 'x64') {
        return `${BINARY_NAME}.win32-x64-msvc.node`;
    } else {
        throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }
}

/**
 * Get the full path to the native binary on the host machine.
 * @returns Full path to the .node file
 */
export function getBinaryPath(): string {
    return join(getBinaryDir(), getBinaryFilename());
}
