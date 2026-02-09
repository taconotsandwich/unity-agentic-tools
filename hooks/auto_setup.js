#!/usr/bin/env bun
/**
 * Hook: SessionStart
 * Ensures the plugin is ready: workspace deps installed and TypeScript built.
 * Creates an executable wrapper at bin/unity-yaml so Claude can invoke the CLI
 * by full path without needing bun prefix or PATH changes.
 * If deps/build missing: runs bun install + bun run build first.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function readStdin() {
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) {
        lines.push(line);
    }
    return lines.join('\n');
}

function ensureSetup() {
    const pluginRoot = path.resolve(__dirname, '..');
    const needsInstall = !fs.existsSync(path.join(pluginRoot, 'node_modules'));
    const needsBuild = !fs.existsSync(path.join(pluginRoot, 'unity-yaml', 'dist', 'cli.js'));

    if (!needsInstall && !needsBuild) return { didSetup: false, pluginRoot };

    try {
        if (needsInstall) {
            execSync('bun install', { cwd: pluginRoot, stdio: 'inherit', timeout: 120000 });
        }
        if (needsBuild) {
            execSync('bun run build', { cwd: pluginRoot, stdio: 'inherit', timeout: 60000 });
        }
        return { didSetup: true, pluginRoot };
    } catch (err) {
        process.stderr.write(`Auto-setup failed: ${err.message}. Run bun install && bun run build manually.\n`);
        return { didSetup: false, pluginRoot };
    }
}

function ensureWrapper(pluginRoot) {
    const binDir = path.join(pluginRoot, 'bin');
    const wrapperPath = path.join(binDir, 'unity-yaml');
    const cliPath = path.join(pluginRoot, 'unity-yaml', 'dist', 'cli.js');

    if (!fs.existsSync(wrapperPath)) {
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir);
        fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec bun "${cliPath}" "$@"\n`);
        fs.chmodSync(wrapperPath, 0o755);
    }

    return wrapperPath;
}

async function main() {
    try {
        const input = await readStdin();
        const data = JSON.parse(input);

        const { didSetup, pluginRoot } = ensureSetup();
        const wrapperPath = ensureWrapper(pluginRoot);

        // Always inject the resolved wrapper path so Claude can invoke directly
        data.context = (data.context || '') +
            `# unity-yaml CLI: ${wrapperPath}\n`;

        if (didSetup) {
            data.context += '# Unity Agentic Tools: plugin dependencies installed and built.\n';
        }

        console.log(JSON.stringify(data));
    } catch (err) {
        process.stderr.write(`Hook error: ${err.message}\n`);
        process.exit(1);
    }
}

main();
