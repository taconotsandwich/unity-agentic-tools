import { writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname, join } from 'path';

/**
 * Walk up from startDir looking for a Unity project root.
 * Checks for `.unity-agentic/` first, then `Assets/`.
 */
export function find_unity_project_root(startDir?: string): string | null {
    let dir = resolve(startDir || process.cwd());
    const root = resolve('/');

    while (dir !== root) {
        if (existsSync(join(dir, '.unity-agentic'))) return dir;
        if (existsSync(join(dir, 'Assets'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    return null;
}

export interface AtomicWriteResult {
    success: boolean;
    file_path: string;
    bytes_written?: number;
    error?: string;
}

/**
 * Atomic write: write to temp file, then rename to prevent partial writes.
 */
export function atomicWrite(filePath: string, content: string): AtomicWriteResult {
    const tmpPath = `${filePath}.tmp`;

    try {
        writeFileSync(tmpPath, content, 'utf-8');

        if (existsSync(filePath)) {
            renameSync(filePath, `${filePath}.bak`);
        }

        renameSync(tmpPath, filePath);

        try {
            if (existsSync(`${filePath}.bak`)) {
                unlinkSync(`${filePath}.bak`);
            }
        } catch {
            // Ignore cleanup errors
        }

        return {
            success: true,
            file_path: filePath,
            bytes_written: Buffer.byteLength(content, 'utf-8')
        };
    } catch (error) {
        if (existsSync(`${filePath}.bak`)) {
            try {
                renameSync(`${filePath}.bak`, filePath);
            } catch (restoreError) {
                console.error('Failed to restore backup:', restoreError);
            }
        }

        return {
            success: false,
            file_path: filePath,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Match a string against a glob pattern (* and ? wildcards) or exact equality.
 * Case-insensitive. If the pattern has no glob chars, does exact equality.
 */
export function glob_match(pattern: string, text: string): boolean {
    if (!pattern.includes('*') && !pattern.includes('?')) {
        return pattern.toLowerCase() === text.toLowerCase();
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex_str = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex_str}$`, 'i').test(text);
}

/**
 * Generate a new GUID (32 hex characters).
 */
export function generateGuid(): string {
    const hex = '0123456789abcdef';
    let guid = '';
    for (let i = 0; i < 32; i++) {
        guid += hex[Math.floor(Math.random() * 16)];
    }
    return guid;
}
