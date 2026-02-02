export interface UnityVersion {
    raw: string;
    major: number;
    minor: number;
    patch: number;
    releaseType: string;
    revision: number;
    fullRevision?: string;
}
export interface UnityProjectInfo {
    projectPath: string;
    version: UnityVersion;
    isUnity6OrLater: boolean;
    hasBuildProfiles: boolean;
    buildProfilesPath?: string;
}
/**
 * Parse Unity version string into components
 */
export declare function parse_version(versionString: string): UnityVersion;
/**
 * Check if version is Unity 6 or later (major >= 6000)
 */
export declare function is_unity6_or_later(version: UnityVersion): boolean;
/**
 * Read Unity project version from ProjectVersion.txt
 */
export declare function read_project_version(projectPath: string): UnityVersion;
/**
 * Check if Unity project has Build Profiles (Unity 6+)
 */
export declare function has_build_profiles(projectPath: string): {
    exists: boolean;
    path: string;
};
/**
 * Get complete Unity project info
 */
export declare function get_project_info(projectPath: string): UnityProjectInfo;
//# sourceMappingURL=version.d.ts.map