"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.add_scene = add_scene;
exports.remove_scene = remove_scene;
exports.enable_scene = enable_scene;
exports.disable_scene = disable_scene;
exports.move_scene = move_scene;
exports.reorder_scenes = reorder_scenes;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const build_settings_1 = require("./build-settings");
/**
 * Get the EditorBuildSettings.asset path for a project
 */
function get_build_settings_path(projectPath) {
    return path.join(projectPath, 'ProjectSettings', 'EditorBuildSettings.asset');
}
/**
 * Read the raw content of EditorBuildSettings.asset
 */
function read_build_settings_content(projectPath) {
    const filePath = get_build_settings_path(projectPath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
}
/**
 * Generate YAML for a scene entry
 */
function scene_to_yaml(scene) {
    return `  - enabled: ${scene.enabled ? 1 : 0}
    path: ${scene.path}
    guid: ${scene.guid}`;
}
/**
 * Write scenes back to EditorBuildSettings.asset
 */
function write_scenes(projectPath, scenes) {
    const filePath = get_build_settings_path(projectPath);
    const content = read_build_settings_content(projectPath);
    // Build the new m_Scenes section
    const scenesYaml = scenes.map(scene_to_yaml).join('\n');
    // Replace the m_Scenes section
    // Match from "m_Scenes:" to the next top-level key (m_configObjects or end)
    const newContent = content.replace(/m_Scenes:[\s\S]*?(?=\s+m_configObjects:|$)/, `m_Scenes:\n${scenesYaml}\n  `);
    // Write atomically using temp file
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, newContent, 'utf-8');
    fs.renameSync(tempPath, filePath);
}
/**
 * Get GUID for a scene from its .meta file
 */
function get_scene_guid(projectPath, scenePath) {
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
function add_scene(projectPath, scenePath, options) {
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
    const current = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
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
    }
    else {
        scenes.push(newScene);
    }
    // Write back
    write_scenes(projectPath, scenes);
    // Return updated scene list
    const updated = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
    return {
        success: true,
        message: `Added scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}
/**
 * Remove a scene from the build settings
 */
function remove_scene(projectPath, scenePath) {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
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
    const updated = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
    return {
        success: true,
        message: `Removed scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}
/**
 * Enable a scene in the build settings
 */
function enable_scene(projectPath, scenePath) {
    return set_scene_enabled(projectPath, scenePath, true);
}
/**
 * Disable a scene in the build settings
 */
function disable_scene(projectPath, scenePath) {
    return set_scene_enabled(projectPath, scenePath, false);
}
/**
 * Set enabled state for a scene
 */
function set_scene_enabled(projectPath, scenePath, enabled) {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
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
    const updated = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
    return {
        success: true,
        message: `${enabled ? 'Enabled' : 'Disabled'} scene: ${scenePath}`,
        scenes: updated.scenes,
    };
}
/**
 * Move a scene to a new position in the build order
 */
function move_scene(projectPath, scenePath, newPosition) {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
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
    const updated = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
    return {
        success: true,
        message: `Moved scene to position ${newPosition}: ${scenePath}`,
        scenes: updated.scenes,
    };
}
/**
 * Reorder all scenes by providing a new order
 */
function reorder_scenes(projectPath, scenePaths) {
    const buildSettingsPath = get_build_settings_path(projectPath);
    const current = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
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
        const s = sceneMap.get(p);
        return {
            enabled: s.enabled,
            path: s.path,
            guid: s.guid || '',
        };
    });
    // Write back
    write_scenes(projectPath, scenes);
    // Return updated scene list
    const updated = (0, build_settings_1.parse_editor_build_settings)(buildSettingsPath);
    return {
        success: true,
        message: `Reordered ${scenes.length} scenes`,
        scenes: updated.scenes,
    };
}
//# sourceMappingURL=editor.js.map