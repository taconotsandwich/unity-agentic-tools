import * as fs from 'fs';
import * as path from 'path';
import { parse_editor_build_settings, SceneEntry } from './build-settings';

export interface EditResult {
    success: boolean;
    message: string;
    scenes?: SceneEntry[];
}

/**
 * Get the EditorBuildSettings.asset path for a project
 */
function get_build_settings_path(projectPath: string): string {
    return path.join(projectPath, 'ProjectSettings', 'EditorBuildSettings.asset');
}

/**
 * Read the raw content of EditorBuildSettings.asset
 */
function read_build_settings_content(projectPath: string): string {
    const filePath = get_build_settings_path(projectPath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Generate YAML for a scene entry
 */
function scene_to_yaml(scene: { enabled: boolean; path: string; guid: string }): string {
    return `  - enabled: ${scene.enabled ? 1 : 0}
    path: ${scene.path}
    guid: ${scene.guid}`;
}

/**
 * Write scenes back to EditorBuildSettings.asset
 */
function write_scenes(projectPath: string, scenes: Array<{ enabled: boolean; path: string; guid: string }>): void {
    const filePath = get_build_settings_path(projectPath);
    const content = read_build_settings_content(projectPath);

    // Build the new m_Scenes section
    const scenesYaml = scenes.map(scene_to_yaml).join('\n');

    // Replace the m_Scenes section
    // Match from "m_Scenes:" to the next top-level key (m_configObjects or end)
    const newContent = content.replace(
        /m_Scenes:[\s\S]*?(?=\s+m_configObjects:|$)/,
        `m_Scenes:\n${scenesYaml}\n  `
    );

    // Write atomically using temp file
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, newContent, 'utf-8');
    fs.renameSync(tempPath, filePath);
}

/**
 * Get GUID for a scene from its .meta file
 */
function get_scene_guid(projectPath: string, scenePath: string): string | null {
    const fullPath = path.join(projectPath, scenePath);
    const metaPath = fullPath + '.meta';

    if (!fs.existsSync(metaPath)) {
        return null;
    }

    const content = fs.readFileSync(metaPath, 'utf-8');
    const match = content.match(/guid:\s*([a-f0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Add a scene to the build settings
 */
export function add_scene(
    projectPath: string,
    scenePath: string,
    options?: { enabled?: boolean; position?: number }
): EditResult {
    const enabled = options?.enabled ?? true;
    const position = options?.position;

    // Validate scene exists
    const fullScenePath = path.join(projectPath, scenePath);
    if (!fs.existsSync(fullScenePath)) {
        return { success: false, message: `Scene file not found: ${scenePath}` };
    }

    // Get GUID from .meta file
    const guid = get_scene_guid(projectPath, scenePath);
    if (!guid) {
        return { success: false, message: `Could not find GUID for scene: ${scenePath}. Missing .meta file?` };
    }

    // Parse current scenes
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = parse_editor_build_settings(buildSettingsPath);

    // Check if already exists
    if (current.scenes.some(s => s.path === scenePath)) {
        return { success: false, message: `Scene already in build settings: ${scenePath}` };
    }

    // Create new scene entry
    const newScene = { enabled, path: scenePath, guid };

    // Build new scene list
    const scenes = current.scenes.map(s => ({
        enabled: s.enabled,
        path: s.path,
        guid: s.guid || '',
    }));

    if (position !== undefined && position >= 0 && position <= scenes.length) {
        scenes.splice(position, 0, newScene);
    } else {
        scenes.push(newScene);
    }

    // Write back
    write_scenes(projectPath, scenes);

    // Return updated scene list
    const updated = parse_editor_build_settings(buildSettingsPath);
    return {
        success: true,
        message: `Added scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}

/**
 * Remove a scene from the build settings
 */
export function remove_scene(projectPath: string, scenePath: string): EditResult {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = parse_editor_build_settings(buildSettingsPath);

    // Find scene
    const sceneIndex = current.scenes.findIndex(s => s.path === scenePath);
    if (sceneIndex === -1) {
        return { success: false, message: `Scene not found in build settings: ${scenePath}` };
    }

    // Build new scene list without the removed scene
    const scenes = current.scenes
        .filter(s => s.path !== scenePath)
        .map(s => ({
            enabled: s.enabled,
            path: s.path,
            guid: s.guid || '',
        }));

    // Write back
    write_scenes(projectPath, scenes);

    // Return updated scene list
    const updated = parse_editor_build_settings(buildSettingsPath);
    return {
        success: true,
        message: `Removed scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}

/**
 * Enable a scene in the build settings
 */
export function enable_scene(projectPath: string, scenePath: string): EditResult {
    return set_scene_enabled(projectPath, scenePath, true);
}

/**
 * Disable a scene in the build settings
 */
export function disable_scene(projectPath: string, scenePath: string): EditResult {
    return set_scene_enabled(projectPath, scenePath, false);
}

/**
 * Set enabled state for a scene
 */
function set_scene_enabled(projectPath: string, scenePath: string, enabled: boolean): EditResult {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = parse_editor_build_settings(buildSettingsPath);

    // Find scene
    const sceneIndex = current.scenes.findIndex(s => s.path === scenePath);
    if (sceneIndex === -1) {
        return { success: false, message: `Scene not found in build settings: ${scenePath}` };
    }

    const scene = current.scenes[sceneIndex];
    if (scene.enabled === enabled) {
        return {
            success: true,
            message: `Scene already ${enabled ? 'enabled' : 'disabled'}: ${scenePath}`,
            scenes: current.scenes,
        };
    }

    // Build new scene list with updated enabled state
    const scenes = current.scenes.map(s => ({
        enabled: s.path === scenePath ? enabled : s.enabled,
        path: s.path,
        guid: s.guid || '',
    }));

    // Write back
    write_scenes(projectPath, scenes);

    // Return updated scene list
    const updated = parse_editor_build_settings(buildSettingsPath);
    return {
        success: true,
        message: `${enabled ? 'Enabled' : 'Disabled'} scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}

/**
 * Move a scene to a new position in the build order
 */
export function move_scene(projectPath: string, scenePath: string, newPosition: number): EditResult {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = parse_editor_build_settings(buildSettingsPath);

    // Find scene
    const sceneIndex = current.scenes.findIndex(s => s.path === scenePath);
    if (sceneIndex === -1) {
        return { success: false, message: `Scene not found in build settings: ${scenePath}` };
    }

    // Validate position
    if (newPosition < 0 || newPosition >= current.scenes.length) {
        return {
            success: false,
            message: `Invalid position: ${newPosition}. Must be 0-${current.scenes.length - 1}`,
        };
    }

    if (sceneIndex === newPosition) {
        return {
            success: true,
            message: `Scene already at position ${newPosition}: ${scenePath}`,
            scenes: current.scenes,
        };
    }

    // Build new scene list with reordered scenes
    const scenes = current.scenes.map(s => ({
        enabled: s.enabled,
        path: s.path,
        guid: s.guid || '',
    }));

    // Remove from old position and insert at new position
    const [movedScene] = scenes.splice(sceneIndex, 1);
    scenes.splice(newPosition, 0, movedScene);

    // Write back
    write_scenes(projectPath, scenes);

    // Return updated scene list
    const updated = parse_editor_build_settings(buildSettingsPath);
    return {
        success: true,
        message: `Moved scene to position ${newPosition}: ${scenePath}`,
        scenes: updated.scenes,
    };
}

/**
 * Reorder all scenes by providing a new order
 */
export function reorder_scenes(projectPath: string, scenePaths: string[]): EditResult {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = parse_editor_build_settings(buildSettingsPath);

    // Validate all scenes exist
    const currentPaths = new Set(current.scenes.map(s => s.path));
    const newPaths = new Set(scenePaths);

    // Check for missing scenes in new order
    for (const path of currentPaths) {
        if (!newPaths.has(path)) {
            return {
                success: false,
                message: `Missing scene in new order: ${path}`,
            };
        }
    }

    // Check for unknown scenes in new order
    for (const path of scenePaths) {
        if (!currentPaths.has(path)) {
            return {
                success: false,
                message: `Unknown scene in new order: ${path}`,
            };
        }
    }

    // Check for duplicates
    if (scenePaths.length !== newPaths.size) {
        return {
            success: false,
            message: 'Duplicate scenes in new order',
        };
    }

    // Build scene map for quick lookup
    const sceneMap = new Map(current.scenes.map(s => [s.path, s]));

    // Build new scene list in specified order
    const scenes = scenePaths.map(p => {
        const s = sceneMap.get(p)!;
        return {
            enabled: s.enabled,
            path: s.path,
            guid: s.guid || '',
        };
    });

    // Write back
    write_scenes(projectPath, scenes);

    // Return updated scene list
    const updated = parse_editor_build_settings(buildSettingsPath);
    return {
        success: true,
        message: `Reordered ${scenes.length} scenes`,
        scenes: updated.scenes,
    };
}
