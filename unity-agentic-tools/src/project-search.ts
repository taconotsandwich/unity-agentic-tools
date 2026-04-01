import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { UnityScanner, isNativeModuleAvailable, getNativeWalkProjectFiles, getNativeGrepProject } from './scanner';
import { glob_match, is_match_all } from './utils';
import type {
    ProjectSearchOptions,
    ProjectSearchResult,
    ProjectSearchMatch,
    ProjectGrepOptions,
    ProjectGrepResult,
    GrepMatch,
    FindResult,
    GameObject,
    GameObjectWithComponents,
    Component,
} from './types';

/** Union of all possible search result item types. */
type SearchResultItem = FindResult | GameObject | GameObjectWithComponents;

/** Shape of the native Rust grepProject NAPI result (camelCase). */
interface NativeGrepResult {
    success: boolean;
    projectPath: string;
    pattern: string;
    totalFilesScanned: number;
    totalMatches: number;
    truncated: boolean;
    error?: string;
    matches: NativeGrepMatch[];
}

/** Shape of a single match from the native Rust grepProject NAPI call (camelCase). */
interface NativeGrepMatch {
    file: string;
    lineNumber: number;
    line: string;
    contextBefore?: string[];
    contextAfter?: string[];
}

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

    // Walk from Assets/ if it exists, otherwise walk project_path directly
    // (handles both project-root paths and subdirectory paths like Assets/Subdir/)
    const assetsDir = path.join(project_path, 'Assets');
    if (existsSync(assetsDir)) {
        walk(assetsDir);
    } else {
        walk(project_path);
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
        exact = false,
        component,
        tag,
        layer,
        file_type = 'all',
        max_matches,
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

    // Extension map for asset file types (non-scene/prefab)
    const ASSET_TYPE_EXTENSIONS: Record<string, string[]> = {
        mat: ['.mat'],
        anim: ['.anim'],
        controller: ['.controller'],
        asset: ['.asset'],
    };

    // For asset types (mat, anim, controller, asset), use simple file walk + name matching
    const isAssetType = file_type in ASSET_TYPE_EXTENSIONS;
    if (isAssetType) {
        const extensions = ASSET_TYPE_EXTENSIONS[file_type];
        const files = walk_project_files(project_path, extensions);
        const matches: ProjectSearchMatch[] = [];

        for (const file of files) {
            const relPath = path.relative(project_path, file);
            const fileName = path.basename(file, path.extname(file));

            // Apply name filter if specified
            if (name) {
                const nameLower = name.toLowerCase();
                const hasWildcard = name.includes('*') || name.includes('?');
                if (hasWildcard) {
                    if (!glob_match(name, fileName)) continue;
                } else if (exact) {
                    if (fileName !== name) continue;
                } else {
                    if (!fileName.toLowerCase().includes(nameLower)) continue;
                }
            }

            // Try to extract m_Name from the first ~20 lines for display
            let display_name = fileName;
            try {
                const content = readFileSync(file, 'utf-8');
                const nameMatch = /^\s*m_Name:\s*(.+)$/m.exec(content.slice(0, 2000));
                if (nameMatch) display_name = nameMatch[1].trim();
            } catch { /* use filename */ }

            matches.push({
                file: relPath,
                game_object: display_name,
                file_id: '0',
            });

            if (max_matches !== undefined && matches.length >= max_matches) break;
        }

        return {
            success: true,
            project_path,
            total_files_scanned: files.length,
            total_matches: matches.length,
            cursor: 0,
            truncated: max_matches !== undefined && matches.length >= max_matches,
            matches,
        };
    }

    // Scene/prefab types require the native scanner
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

    // Determine extensions to scan (scene/prefab types use the scanner)
    const extensions: string[] = [];
    if (file_type === 'scene' || file_type === 'all') extensions.push('.unity');
    if (file_type === 'prefab' || file_type === 'all') extensions.push('.prefab');

    const files = walk_project_files(project_path, extensions);

    const scanner = new UnityScanner();
    const matches: ProjectSearchMatch[] = [];
    let files_with_errors = 0;

    for (const file of files) {
        try {
            let gameObjects;

            // Three-path search strategy:
            // 1. Name-only: find_by_name (fast — regex match, no block extraction)
            // 2. Tag/layer without component: scan_scene_metadata (medium — GO block only)
            // 3. Component filter: scan_scene_with_components (slow — full extraction)
            const needComponents = !!component;
            const needMetadata = !!(tag || layer !== undefined);

            if (name && !needMetadata && !needComponents) {
                // Fast path: name search only
                gameObjects = scanner.find_by_name(file, name, !exact);
            } else if (needComponents) {
                // Slow path: need full component data
                gameObjects = scanner.scan_scene_with_components(file);
                // If name filter is also specified, post-filter by name
                if (name && !is_match_all(name)) {
                    const nameLower = name.toLowerCase();
                    const hasWildcard = name.includes('*') || name.includes('?');
                    gameObjects = gameObjects.filter((go: GameObjectWithComponents) => {
                        if (!go.name) return false;
                        if (hasWildcard) {
                            return glob_match(name, go.name);
                        }
                        if (exact) {
                            return go.name === name;
                        }
                        return go.name.toLowerCase().includes(nameLower);
                    });
                }
            } else if (needMetadata) {
                // Medium path: tag/layer only — no component extraction
                gameObjects = scanner.scan_scene_metadata(file);
                // If name filter is also specified, post-filter by name
                if (name && !is_match_all(name)) {
                    const nameLower = name.toLowerCase();
                    const hasWildcard = name.includes('*') || name.includes('?');
                    gameObjects = gameObjects.filter((go: GameObjectWithComponents) => {
                        if (!go.name) return false;
                        if (hasWildcard) {
                            return glob_match(name, go.name);
                        }
                        if (exact) {
                            return go.name === name;
                        }
                        return go.name.toLowerCase().includes(nameLower);
                    });
                }
            } else {
                gameObjects = scanner.scan_scene_minimal(file);
            }

            // Apply filters
            for (const go of gameObjects as SearchResultItem[]) {
                // When using name search, results are FindResult union type.
                // Tag/layer/component filters only apply to GameObjects (not PrefabInstances).
                const isFindResult = 'resultType' in go;
                const isPrefab = isFindResult && (go as FindResult).resultType === 'PrefabInstance';

                if (isPrefab && (component || tag || layer !== undefined)) {
                    continue;
                }

                // Component filter (supports glob patterns: * and ?)
                if (component) {
                    if ('components' in go && go.components) {
                        const hasComponent = (go.components as Component[]).some(
                            (c) => glob_match(component, c.type)
                        );
                        if (!hasComponent) continue;
                    } else {
                        continue;
                    }
                }

                // Tag filter — skip if tag is missing or doesn't match
                if (tag) {
                    if (!('tag' in go) || go.tag !== tag) continue;
                }

                // Layer filter — skip if layer is missing or doesn't match
                if (layer !== undefined) {
                    if (!('layer' in go) || go.layer !== layer) continue;
                }

                const relPath = path.relative(project_path, file);

                const fileId = isFindResult
                    ? (go as FindResult).fileId
                    : (go as GameObject).file_id;

                const match: ProjectSearchMatch = {
                    file: relPath,
                    game_object: go.name,
                    file_id: fileId,
                    tag: 'tag' in go ? go.tag as string : undefined,
                    layer: 'layer' in go ? go.layer as number : undefined,
                };

                // Include component types if available
                if ('components' in go && go.components) {
                    match.components = (go.components as Component[]).map((c) => c.type);
                }

                matches.push(match);

                if (max_matches !== undefined && matches.length >= max_matches) break;
            }

            if (max_matches !== undefined && matches.length >= max_matches) break;
        } catch {
            files_with_errors++;
            continue;
        }
    }

    return {
        success: true,
        project_path,
        total_files_scanned: files.length,
        total_matches: matches.length,
        files_with_errors: files_with_errors > 0 ? files_with_errors : undefined,
        cursor: 0,
        truncated: max_matches !== undefined && matches.length >= max_matches,
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
            }) as NativeGrepResult;
            // Map camelCase napi result to snake_case TS types
            return {
                success: nativeResult.success,
                project_path: nativeResult.projectPath,
                pattern: nativeResult.pattern,
                total_files_scanned: nativeResult.totalFilesScanned,
                total_matches: nativeResult.totalMatches,
                truncated: nativeResult.truncated,
                error: nativeResult.error,
                matches: nativeResult.matches.map((m: NativeGrepMatch) => ({
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
        yaml: [
            '.yaml', '.yml', '.unity', '.prefab', '.asset',
            '.mat', '.anim', '.controller', '.overrideController',
            '.mask', '.mixer', '.lighting', '.preset', '.signal',
            '.playable', '.renderTexture', '.flare', '.guiskin',
            '.terrainlayer', '.cubemap',
        ],
        unity: ['.unity'],
        prefab: ['.prefab'],
        asset: ['.asset'],
        mat: ['.mat'],
        anim: ['.anim'],
        controller: ['.controller'],
        all: [
            '.cs', '.unity', '.prefab', '.asset', '.mat', '.anim', '.controller',
            '.yaml', '.yml', '.txt', '.json', '.xml', '.shader', '.cginc', '.hlsl',
            '.compute', '.asmdef', '.asmref',
        ],
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
