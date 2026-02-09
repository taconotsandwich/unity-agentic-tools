#!/usr/bin/env bun
/**
 * Hook: SessionStart
 * Ensures the plugin is ready: workspace deps installed and TypeScript built.
 * Always injects the resolved CLI path into session context so Claude knows
 * the exact `bun <path>/cli.js` command to use.
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

async function main() {
    try {
        const input = await readStdin();
        const data = JSON.parse(input);

        const { didSetup, pluginRoot } = ensureSetup();
        const cliPath = path.join(pluginRoot, 'unity-yaml', 'dist', 'cli.js');

        // Always inject the resolved CLI path so Claude knows the exact command
        data.context = (data.context || '') +
            `# unity-yaml CLI: bun ${cliPath}\n`;

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
