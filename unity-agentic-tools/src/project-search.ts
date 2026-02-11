import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { UnityScanner, isNativeModuleAvailable, getNativeWalkProjectFiles, getNativeGrepProject } from './scanner';
import { glob_match } from './utils';
import type {
    ProjectSearchOptions,
    ProjectSearchResult,
    ProjectSearchMatch,
    ProjectGrepOptions,
    ProjectGrepResult,
    GrepMatch,
} from './types';

/** File extensions considered binary — skip for grep. */
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tga', '.psd', '.tif', '.tiff',
    '.fbx', '.obj', '.dae', '.blend', '.3ds', '.max',
    '.dll', '.so', '.dylib', '.exe', '.a', '.lib',
    '.mp3', '.wav', '.ogg', '.aif', '.aiff',
    '.mp4', '.mov', '.avi', '.wmv',
    '.zip', '.gz', '.tar', '.rar', '.7z',
    '.ttf', '.otf', '.woff', '.woff2',
    '.bank', '.bytes', '.db',
]);

/** Directories to always skip during walk. */
const SKIP_DIRS = new Set(['Library', 'Temp', 'obj', 'Logs', '.git', '.unity-agentic', 'node_modules']);

/**
 * Recursively walk a Unity project directory and collect files with given extensions.
 * Uses native Rust walker when available, falls back to JS implementation.
 */
export function walk_project_files(
    project_path: string,
    extensions: string[],
    exclude_dirs?: string[]
): string[] {
    // Try native Rust walker first
    const nativeWalk = getNativeWalkProjectFiles();
    if (nativeWalk) {
        try {
            return nativeWalk(project_path, extensions, exclude_dirs ?? null);
        } catch {
            // Fall through to JS implementation
        }
    }

    return walk_project_files_js(project_path, extensions, exclude_dirs);
}

/** JS fallback implementation of walk_project_files. */
function walk_project_files_js(
    project_path: string,
    extensions: string[],
    exclude_dirs?: string[]
): string[] {
    const result: string[] = [];
    const skipSet = new Set([...SKIP_DIRS, ...(exclude_dirs || [])]);
    const extSet = new Set(extensions.map(e => e.startsWith('.') ? e : `.${e}`));

    function walk(dir: string): void {
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }

        for (const entry of entries) {
            const full = path.join(dir, entry);

            let stat;
            try {
                stat = statSync(full);
            } catch {
                continue;
            }

            if (stat.isDirectory()) {
                if (!skipSet.has(entry)) {
                    walk(full);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(entry).toLowerCase();
                if (extSet.has(ext)) {
                    result.push(full);
                }
            }
        }
    }

    // Walk from Assets/ if it exists, otherwise from project root
    const assetsDir = path.join(project_path, 'Assets');
    if (existsSync(assetsDir)) {
        walk(assetsDir);
    }

    // Also check ProjectSettings/ for .asset files
    if (extSet.has('.asset')) {
        const settingsDir = path.join(project_path, 'ProjectSettings');
        if (existsSync(settingsDir)) {
            walk(settingsDir);
        }
    }

    return result;
}

/**
 * Search across all scene/prefab files in a Unity project for GameObjects.
 */
