#!/usr/bin/env bun
import { existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_PATH = resolve(REPO_ROOT, 'tools', 'dotnet-unity-compile', 'UnityAgenticTools.UnityPackage.csproj');

function main() {
    const unity_app = resolve_unity_app();
    if (!unity_app) {
        fail('Unity app not found. Set UNITY_APP=/path/to/Unity.app or install Unity through Unity Hub.');
    }

    validate_unity_app(unity_app);
    console.log(`Using Unity app: ${unity_app}`);

    const result = spawnSync('dotnet', [
        'build',
        PROJECT_PATH,
        '--nologo',
        `-p:UnityApp=${unity_app}`,
        ...process.argv.slice(2),
    ], {
        stdio: 'inherit',
    });

    process.exit(result.status ?? 1);
}

function resolve_unity_app() {
    const explicit_app = process.env.UNITY_APP || process.env.UnityApp;
    if (explicit_app) {
        return resolve(explicit_app);
    }

    const requested_version = process.env.UNITY_EDITOR_VERSION || process.env.UnityEditorVersion;
    if (requested_version) {
        const requested_app = join('/Applications/Unity/Hub/Editor', requested_version, 'Unity.app');
        return existsSync(requested_app) ? requested_app : undefined;
    }

    const detected_apps = detect_unity_hub_apps();
    return detected_apps[0];
}

function detect_unity_hub_apps() {
    const editor_root = '/Applications/Unity/Hub/Editor';
    if (!existsSync(editor_root)) {
        return [];
    }

    return readdirSync(editor_root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => ({
            version: entry.name,
            app: join(editor_root, entry.name, 'Unity.app'),
        }))
        .filter(candidate => existsSync(candidate.app))
        .sort((left, right) => compare_unity_versions(right.version, left.version))
        .map(candidate => candidate.app);
}

function compare_unity_versions(left, right) {
    const left_parts = parse_version_parts(left);
    const right_parts = parse_version_parts(right);
    const count = Math.max(left_parts.length, right_parts.length);
    for (let index = 0; index < count; index += 1) {
        const diff = (left_parts[index] ?? 0) - (right_parts[index] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }

    return left.localeCompare(right);
}

function parse_version_parts(version) {
    const matches = version.match(/\d+/g);
    return matches ? matches.map(value => Number(value)) : [];
}

function validate_unity_app(unity_app) {
    if (!existsSync(unity_app)) {
        fail(`Unity app not found: ${unity_app}`);
    }

    const managed_dir = join(unity_app, 'Contents', 'Resources', 'Scripting', 'Managed');
    if (!existsSync(managed_dir)) {
        fail(`Unity app is missing managed assemblies: ${managed_dir}`);
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main();
