import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface DocSource {
    id: string;
    type: 'package' | 'editor';
    path: string;
    name: string;
}

// Discover all documentation sources from a Unity project root.
// Scans for package Documentation~ folders and Unity Editor docs.
export function discover_sources(projectRoot: string): DocSource[] {
    const sources: DocSource[] = [];

    sources.push(...discover_package_sources(projectRoot));

    const editorSource = discover_editor_source(projectRoot);
    if (editorSource) sources.push(editorSource);

    return sources;
}

// Scan Packages/ for directories containing Documentation~/ (Unity convention).
function discover_package_sources(projectRoot: string): DocSource[] {
    const sources: DocSource[] = [];
    const packagesDir = join(projectRoot, 'Packages');

    if (!existsSync(packagesDir)) return sources;

    let entries: string[];
    try {
        entries = readdirSync(packagesDir);
    } catch {
        return sources;
    }

    for (const entry of entries) {
        const packageDir = join(packagesDir, entry);
        try {
            if (!statSync(packageDir).isDirectory()) continue;
        } catch {
            continue;
        }

        const docsDir = join(packageDir, 'Documentation~');
        if (existsSync(docsDir)) {
            sources.push({
                id: `pkg:${entry}`,
                type: 'package',
                path: docsDir,
                name: entry,
            });
        }
    }

    return sources;
}

// Read the Unity version and check for local Editor documentation at the Hub path.
// Falls back to scanning Hub directory for any installed version if exact match not found.
function discover_editor_source(projectRoot: string): DocSource | null {
    const version = read_unity_version(projectRoot);

    if (version) {
        const docsPath = resolve_editor_docs_path(version);
        if (docsPath) {
            return {
                id: `editor:${version}`,
                type: 'editor',
                path: docsPath,
                name: `Unity ${version} Editor Docs`,
            };
        }
    }

    // Fallback: scan Hub directory for any installed version
    return find_any_editor_docs();
}

/** Scan Unity Hub Editor directory for any installed version with docs. */
function find_any_editor_docs(): DocSource | null {
    const hubDirs: string[] = [];
    const platform = process.platform;

    if (platform === 'darwin') {
        hubDirs.push('/Applications/Unity/Hub/Editor');
    } else if (platform === 'win32') {
        hubDirs.push('C:\\Program Files\\Unity\\Hub\\Editor');
    } else {
        hubDirs.push(join(homedir(), 'Unity/Hub/Editor'));
    }

    for (const hubDir of hubDirs) {
        if (!existsSync(hubDir)) continue;
        let entries: string[];
        try { entries = readdirSync(hubDir); } catch { continue; }
        // Sort descending — prefer newest version
        entries.sort().reverse();
        for (const entry of entries) {
            const docsPath = join(hubDir, entry, 'Documentation', 'en');
            if (existsSync(docsPath)) {
                return { id: `editor:${entry}`, type: 'editor', path: docsPath, name: `Unity ${entry} Editor Docs` };
            }
        }
    }
    return null;
}

/** Check platform-specific Unity Hub Editor documentation paths. */
export function resolve_editor_docs_path(version: string): string | null {
    const candidates: string[] = [];
    const platform = process.platform;

    if (platform === 'darwin') {
        candidates.push(join('/Applications/Unity/Hub/Editor', version, 'Documentation/en'));
    } else if (platform === 'win32') {
        candidates.push(join('C:\\Program Files\\Unity\\Hub\\Editor', version, 'Documentation\\en'));
    } else {
        // Linux
        candidates.push(join(homedir(), 'Unity/Hub/Editor', version, 'Documentation/en'));
    }

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return null;
}

/**
 * Parse the Unity version from ProjectSettings/ProjectVersion.txt.
 * Format: `m_EditorVersion: 2022.3.10f1`
 */
export function read_unity_version(projectRoot: string): string | null {
    const versionFile = join(projectRoot, 'ProjectSettings', 'ProjectVersion.txt');
    if (!existsSync(versionFile)) return null;

    try {
        const content = readFileSync(versionFile, 'utf-8');
        const match = content.match(/m_EditorVersion:\s*(.+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}
