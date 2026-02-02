import { UnityProjectInfo } from './version';
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
export declare function parse_editor_build_settings(filePath: string): EditorBuildSettings;
/**
 * Parse a Build Profile .asset file (Unity 6+)
 */
export declare function parse_build_profile(filePath: string): BuildProfile;
/**
 * List all build profiles in a Unity 6+ project
 */
export declare function list_build_profiles(projectPath: string): BuildProfile[];
/**
 * Get complete build settings for a Unity project
 */
export declare function get_build_settings(projectPath: string): BuildSettingsResult;
//# sourceMappingURL=build-settings.d.ts.map