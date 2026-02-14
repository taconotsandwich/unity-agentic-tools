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
 * Validate a name (GameObject, tag, etc.) for characters that are illegal in Unity.
 * Returns an error string if invalid, or null if the name is acceptable.
 */
export function validate_name(name: string, label: string): string | null {
    if (name.includes('/')) {
        return `${label} cannot contain forward slashes (/) — Unity uses them as hierarchy path separators`;
    }
    if (name.includes('\\')) {
        return `${label} cannot contain backslashes (\\)`;
    }
    if (name.includes('\n') || name.includes('\r')) {
        return `${label} cannot contain newlines — they corrupt YAML structure`;
    }
    if (name.includes('\t')) {
        return `${label} cannot contain tab characters — they break YAML indentation`;
    }
    if (name.includes('\0')) {
        return `${label} cannot contain null bytes`;
    }
    return null;
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

/**
 * Validate that a file path is safe for Unity operations.
 * Rejects file:// URIs, path traversal, and Packages/ writes.
 * Note: Absolute paths ARE allowed (this is a CLI tool, not a web API).
 *
 * @param file_path - The file path to validate
 * @param operation - Whether this is a 'read' or 'write' operation
 * @returns Error message if invalid, null if valid
 */
export function validate_file_path(file_path: string, operation: 'read' | 'write'): string | null {
    // Reject file:// URIs
    if (file_path.startsWith('file://')) {
        return 'file:// URIs are not supported. Use file paths directly.';
    }

    // Normalize path (convert backslashes to forward slashes)
    const normalized = file_path.replace(/\\/g, '/');

    // Reject path traversal in relative paths (security concern)
    // Allow in absolute paths as they're resolved differently
    const isAbsolute = file_path.startsWith('/') ||
        /^[A-Z]:[/\\]/i.test(file_path) ||
        file_path.startsWith('\\\\') ||
        file_path.startsWith('//');

    if (!isAbsolute && (normalized.includes('/../') || normalized.startsWith('../'))) {
        return 'Path traversal (..) is not allowed in relative paths for security reasons.';
    }

    // Reject Packages/ writes in relative paths (read-only in Unity)
    if (operation === 'write' && !isAbsolute && normalized.startsWith('Packages/')) {
        return 'Cannot write to Packages/ directory (read-only in Unity).';
    }

    return null; // Valid
}

/**
 * Validate Vector3 structure for Unity YAML.
 *
 * @param value - The value to validate as Vector3
 * @returns Error message if invalid, null if valid
 */
export function validate_vector3(value: any): string | null {
    if (typeof value !== 'object' || value === null) {
        return 'Vector3 must be an object with x, y, z properties';
    }

    const { x, y, z } = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        return 'Vector3 x, y, z must all be numbers';
    }

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return 'Vector3 x, y, z must be finite numbers';
    }

    return null;
}

/**
 * Validate GUID format (32-character hex string).
 *
 * @param guid - The GUID to validate
 * @returns Error message if invalid, null if valid
 */
export function validate_guid(guid: string): string | null {
    if (!/^[0-9a-f]{32}$/i.test(guid)) {
        return 'GUID must be a 32-character hexadecimal string';
    }
    return null;
}
