#!/usr/bin/env bun
// Fails when the bridge package compiles against a namespace that a UPM package
// provides but package.json does not declare. Installing into a project that
// does not already pull that package in fails the whole assembly, so the server
// never starts and the bridge is unreachable with no hint why. This has shipped
// twice: com.unity.ugui (2c2577e) and com.unity.test-framework (71bddaa).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(root, 'unity-package');
const manifestPath = join(packageRoot, 'package.json');

// Namespaces that live in a UPM package rather than a built-in engine module.
// Only compile-time references count: this package reaches UnityEngine.InputSystem
// and UnityEngine.UIElements through reflection on string type names, which needs
// no dependency, so string literals are stripped before matching.
const NAMESPACE_OWNERS = [
    ['UnityEngine.UI', 'com.unity.ugui'],
    ['UnityEngine.EventSystems', 'com.unity.ugui'],
    ['UnityEditor.UI', 'com.unity.ugui'],
    ['UnityEditor.TestTools', 'com.unity.test-framework'],
    ['UnityEngine.TestTools', 'com.unity.test-framework'],
    ['NUnit.Framework', 'com.unity.test-framework'],
    ['UnityEngine.InputSystem', 'com.unity.inputsystem'],
    ['TMPro', 'com.unity.textmeshpro'],
    ['Unity.Collections', 'com.unity.collections'],
    ['Unity.Mathematics', 'com.unity.mathematics'],
    ['Unity.Burst', 'com.unity.burst'],
    ['UnityEngine.Timeline', 'com.unity.timeline'],
    ['UnityEditor.Timeline', 'com.unity.timeline'],
    ['UnityEngine.AddressableAssets', 'com.unity.addressables'],
    ['Unity.Netcode', 'com.unity.netcode.gameobjects'],
    ['UnityEngine.Rendering.Universal', 'com.unity.render-pipelines.universal'],
    ['UnityEngine.Rendering.HighDefinition', 'com.unity.render-pipelines.high-definition'],
];

function collect_files(dir, extension) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collect_files(fullPath, extension));
        } else if (entry.name.endsWith(extension)) {
            files.push(fullPath);
        }
    }
    return files;
}

// Reflection lookups such as FindType("UnityEngine.InputSystem.Mouse") are not
// compile-time references. Neither is a namespace named in a comment.
function strip_literals_and_comments(source) {
    return source
        .replace(/@"(?:[^"]|"")*"/g, '""')
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
}

function escape_regex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const declared = new Set(Object.keys(manifest.dependencies ?? {}));

// A versionDefines entry means the package is optional: the code behind it is
// compiled out when the package is absent, so it must not be a hard dependency.
const optional = new Set();
for (const asmdefPath of collect_files(packageRoot, '.asmdef')) {
    const asmdef = JSON.parse(readFileSync(asmdefPath, 'utf8'));
    for (const versionDefine of asmdef.versionDefines ?? []) {
        optional.add(versionDefine.name);
    }
}

const missing = new Map();
for (const filePath of collect_files(packageRoot, '.cs')) {
    const source = strip_literals_and_comments(readFileSync(filePath, 'utf8'));
    for (const [namespace, packageId] of NAMESPACE_OWNERS) {
        if (declared.has(packageId) || optional.has(packageId)) {
            continue;
        }
        const usage = new RegExp(`(?:using\\s+(?:\\w+\\s*=\\s*)?|\\b)${escape_regex(namespace)}\\s*[.;]`);
        if (usage.test(source)) {
            const existing = missing.get(packageId) ?? [];
            existing.push(`${relative(root, filePath)} uses ${namespace}`);
            missing.set(packageId, existing);
        }
    }
}

if (missing.size > 0) {
    console.error('Bridge package compiles against undeclared UPM packages.');
    for (const [packageId, usages] of missing) {
        console.error(`\n  ${packageId} is not in unity-package/package.json dependencies:`);
        for (const usage of usages.slice(0, 5)) {
            console.error(`    ${usage}`);
        }
        if (usages.length > 5) {
            console.error(`    ... and ${usages.length - 5} more`);
        }
    }
    console.error('\nAdd the package to unity-package/package.json dependencies, or gate the');
    console.error('code behind an asmdef versionDefine if the dependency is optional.');
    process.exit(1);
}

console.log(`Bridge package dependencies cover every compile-time namespace (${declared.size} declared).`);
