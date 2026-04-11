import { dirname, relative, resolve, sep } from 'path';
import { call_editor, discover_editor_config } from './editor-client';
import { find_unity_project_root, resolve_project_path } from './utils';

interface LoadedState {
    loaded_scene_paths: string[];
    active_scene_path?: string;
    prefab_stage_path?: string;
}

function normalize_slashes(value: string): string {
    return value.replace(/\\/g, '/');
}

function to_project_asset_path(file_path: string, project_path: string): string | null {
    const abs_file = resolve(file_path);
    const abs_project = resolve(project_path);
    const rel = relative(abs_project, abs_file);
    if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) {
        if (/^Assets[\\/]/.test(file_path)) {
            return normalize_slashes(file_path);
        }
        return null;
    }
    return normalize_slashes(rel);
}

function normalize_loaded_paths(paths: string[]): Set<string> {
    return new Set(paths.map(p => normalize_slashes(p)));
}

async function get_loaded_state(project_path: string): Promise<LoadedState | null> {
    const config = await discover_editor_config(project_path);
    if ('error' in config) return null;

    const response = await call_editor({
        project_path,
        method: 'editor.scene.loaded',
        timeout: 2500,
    });

    if (response.error || !response.result || typeof response.result !== 'object') {
        return null;
    }

    const result = response.result as Record<string, unknown>;
    const loaded = Array.isArray(result.loaded_scene_paths)
        ? result.loaded_scene_paths.filter((v): v is string => typeof v === 'string')
        : [];

    return {
        loaded_scene_paths: loaded,
        active_scene_path: typeof result.active_scene_path === 'string' ? result.active_scene_path : undefined,
        prefab_stage_path: typeof result.prefab_stage_path === 'string' ? result.prefab_stage_path : undefined,
    };
}

export async function is_editor_connected_for_project(project_path: string): Promise<boolean> {
    const resolved_project = resolve_project_path(project_path);
    const config = await discover_editor_config(resolved_project);
    return !('error' in config);
}

export async function enforce_loaded_edit_protection(
    file_path: string,
    bypass: boolean | undefined,
    project_path?: string,
): Promise<{ allowed: boolean; error?: string }> {
    if (bypass) return { allowed: true };

    const ext = file_path.toLowerCase().split('.').pop();
    if (!ext || (ext !== 'unity' && ext !== 'prefab')) {
        return { allowed: true };
    }

    const inferred_project = project_path
        ? resolve_project_path(project_path)
        : find_unity_project_root(dirname(resolve(file_path))) || process.cwd();

    const loaded_state = await get_loaded_state(inferred_project);
    if (!loaded_state) {
        return { allowed: true };
    }

    const target_asset_path = to_project_asset_path(file_path, inferred_project);
    if (!target_asset_path) {
        return { allowed: true };
    }

    const loaded_scenes = normalize_loaded_paths(loaded_state.loaded_scene_paths);
    const active_scene = loaded_state.active_scene_path ? normalize_slashes(loaded_state.active_scene_path) : '';
    const prefab_stage = loaded_state.prefab_stage_path ? normalize_slashes(loaded_state.prefab_stage_path) : '';

    if (target_asset_path.endsWith('.unity')) {
        if (loaded_scenes.has(target_asset_path)) {
            const reason = active_scene === target_asset_path
                ? 'it is currently the active scene in the Unity Editor'
                : 'it is currently loaded in the Unity Editor';
            return {
                allowed: false,
                error: `Refusing to edit ${target_asset_path}: ${reason}. Use --bypass-loaded-protection to force file-based edits while editor is connected.`,
            };
        }
    }

    if (target_asset_path.endsWith('.prefab')) {
        if (prefab_stage === target_asset_path) {
            return {
                allowed: false,
                error: `Refusing to edit ${target_asset_path}: it is currently open in Prefab Mode. Use --bypass-loaded-protection to force file-based edits while editor is connected.`,
            };
        }
    }

    return { allowed: true };
}
