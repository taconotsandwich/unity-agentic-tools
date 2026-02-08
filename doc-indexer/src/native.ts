import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function get_binary_path(): string | null {
    const platform = process.platform;
    const arch = process.arch;
    let filename: string;

    if (platform === 'darwin' && arch === 'arm64') {
        filename = 'unity-agentic-core.darwin-arm64.node';
    } else if (platform === 'darwin' && arch === 'x64') {
        filename = 'unity-agentic-core.darwin-x64.node';
    } else if (platform === 'linux' && arch === 'x64') {
        filename = 'unity-agentic-core.linux-x64-gnu.node';
    } else if (platform === 'win32' && arch === 'x64') {
        filename = 'unity-agentic-core.win32-x64-msvc.node';
    } else {
        return null;
    }

    const binaryPath = join(homedir(), '.claude', 'unity-agentic-tools', 'bin', filename);
    return existsSync(binaryPath) ? binaryPath : null;
}

let _cachedEmbedder: any | null = undefined;

export function load_embedding_generator(): any | null {
    if (_cachedEmbedder !== undefined) return _cachedEmbedder;

    try {
        const binaryPath = get_binary_path();
        if (!binaryPath) {
            _cachedEmbedder = null;
            return null;
        }

        const customRequire = createRequire(import.meta.url || __filename);
        const mod = customRequire(binaryPath);
        _cachedEmbedder = new mod.EmbeddingGenerator();
        return _cachedEmbedder;
    } catch {
        _cachedEmbedder = null;
        return null;
    }
}