export function search_project(options: ProjectSearchOptions): ProjectSearchResult {
    const {
        project_path,
        name,
        component,
        tag,
        layer,
        file_type = 'all',
        page_size = 50,
        cursor = 0,
        max_matches,
        scan_all = false,
    } = options;

    if (max_matches !== undefined && max_matches < 1) {
        return {
            success: false,
            project_path,
            total_files_scanned: 0,
            total_matches: 0,
            cursor: 0,
            truncated: false,
            matches: [],
            error: '--max-matches must be a positive integer (>= 1)',
        };
    }

    if (name !== undefined && name.trim() === '') {
        return {
            success: false,
            project_path,
            total_files_scanned: 0,
            total_matches: 0,
            cursor: 0,
            truncated: false,
            matches: [],
            error: 'Name pattern must not be empty',
        };
    }

    if (!existsSync(project_path)) {
        return {
            success: false,
            project_path,
            total_files_scanned: 0,
            total_matches: 0,
            cursor: 0,
            truncated: false,
            matches: [],
            error: `Project path not found: ${project_path}`,
        };
    }

    if (!isNativeModuleAvailable()) {
        return {
            success: false,
            project_path,
            total_files_scanned: 0,
            total_matches: 0,
            cursor: 0,
            truncated: false,
            matches: [],
            error: 'Native scanner module not available. Run bun install in the project root.',
        };
    }

    // Determine extensions to scan
    const extensions: string[] = [];
    if (file_type === 'scene' || file_type === 'all') extensions.push('.unity');
    if (file_type === 'prefab' || file_type === 'all') extensions.push('.prefab');

    const files = walk_project_files(project_path, extensions);

    // Apply file-level pagination (bypass when scan_all is true)
    const paginatedFiles = scan_all ? files : files.slice(cursor, cursor + page_size);
    const truncated = scan_all ? false : cursor + page_size < files.length;
    const next_cursor = truncated ? cursor + page_size : undefined;

    const scanner = new UnityScanner();
    const matches: ProjectSearchMatch[] = [];

    for (const file of paginatedFiles) {
        try {
            let gameObjects;

            // Need full GO data when filtering by tag, layer, or component
            const needFullData = !!(component || tag || layer !== undefined);

            if (name && !needFullData) {
                // Use fuzzy name search (lightweight)
                gameObjects = scanner.find_by_name(file, name, true);
            } else if (needFullData) {
                // Need full GO data for tag/layer/component filtering
                gameObjects = scanner.scan_scene_with_components(file);
                // If name filter is also specified, post-filter by name
                if (name) {
                    const nameLower = name.toLowerCase();
                    const hasWildcard = name.includes('*') || name.includes('?');
                    gameObjects = gameObjects.filter((go: any) => {
                        if (!go.name) return false;
                        if (hasWildcard) {
                            return glob_match(name, go.name);
                        }
                        return go.name.toLowerCase().includes(nameLower);
                    });
                }
            } else {
                gameObjects = scanner.scan_scene_minimal(file);
            }

            // Apply filters
            for (const go of gameObjects) {
                // When using name search, results are FindResult union type.
                // Tag/layer/component filters only apply to GameObjects (not PrefabInstances).
                const goAny = go as any;
                const isPrefab = goAny.resultType === 'PrefabInstance';

                if (isPrefab && (component || tag || layer !== undefined)) {
                    continue;
                }

                // Component filter (supports glob patterns: * and ?)
                if (component) {
                    if (goAny.components) {
                        const hasComponent = goAny.components.some(
                            (c: any) => glob_match(component, c.type)
                        );
                        if (!hasComponent) continue;
                    } else {
                        continue;
                    }
                }

                // Tag filter
                if (tag && goAny.tag !== tag) continue;

                // Layer filter
                if (layer !== undefined && goAny.layer !== layer) continue;

                const relPath = path.relative(project_path, file);

                const match: ProjectSearchMatch = {
                    file: relPath,
                    game_object: go.name,
                    file_id: goAny.fileId || goAny.file_id,
                    tag: goAny.tag,
                    layer: goAny.layer,
                };

                // Include component types if available
                if (goAny.components) {
                    match.components = goAny.components.map((c: any) => c.type);
                }

                matches.push(match);

                if (max_matches !== undefined && matches.length >= max_matches) break;
            }

            if (max_matches !== undefined && matches.length >= max_matches) break;
        } catch {
            // Skip files that can't be parsed
            continue;
        }
    }

    return {
        success: true,
        project_path,
        total_files_scanned: paginatedFiles.length,
        total_matches: matches.length,
        cursor,
        next_cursor,
        truncated: truncated || (max_matches !== undefined && matches.length >= max_matches),
        matches,
    };
}

// ========== Project Grep ==========

/**
 * Search for a regex pattern across project files.
 * Uses native Rust grep when available, falls back to JS implementation.
 */
