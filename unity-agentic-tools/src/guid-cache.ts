import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname, isAbsolute } from 'path';
import { find_unity_project_root } from './utils';

/**
 * Shared interface for a loaded GUID cache with lookup helpers.
 * Centralizes the 7+ inline cache-loading sites across the codebase.
 */
export interface GuidCache {
    /** Absolute project root path. */
    project_path: string;
    /** Raw guid -> relative path map. */
    cache: Record<string, string>;
    /** Number of entries in the cache. */
    count: number;
    /** Forward lookup: resolve a GUID to a relative asset path (or null). */
    resolve(guid: string): string | null;
    /** Forward lookup: resolve a GUID to an absolute asset path (or null). */
    resolve_absolute(guid: string): string | null;
    /** Batch forward lookup. */
    resolve_many(guids: string[]): Record<string, string | null>;
    /** Reverse lookup: find a GUID+path by filename, optionally filtered by extension. */
    find_by_name(name: string, extension?: string): { guid: string; path: string } | null;
}

/** In-process cache keyed by project_path to avoid re-reading JSON. */
const _cache_store = new Map<string, GuidCache>();

/**
 * Build a GuidCache wrapper from a raw guid->path record.
 */
function build_guid_cache(project_path: string, raw: Record<string, string>): GuidCache {
    return {
        project_path,
        cache: raw,
        count: Object.keys(raw).length,

        resolve(guid: string): string | null {
            return raw[guid] ?? null;
        },

        resolve_absolute(guid: string): string | null {
            const rel = raw[guid];
            if (!rel) return null;
            // Some caches store absolute paths (e.g. test fixtures)
            if (isAbsolute(rel)) return rel;
            return join(project_path, rel);
        },

        resolve_many(guids: string[]): Record<string, string | null> {
            const result: Record<string, string | null> = {};
            for (const guid of guids) {
                result[guid] = raw[guid] ?? null;
            }
            return result;
        },

        find_by_name(name: string, extension?: string): { guid: string; path: string } | null {
            const nameLower = name.toLowerCase().replace(/\.[^.]+$/, '');
            let substringMatch: { guid: string; path: string } | null = null;

            for (const [guid, assetPath] of Object.entries(raw)) {
                if (extension && !assetPath.endsWith(extension)) continue;

                const fileName = basename(assetPath, extname(assetPath)).toLowerCase();

                // Exact filename match -- return immediately
                if (fileName === nameLower) {
                    return { guid, path: assetPath };
                }
                // Track first substring match as fallback
                if (!substringMatch && assetPath.toLowerCase().includes(nameLower)) {
                    substringMatch = { guid, path: assetPath };
                }
            }

            return substringMatch;
        },
    };
}

/**
 * Load the GUID cache for a Unity project at the given root path.
 * Returns null if the cache file doesn't exist.
 * Results are memoized in-process.
 */
export function load_guid_cache(project_path: string): GuidCache | null {
    const resolved = project_path;
    const existing = _cache_store.get(resolved);
    if (existing) return existing;

    const cachePath = join(resolved, '.unity-agentic', 'guid-cache.json');
    if (!existsSync(cachePath)) return null;

    try {
        const raw = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
        const cache = build_guid_cache(resolved, raw);
        _cache_store.set(resolved, cache);
        return cache;
    } catch {
        return null;
    }
}

/**
 * Load the GUID cache for a file by auto-discovering the project root.
 * If explicit_project is provided, it takes priority.
 * Returns null if no project root found or cache doesn't exist.
 */
export function load_guid_cache_for_file(file_path: string, explicit_project?: string): GuidCache | null {
    const project_path = explicit_project || find_unity_project_root(dirname(file_path));
    if (!project_path) return null;
    return load_guid_cache(project_path);
}

/**
 * Clear the in-process cache. Useful for testing.
 */
export function clear_guid_cache_store(): void {
    _cache_store.clear();
}
