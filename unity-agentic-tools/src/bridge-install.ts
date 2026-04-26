import { add_package, load_manifest } from './packages';

const BRIDGE_PACKAGE_NAME = 'com.unity-agentic-tools.editor-bridge';
const BRIDGE_PACKAGE_VERSION = 'https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package';

interface BridgeInstallResult {
    success: true;
    action: 'added' | 'updated' | 'preserved';
    name: string;
    version: string;
}

export function install_bridge_package(project_path: string): BridgeInstallResult | { error: string } {
    const manifest_result = load_manifest(project_path);
    if ('error' in manifest_result) {
        return manifest_result;
    }

    const existing_version = manifest_result.manifest.dependencies[BRIDGE_PACKAGE_NAME];
    if (typeof existing_version === 'string' && existing_version.startsWith('file:')) {
        return {
            success: true,
            action: 'preserved',
            name: BRIDGE_PACKAGE_NAME,
            version: existing_version,
        };
    }

    return add_package(project_path, BRIDGE_PACKAGE_NAME, BRIDGE_PACKAGE_VERSION);
}
