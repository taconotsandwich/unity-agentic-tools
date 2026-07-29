#!/usr/bin/env bun
import { chmodSync, existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = resolve(REPO_ROOT, '.githooks');
const HOOKS_PATH_VALUE = '.githooks';

function main() {
    const should_uninstall = process.argv.includes('--uninstall');

    if (should_uninstall) {
        run_git(['config', '--unset', 'core.hooksPath'], { allow_failure: true });
        console.log('Git hooks disabled (core.hooksPath unset).');
        return;
    }

    if (!existsSync(HOOKS_DIR)) {
        fail(`Hooks directory not found at ${HOOKS_DIR}.`);
    }

    for (const entry of readdirSync(HOOKS_DIR)) {
        chmodSync(join(HOOKS_DIR, entry), 0o755);
    }

    run_git(['config', 'core.hooksPath', HOOKS_PATH_VALUE]);
    console.log(`Git hooks enabled (core.hooksPath=${HOOKS_PATH_VALUE}).`);
    console.log('Bypass a hook for one command with --no-verify.');
}

function run_git(args, options = {}) {
    const result = spawnSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
        fail(`Failed to run git: ${result.error.message}`);
    }

    if (result.status !== 0 && !options.allow_failure) {
        fail(result.stderr.trim() || `git ${args.join(' ')} failed.`);
    }

    return result;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main();
