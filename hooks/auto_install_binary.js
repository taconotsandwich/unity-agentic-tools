#!/usr/bin/env bun
/**
 * Hook: SessionStart
 * Checks if the native Rust binary exists on the host machine.
 * If present: exits immediately (fast path, no output).
 * If missing: runs the install script to download it from GitHub releases.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const BINARY_NAME = 'unity-agentic-core';

async function readStdin() {
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) {
        lines.push(line);
    }
    return lines.join('\n');
}

function getBinaryPath() {
    const SUFFIXES = {
        'darwin-arm64': 'darwin-arm64',
        'darwin-x64': 'darwin-x64',
        'linux-x64': 'linux-x64-gnu',
        'win32-x64': 'win32-x64-msvc'
    };
    const key = `${process.platform}-${process.arch}`;
    const suffix = SUFFIXES[key];
    if (!suffix) return null;
    return path.join(
        os.homedir(), '.claude', 'unity-agentic-tools', 'bin',
        `${BINARY_NAME}.${suffix}.node`
    );
}

async function main() {
    try {
        const input = await readStdin();
        const data = JSON.parse(input);

        const binaryPath = getBinaryPath();

        // Fast path: binary exists (or unsupported platform) — exit immediately
        if (!binaryPath || fs.existsSync(binaryPath)) {
            console.log(JSON.stringify(data));
            process.exit(0);
        }

        // Binary missing — run the installer
        const hooksDir = path.resolve(__dirname);
        const pluginRoot = path.join(hooksDir, '..');
        const installScript = path.join(pluginRoot, 'scripts', 'install-binary.ts');

        if (!fs.existsSync(installScript)) {
            // Plugin structure incomplete — skip silently
            console.log(JSON.stringify(data));
            process.exit(0);
        }

        try {
            execSync(`bun "${installScript}"`, {
                cwd: pluginRoot,
                stdio: 'inherit',
                timeout: 120000
            });
            data.context = (data.context || '') +
                '# Unity Agentic Tools: native binary auto-installed successfully.\n';
        } catch (installErr) {
            process.stderr.write(
                `Auto-install failed: ${installErr.message}. Run /initial-install manually.\n`
            );
        }

        console.log(JSON.stringify(data));
    } catch (err) {
        process.stderr.write(`Hook error: ${err.message}\n`);
        process.exit(1);
    }
}

main();
