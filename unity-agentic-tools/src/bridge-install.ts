import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { add_package, load_manifest } from './packages';

const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const REMOTE_BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

export interface BridgeInstallOptions {
    remote?: boolean;
    local_package_path?: string;
    require_local?: boolean;
}

interface BridgeInstallResult {
    success: true;
    action: 'added' | 'updated' | 'preserved';
    name: string;
    version: string;
}

interface BridgePackageTarget {
    version: string;
}

export function install_bridge_package(
    project_path: string,
    options: BridgeInstallOptions = {}
): BridgeInstallResult | { error: string } {
    const target = resolve_bridge_package_target(options);
    if ('error' in target) {
        return target;
    }

    const manifest_result = load_manifest(project_path);
    if ('error' in manifest_result) {
        return manifest_result;
    }

    const existing_version = manifest_result.manifest.dependencies[BRIDGE_PACKAGE_NAME];
    const should_preserve_existing_file = !options.remote && !options.local_package_path && !options.require_local;
    if (should_preserve_existing_file && typeof existing_version === 'string' && existing_version.startsWith('file:')) {
        return {
            success: true,
            action: 'preserved',
            name: BRIDGE_PACKAGE_NAME,
            version: existing_version,
        };
    }

    return add_package(project_path, BRIDGE_PACKAGE_NAME, target.version);
}

function resolve_bridge_package_target(options: BridgeInstallOptions): BridgePackageTarget | { error: string } {
    if (options.remote && (options.local_package_path || options.require_local)) {
        return { error: 'Use either --local or --remote, not both.' };
    }

    if (options.remote) {
        return { version: REMOTE_BRIDGE_PACKAGE_VERSION };
    }

    if (options.local_package_path) {
        const local_path = resolve(options.local_package_path);
        return local_package_target(local_path);
    }

    if (options.require_local) {
        const detected_path = detect_local_bridge_package_path();
        if (detected_path) {
            return local_package_target(detected_path);
        }

        return {
            error: 'Local bridge package could not be auto-detected. Pass --local <path-to-unity-package> or run from a source checkout.',
        };
    }

    return { version: REMOTE_BRIDGE_PACKAGE_VERSION };
}

function detect_local_bridge_package_path(): string | undefined {
    const candidate = resolve(__dirname, '..', '..', 'unity-package');
    return is_bridge_package(candidate) ? candidate : undefined;
}

function local_package_target(package_path: string): BridgePackageTarget | { error: string } {
    const normalized_path = normalize_local_bridge_package_path(package_path);
    if (!normalized_path) {
        return {
            error: `Local bridge package not found at ${package_path}. Expected package.json with name "${BRIDGE_PACKAGE_NAME}".`,
        };
    }

    return { version: to_file_dependency(normalized_path) };
}

function normalize_local_bridge_package_path(package_path: string): string | undefined {
    if (is_bridge_package(package_path)) {
        return package_path;
    }

    const nested_package_path = join(package_path, 'unity-package');
    if (is_bridge_package(nested_package_path)) {
        return nested_package_path;
    }

    return undefined;
}

function is_bridge_package(package_path: string): boolean {
    const package_json_path = join(package_path, 'package.json');
    if (!existsSync(package_json_path)) {
        return false;
    }

    try {
        const parsed = JSON.parse(readFileSync(package_json_path, 'utf-8')) as unknown;
        return is_record(parsed) && parsed.name === BRIDGE_PACKAGE_NAME;
    } catch {
        return false;
    }
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function to_file_dependency(package_path: string): string {
    return `file:${package_path.replace(/\\/g, '/')}`;
}
