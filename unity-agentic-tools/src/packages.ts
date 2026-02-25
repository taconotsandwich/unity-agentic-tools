import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Structure of Unity's Packages/manifest.json
 */
interface PackageManifest {
    dependencies: Record<string, string>;
    [key: string]: unknown;
}

/**
 * Load and validate a Unity package manifest.
 * @returns The parsed manifest or an error string.
 */
export function load_manifest(project_path: string): { manifest: PackageManifest; path: string } | { error: string } {
    const manifest_path = join(project_path, 'Packages', 'manifest.json');
    if (!existsSync(manifest_path)) {
        return { error: `manifest.json not found at ${manifest_path}` };
    }
    try {
        const raw = readFileSync(manifest_path, 'utf-8');
        const parsed = JSON.parse(raw) as PackageManifest;
        if (!parsed.dependencies || typeof parsed.dependencies !== 'object') {
            return { error: `Invalid manifest.json: missing "dependencies" object` };
        }
        return { manifest: parsed, path: manifest_path };
    } catch (err: unknown) {
        return { error: `Failed to parse manifest.json: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/**
 * Save a manifest to disk with sorted dependency keys and 2-space indent.
 */
export function save_manifest(manifest_path: string, manifest: PackageManifest): void {
    // Sort dependencies alphabetically
    const sorted_deps: Record<string, string> = {};
    for (const key of Object.keys(manifest.dependencies).sort()) {
        sorted_deps[key] = manifest.dependencies[key];
    }
    const output = { ...manifest, dependencies: sorted_deps };
    writeFileSync(manifest_path, JSON.stringify(output, null, 2) + '\n', 'utf-8');
}

/**
 * List packages from the manifest, optionally filtering by search pattern.
 */
export function list_packages(
    project_path: string,
    search?: string
): { packages: { name: string; version: string }[]; count: number } | { error: string } {
    const result = load_manifest(project_path);
    if ('error' in result) return result;

    let entries = Object.entries(result.manifest.dependencies).map(([name, version]) => ({ name, version }));

    if (search) {
        const pattern = search.toLowerCase();
        entries = entries.filter(e => e.name.toLowerCase().includes(pattern));
    }

    return { packages: entries, count: entries.length };
}

/**
 * Validate a package version string.
 * Accepts semver (1.2.3, 1.2.3-preview.1), git URLs, file: paths, and Unity version aliases.
 */
function validate_version(version: string): boolean {
    // semver: 1.0.0, 1.2.3-preview.4, 0.1.0-exp.1
    if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) return true;
    // git URL
    if (version.startsWith('https://') || version.startsWith('git://') || version.startsWith('ssh://')) return true;
    // file: path
    if (version.startsWith('file:')) return true;
    return false;
}

/**
 * Add or update a package in the manifest.
 */
export function add_package(
    project_path: string,
    name: string,
    version: string
): { success: true; action: 'added' | 'updated'; name: string; version: string } | { error: string } {
    if (!name || name.trim() === '') {
        return { error: 'Package name must not be empty' };
    }
    if (/\s/.test(name)) {
        return { error: `Invalid package name "${name}". Package names must not contain spaces.` };
    }
    if (!validate_version(version)) {
        return { error: `Invalid version "${version}". Expected semver (e.g., 1.2.3), git URL, or file: path.` };
    }

    const result = load_manifest(project_path);
    if ('error' in result) return result;

    const action = result.manifest.dependencies[name] ? 'updated' : 'added';
    result.manifest.dependencies[name] = version;
    save_manifest(result.path, result.manifest);

    return { success: true, action, name, version };
}

/**
 * Remove a package from the manifest.
 */
export function remove_package(
    project_path: string,
    name: string
): { success: true; name: string } | { error: string } {
    const result = load_manifest(project_path);
    if ('error' in result) return result;

    if (!(name in result.manifest.dependencies)) {
        return { error: `Package "${name}" not found in manifest` };
    }

    delete result.manifest.dependencies[name];
    save_manifest(result.path, result.manifest);

    return { success: true, name };
}
