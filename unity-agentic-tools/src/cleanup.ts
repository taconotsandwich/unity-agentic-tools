import { existsSync, unlinkSync, rmdirSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const CONFIG_DIR = '.unity-agentic';
const GUID_CACHE_FILE = 'guid-cache.json';
const PACKAGE_CACHE_FILE = 'package-cache.json';
const LOCAL_PACKAGE_CACHE_FILE = 'local-package-cache.json';
const TYPE_REGISTRY_FILE = 'type-registry.json';
const DOC_INDEX_FILE = 'doc-index.json';
const EDITOR_LOCK_FILE = 'editor.json';
const LAST_EDITOR_CONFIG_FILE = 'editor.last.json';

type CleanupMode = 'stale' | 'cache' | 'all';

export interface CleanupOptions {
    project?: string;
    stale?: boolean;
    cache?: boolean;
    all?: boolean;
}

export interface CleanupResult {
    success: boolean;
    project_path: string;
    modes: CleanupMode[];
    files_removed: string[];
    directory_removed: boolean;
    error?: string;
}

/**
 * Clean up unity-agentic generated state from a Unity project.
 */
export function cleanup(options: CleanupOptions = {}): CleanupResult {
    const projectPath = resolve(options.project || process.cwd());
    const configPath = join(projectPath, CONFIG_DIR);
    const modes = resolve_cleanup_modes(options);

    if (!existsSync(configPath)) {
        return {
            success: true,
            project_path: projectPath,
            modes,
            files_removed: [],
            directory_removed: false,
        };
    }

    const filesRemoved: string[] = [];
    let directoryRemoved = false;

    if (modes.includes('all')) {
        try {
            removeDirectoryRecursive(configPath);
            directoryRemoved = true;
            filesRemoved.push(CONFIG_DIR);
        } catch (err: unknown) {
            return {
                success: false,
                project_path: projectPath,
                modes,
                files_removed: filesRemoved,
                directory_removed: false,
                error: `Failed to remove directory: ${err instanceof Error ? err.message : String(err)}`,
            };
        }

        return {
            success: true,
            project_path: projectPath,
            modes,
            files_removed: filesRemoved,
            directory_removed: directoryRemoved,
        };
    }

    if (modes.includes('stale')) {
        remove_stale_lock_files(configPath, filesRemoved);
    }

    if (modes.includes('cache')) {
        remove_files(configPath, [
            GUID_CACHE_FILE,
            PACKAGE_CACHE_FILE,
            LOCAL_PACKAGE_CACHE_FILE,
            TYPE_REGISTRY_FILE,
            DOC_INDEX_FILE,
        ], filesRemoved);
    }

    return {
        success: true,
        project_path: projectPath,
        modes,
        files_removed: filesRemoved,
        directory_removed: directoryRemoved,
    };
}

function resolve_cleanup_modes(options: CleanupOptions): CleanupMode[] {
    if (options.all) {
        return ['all'];
    }

    const modes: CleanupMode[] = [];
    if (options.stale || !options.cache) {
        modes.push('stale');
    }
    if (options.cache) {
        modes.push('cache');
    }

    return modes;
}

function remove_stale_lock_files(configPath: string, filesRemoved: string[]): void {
    const editorLockPath = join(configPath, EDITOR_LOCK_FILE);
    if (existsSync(editorLockPath) && is_stale_editor_lock(editorLockPath)) {
        remove_file(configPath, EDITOR_LOCK_FILE, filesRemoved);
    }

    remove_file(configPath, LAST_EDITOR_CONFIG_FILE, filesRemoved);
}

function is_stale_editor_lock(filePath: string): boolean {
    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
        if (!is_record(parsed)) {
            return true;
        }

        const pid = parsed.pid;
        return typeof pid !== 'number' || !is_process_alive(pid);
    } catch {
        return true;
    }
}

function is_process_alive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch (err: unknown) {
        return is_record(err) && err.code === 'EPERM';
    }
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function remove_files(configPath: string, files: string[], filesRemoved: string[]): void {
    for (const file of files) {
        remove_file(configPath, file, filesRemoved);
    }
}

function remove_file(configPath: string, file: string, filesRemoved: string[]): void {
    const filePath = join(configPath, file);
    if (!existsSync(filePath)) {
        return;
    }

    try {
        unlinkSync(filePath);
        filesRemoved.push(file);
    } catch {
        // Keep cleanup best-effort for individual generated files.
    }
}

/**
 * Recursively remove a directory and all its contents
 */
function removeDirectoryRecursive(dir: string): void {
    if (!existsSync(dir)) {
        return;
    }

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            removeDirectoryRecursive(fullPath);
        } else {
            unlinkSync(fullPath);
        }
    }

    rmdirSync(dir);
}