export function grep_project(options: ProjectGrepOptions): ProjectGrepResult {
    // Try native Rust grep first
    const nativeGrep = getNativeGrepProject();
    if (nativeGrep) {
        try {
            const nativeResult = nativeGrep({
                projectPath: options.project_path,
                pattern: options.pattern,
                fileType: options.file_type,
                maxResults: options.max_results,
                contextLines: options.context_lines,
            });
            // Map camelCase napi result to snake_case TS types
            return {
                success: nativeResult.success,
                project_path: nativeResult.projectPath,
                pattern: nativeResult.pattern,
                total_files_scanned: nativeResult.totalFilesScanned,
                total_matches: nativeResult.totalMatches,
                truncated: nativeResult.truncated,
                error: nativeResult.error,
                matches: nativeResult.matches.map((m: any) => ({
                    file: m.file,
                    line_number: m.lineNumber,
                    line: m.line,
                    context_before: m.contextBefore,
                    context_after: m.contextAfter,
                })),
            };
        } catch {
            // Fall through to JS implementation
        }
    }

    return grep_project_js(options);
}

/** JS fallback implementation of grep_project. */
function grep_project_js(options: ProjectGrepOptions): ProjectGrepResult {
    const {
        project_path,
        pattern,
        file_type = 'all',
        max_results = 100,
        context_lines = 0,
    } = options;

    if (!existsSync(project_path)) {
        return {
            success: false,
            project_path,
            pattern,
            total_files_scanned: 0,
            total_matches: 0,
            truncated: false,
            matches: [],
            error: `Project path not found: ${project_path}`,
        };
    }

    // Compile regex
    let regex: RegExp;
    try {
        regex = new RegExp(pattern, 'i');
    } catch (err) {
        return {
            success: false,
            project_path,
            pattern,
            total_files_scanned: 0,
            total_matches: 0,
            truncated: false,
            matches: [],
            error: `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Determine extensions
    const EXTENSION_MAP: Record<string, string[]> = {
        cs: ['.cs'],
        yaml: ['.yaml', '.yml', '.unity', '.prefab', '.asset'],
        unity: ['.unity'],
        prefab: ['.prefab'],
        asset: ['.asset'],
        all: ['.cs', '.unity', '.prefab', '.asset', '.yaml', '.yml', '.txt', '.json', '.xml', '.shader', '.cginc', '.hlsl', '.compute', '.asmdef', '.asmref'],
    };

    const extensions = EXTENSION_MAP[file_type] || EXTENSION_MAP.all;
    const files = walk_project_files(project_path, extensions);

    const matches: GrepMatch[] = [];
    let totalFilesScanned = 0;
    let truncated = false;

    for (const file of files) {
        // Skip binary files
        const ext = path.extname(file).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        totalFilesScanned++;

        let content: string;
        try {
            content = readFileSync(file, 'utf-8');
        } catch {
            continue;
        }

        const lines = content.split('\n');
        const relPath = path.relative(project_path, file);

        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                // Truncate long lines for token efficiency
                let line = lines[i];
                if (line.length > 200) {
                    line = line.substring(0, 200) + '...';
                }

                const match: GrepMatch = {
                    file: relPath,
                    line_number: i + 1,
                    line,
                };

                // Add context lines if requested
                if (context_lines > 0) {
                    match.context_before = [];
                    match.context_after = [];

                    for (let j = Math.max(0, i - context_lines); j < i; j++) {
                        let ctxLine = lines[j];
                        if (ctxLine.length > 200) ctxLine = ctxLine.substring(0, 200) + '...';
                        match.context_before.push(ctxLine);
                    }

                    for (let j = i + 1; j <= Math.min(lines.length - 1, i + context_lines); j++) {
                        let ctxLine = lines[j];
                        if (ctxLine.length > 200) ctxLine = ctxLine.substring(0, 200) + '...';
                        match.context_after.push(ctxLine);
                    }
                }

                matches.push(match);

                if (matches.length >= max_results) {
                    truncated = true;
                    break;
                }
            }
        }

        if (truncated) break;
    }

    return {
        success: true,
        project_path,
        pattern,
        total_files_scanned: totalFilesScanned,
        total_matches: matches.length,
        truncated,
        matches,
    };
}
