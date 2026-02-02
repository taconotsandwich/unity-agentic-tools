import * as fs from 'fs';
import * as path from 'path';
import { get_project_info, UnityProjectInfo } from './version';

export interface SceneEntry {
    enabled: boolean;
    path: string;
    guid?: string;
    buildIndex: number;
}

export interface EditorBuildSettings {
    scenes: SceneEntry[];
    configObjects?: Record<string, string>;
}

export interface BuildProfile {
    name: string;
    path: string;
    platform?: string;
    scenes?: SceneEntry[];
    scriptingDefines?: string[];
}

export interface BuildSettingsResult {
    projectInfo: UnityProjectInfo;
    editorBuildSettings: EditorBuildSettings;
    buildProfiles: BuildProfile[];
    activeBuildProfile?: string;
}

/**
 * Parse EditorBuildSettings.asset YAML file
 */
export function parse_editor_build_settings(filePath: string): EditorBuildSettings {
    if (!fs.existsSync(filePath)) {
        throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
    }

    // Normalize line endings (Windows CRLF -> LF)
    const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
    const scenes: SceneEntry[] = [];

    // Match scene entries in m_Scenes array
    // Format:
    // - enabled: 1
    //   path: Assets/Scenes/Main.unity
    //   guid: abc123...
    const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;

    let match: RegExpExecArray | null;
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
export function parse_build_profile(filePath: string): BuildProfile {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Build profile not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const name = path.basename(filePath, '.asset');

    const profile: BuildProfile = {
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
    const scenes: SceneEntry[] = [];
    const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;

    let match: RegExpExecArray | null;
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
function get_platform_name(buildTarget: number): string {
    const platforms: Record<number, string> = {
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
export function list_build_profiles(projectPath: string): BuildProfile[] {
    const profilesPath = path.join(projectPath, 'Assets', 'Settings', 'Build Profiles');

    if (!fs.existsSync(profilesPath)) {
        return [];
    }

    const profiles: BuildProfile[] = [];
    const files = fs.readdirSync(profilesPath);

    for (const file of files) {
        if (file.endsWith('.asset')) {
            const filePath = path.join(profilesPath, file);
            try {
                profiles.push(parse_build_profile(filePath));
            } catch (e) {
                // Skip invalid profiles
            }
        }
    }

    return profiles;
}

/**
 * Get complete build settings for a Unity project
 */
export function get_build_settings(projectPath: string): BuildSettingsResult {
    const projectInfo = get_project_info(projectPath);

    const editorBuildSettingsPath = path.join(
        projectPath,
        'ProjectSettings',
        'EditorBuildSettings.asset'
    );

    const editorBuildSettings = parse_editor_build_settings(editorBuildSettingsPath);
    const buildProfiles = list_build_profiles(projectPath);

    return {
        projectInfo,
        editorBuildSettings,
        buildProfiles,
    };
}
