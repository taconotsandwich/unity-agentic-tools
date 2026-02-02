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
exports.parse_version = parse_version;
exports.is_unity6_or_later = is_unity6_or_later;
exports.read_project_version = read_project_version;
exports.has_build_profiles = has_build_profiles;
exports.get_project_info = get_project_info;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parse Unity version string into components
 */
function parse_version(versionString) {
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
function is_unity6_or_later(version) {
    return version.major >= 6000;
}
/**
 * Read Unity project version from ProjectVersion.txt
 */
function read_project_version(projectPath) {
    const versionFile = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
    if (!fs.existsSync(versionFile)) {
        throw new Error(`ProjectVersion.txt not found at: ${versionFile}`);
    }
    const content = fs.readFileSync(versionFile, 'utf-8');
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
function has_build_profiles(projectPath) {
    const profilesPath = path.join(projectPath, 'Assets', 'Settings', 'Build Profiles');
    return {
        exists: fs.existsSync(profilesPath),
        path: profilesPath,
    };
}
/**
 * Get complete Unity project info
 */
function get_project_info(projectPath) {
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
//# sourceMappingURL=version.js.map