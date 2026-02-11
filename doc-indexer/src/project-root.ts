import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';

/**
 * Walk up from startDir looking for a Unity project root.
 * Checks for `.unity-agentic/` first (already set up), then `Assets/` (Unity convention).
 * Returns the project root path or null if not found.
 */
export function find_project_root(startDir?: string): string | null {
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

/**
 * Resolve the doc-index storage path for a project.
 * Uses `.unity-agentic/doc-index.json` under the project root.
 * Falls back to `process.cwd()/.unity-docs-index.json` if no project root found.
 */
export function resolve_storage_path(projectRoot?: string | null): string {
    if (projectRoot) {
        return join(projectRoot, '.unity-agentic', 'doc-index.json');
    }
    return join(process.cwd(), '.unity-docs-index.json');
}
