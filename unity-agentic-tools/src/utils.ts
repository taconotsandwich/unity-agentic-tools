import { writeFileSync, renameSync, existsSync, unlinkSync, accessSync, mkdirSync, constants as fsConstants } from 'fs';
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
        if (existsSync(join(dir, 'Assets')) && existsSync(join(dir, 'ProjectSettings'))) return dir;
        if (existsSync(join(dir, 'Assets'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    return null;
}

/**
 * Resolve an explicit project path or default to the current working directory.
 */
export function resolve_project_path(project_path?: string): string {
    return resolve(project_path || process.cwd());
}

/**
 * Ensure the parent directory of a file path exists, creating it recursively if needed.
 */
export function ensure_parent_dir(file_path: string): void {
    const dir = dirname(file_path);
    if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

export interface AtomicWriteResult {
    success: boolean;
    file_path: string;
    bytes_written?: number;
    error?: string;
}

/**
 * Atomic write: write to temp file, then rename to prevent partial writes.
 * Uses randomized temp file names to prevent collisions from concurrent writes.
 * Handles ENOENT gracefully for TOCTOU races (e.g., Unity AssetDatabase deleting files).
 */
export function atomicWrite(filePath: string, content: string): AtomicWriteResult {
    // Check file write permission if the file already exists
    if (existsSync(filePath)) {
        try {
            accessSync(filePath, fsConstants.W_OK);
        } catch {
            return {
                success: false,
                file_path: filePath,
                error: `Permission denied: ${filePath} is not writable`
            };
        }
    }

    // Randomized temp name to prevent collisions from concurrent writes
    const suffix = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const tmpPath = `${filePath}.${suffix}.tmp`;
    const bakPath = `${filePath}.${suffix}.bak`;
    let bakCreated = false;

    try {
        writeFileSync(tmpPath, content, 'utf-8');

        // Move original to .bak -- if it vanished (TOCTOU race), that's OK
        try {
            renameSync(filePath, bakPath);
            bakCreated = true;
        } catch (err: unknown) {
            if (is_enoent(err)) {
                // File was deleted externally between our check and rename -- not an error
                bakCreated = false;
            } else {
                throw err;
            }
        }

        // Promote temp file to final path
        renameSync(tmpPath, filePath);

        // Clean up backup
        if (bakCreated) {
            try { unlinkSync(bakPath); } catch { /* ignore cleanup errors */ }
        }

        return {
            success: true,
            file_path: filePath,
            bytes_written: Buffer.byteLength(content, 'utf-8')
        };
    } catch (error) {
        // Rollback: restore backup if we created one
        if (bakCreated) {
            try {
                renameSync(bakPath, filePath);
            } catch (restoreError) {
                console.error('Failed to restore backup:', restoreError);
            }
        }

        // Always clean up temp file
        try { unlinkSync(tmpPath); } catch { /* may not exist */ }

        return {
            success: false,
            file_path: filePath,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function is_enoent(err: unknown): boolean {
    return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Normalize property path: convert dot-notation array indices to bracket notation.
 * e.g. "m_Materials.Array.data.0" -> "m_Materials.Array.data[0]"
 * This provides a shell-safe alternative to bracket syntax which triggers glob expansion in zsh.
 */
export function normalize_property_path(path: string): string {
    return path.replace(/\.Array\.data\.(\d+)/g, '.Array.data[$1]');
}

/**
 * Check if a pattern matches everything (wildcard-all).
 * Patterns like "*", ".", "**" mean "all objects" — not a real filter.
 */
export function is_match_all(pattern: string): boolean {
    return pattern === '*' || pattern === '.' || pattern === '**' || pattern === '.*';
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
 * Convert a glob pattern to a RegExp for matching against file paths.
 * Handles ** (match across directories), * (match within one segment), ? (single char).
 * Without wildcards, performs case-insensitive substring match.
 * Unlike glob_match, this is designed for path filtering (no anchoring, path-aware).
 */
export function path_glob_to_regex(pattern: string): RegExp {
    if (!pattern.includes('*') && !pattern.includes('?')) {
        // No wildcards: substring match
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'i');
    }
    // Escape regex-special chars (not * and ?)
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Replace ** first (via placeholder to avoid double-replacement), then *
    const regex_str = escaped
        .replace(/\*\*/g, '\0GLOBSTAR\0')
        .replace(/\*/g, '[^/\\\\]*')
        .replace(/\0GLOBSTAR\0/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(regex_str, 'i');
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

    // Reject writes to read-only Unity directories
    if (operation === 'write') {
        // Library/PackageCache is immutable (absolute or relative)
        if (normalized.includes('/Library/PackageCache/') || normalized.startsWith('Library/PackageCache/')) {
            return 'Cannot write to Library/PackageCache/ (immutable package cache).';
        }

        // Packages/ directory is read-only in Unity (check via path segments)
        const segments = normalized.split('/');
        const pkgIdx = segments.indexOf('Packages');
        if (pkgIdx >= 0) {
            // Don't block paths under Assets/ that happen to contain a "Packages" folder
            const assetsIdx = segments.indexOf('Assets');
            if (assetsIdx < 0 || assetsIdx > pkgIdx) {
                return 'Cannot write to Packages/ directory (read-only in Unity).';
            }
        }
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
