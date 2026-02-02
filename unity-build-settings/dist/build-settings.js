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
exports.parse_editor_build_settings = parse_editor_build_settings;
exports.parse_build_profile = parse_build_profile;
exports.list_build_profiles = list_build_profiles;
exports.get_build_settings = get_build_settings;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const version_1 = require("./version");
/**
 * Parse EditorBuildSettings.asset YAML file
 */
function parse_editor_build_settings(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const scenes = [];
    // Match scene entries in m_Scenes array
    // Format:
    // - enabled: 1
    //   path: Assets/Scenes/Main.unity
    //   guid: abc123...
    const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;
    let match;
    let buildIndex = 0;
    while ((match = scenePattern.exec(content)) !== null) {
        const enabled = match[1] === '1';
        const scenePath = match[2].trim();
        const guid = match[3].trim();
        if (scenePath) {
            scenes.push({
                enabled,
                path: scenePath,
                guid,
                buildIndex: enabled ? buildIndex++ : -1,
            });
        }
    }
    return { scenes };
}
/**
 * Parse a Build Profile .asset file (Unity 6+)
 */
function parse_build_profile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Build profile not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const name = path.basename(filePath, '.asset');
    const profile = {
        name,
        path: filePath,
    };
    // Extract platform if present
    const platformMatch = content.match(/m_BuildTarget:\s*(\d+)/);
    if (platformMatch) {
        profile.platform = get_platform_name(parseInt(platformMatch[1], 10));
    }
    // Extract scripting defines if present
    const definesMatch = content.match(/m_ScriptingDefines:\s*([^\n]+)/);
    if (definesMatch && definesMatch[1].trim()) {
        profile.scriptingDefines = definesMatch[1].trim().split(';').filter(d => d);
    }
    // Extract scene list if overridden
    const scenes = [];
    const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;
    let match;
    let buildIndex = 0;
    while ((match = scenePattern.exec(content)) !== null) {
        const enabled = match[1] === '1';
        const scenePath = match[2].trim();
        const guid = match[3].trim();
        if (scenePath) {
            scenes.push({
                enabled,
                path: scenePath,
                guid,
                buildIndex: enabled ? buildIndex++ : -1,
            });
        }
    }
    if (scenes.length > 0) {
        profile.scenes = scenes;
    }
    return profile;
}
/**
 * Convert Unity BuildTarget enum to platform name
 */
function get_platform_name(buildTarget) {
    const platforms = {
        1: 'StandaloneOSX',
        2: 'StandaloneWindows',
        5: 'iOS',
        9: 'Android',
        13: 'StandaloneWindows64',
        19: 'WebGL',
        21: 'StandaloneLinux64',
        24: 'PS4',
        25: 'XboxOne',
        27: 'tvOS',
        31: 'Switch',
        38: 'PS5',
    };
    return platforms[buildTarget] || `Unknown(${buildTarget})`;
}
/**
 * List all build profiles in a Unity 6+ project
 */
function list_build_profiles(projectPath) {
    const profilesPath = path.join(projectPath, 'Assets', 'Settings', 'Build Profiles');
    if (!fs.existsSync(profilesPath)) {
        return [];
    }
    const profiles = [];
    const files = fs.readdirSync(profilesPath);
    for (const file of files) {
        if (file.endsWith('.asset')) {
            const filePath = path.join(profilesPath, file);
            try {
                profiles.push(parse_build_profile(filePath));
            }
            catch (e) {
                // Skip invalid profiles
            }
        }
    }
    return profiles;
}
/**
 * Get complete build settings for a Unity project
 */
function get_build_settings(projectPath) {
    const projectInfo = (0, version_1.get_project_info)(projectPath);
    const editorBuildSettingsPath = path.join(projectPath, 'ProjectSettings', 'EditorBuildSettings.asset');
    const editorBuildSettings = parse_editor_build_settings(editorBuildSettingsPath);
    const buildProfiles = list_build_profiles(projectPath);
    return {
        projectInfo,
        editorBuildSettings,
        buildProfiles,
    };
}
//# sourceMappingURL=build-settings.js.map