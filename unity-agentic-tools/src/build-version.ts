import * as fs from 'fs';
import * as path from 'path';

export interface UnityVersion {
    raw: string;              // "6000.0.23f1"
    major: number;            // 6000
    minor: number;            // 0
    patch: number;            // 23
    releaseType: string;      // "f" (final), "b" (beta), "a" (alpha)
    revision: number;         // 1
    fullRevision?: string;    // "6000.0.23f1 (abc123...)"
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
export function parse_version(versionString: string): UnityVersion {
    // Match patterns like "2022.3.15f1" or "6000.0.23f1"
    const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)([abfp])(\d+)$/);

    if (!match) {
        throw new Error(`Invalid Unity version format: ${versionString}`);
    }

    return {
        raw: versionString,
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        releaseType: match[4],
        revision: parseInt(match[5], 10),
    };
}

/**
 * Check if version is Unity 6 or later (major >= 6000)
 */
export function is_unity6_or_later(version: UnityVersion): boolean {
    return version.major >= 6000;
}

/**
 * Read Unity project version from ProjectVersion.txt
 */
export function read_project_version(projectPath: string): UnityVersion {
    const versionFile = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');

    if (!fs.existsSync(versionFile)) {
        throw new Error(`ProjectVersion.txt not found at: ${versionFile}`);
    }

    // Normalize line endings (Windows CRLF -> LF)
    const content = fs.readFileSync(versionFile, 'utf-8').replace(/\r\n/g, '\n');

    // Parse m_EditorVersion: 6000.0.23f1
    const versionMatch = content.match(/m_EditorVersion:\s*(.+)/);
    if (!versionMatch) {
        throw new Error('Could not parse m_EditorVersion from ProjectVersion.txt');
    }

    const version = parse_version(versionMatch[1].trim());

    // Try to get full revision if available
    const revisionMatch = content.match(/m_EditorVersionWithRevision:\s*(.+)/);
    if (revisionMatch) {
        version.fullRevision = revisionMatch[1].trim();
    }

    return version;
}

/**
 * Check if Unity project has Build Profiles (Unity 6+)
 */
export function has_build_profiles(projectPath: string): { exists: boolean; path: string } {
    const profilesPath = path.join(projectPath, 'Assets', 'Settings', 'Build Profiles');
    return {
        exists: fs.existsSync(profilesPath),
        path: profilesPath,
    };
}

/**
 * Get complete Unity project info
 */
export function get_project_info(projectPath: string): UnityProjectInfo {
    const version = read_project_version(projectPath);
    const buildProfiles = has_build_profiles(projectPath);

    return {
        projectPath,
        version,
        isUnity6OrLater: is_unity6_or_later(version),
        hasBuildProfiles: buildProfiles.exists,
        buildProfilesPath: buildProfiles.exists ? buildProfiles.path : undefined,
    };
}
