#!/usr/bin/env bun
import { existsSync, lstatSync, readlinkSync, realpathSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { delimiter, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = resolve(REPO_ROOT, 'unity-agentic-tools');
const CLI_PATH = resolve(PACKAGE_DIR, 'dist', 'cli.js');
const BIN_NAME = 'unity-agentic-tools';

function main() {
    const should_unlink = process.argv.includes('--unlink');
    const npm_prefix = get_npm_prefix();
    const bin_dir = join(npm_prefix, 'bin');
    const bin_path = join(bin_dir, BIN_NAME);
    const global_package_dir = join(npm_prefix, 'lib', 'node_modules', BIN_NAME);

    if (should_unlink) {
        unlink_cli(global_package_dir);
        remove_stale_bun_link();
        return;
    }

    if (!existsSync(CLI_PATH)) {
        fail(`CLI build not found at ${CLI_PATH}. Run bun run build first.`);
    }

    if (existsSync(global_package_dir) && !is_dev_link(global_package_dir)) {
        console.log(`[info] replacing the released npm install at ${global_package_dir} with a dev link`);
    }

    const result = spawnSync('npm', ['link'], {
        cwd: PACKAGE_DIR,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        fail(result.stderr.trim() || 'npm link failed.');
    }

    verify_link(bin_path);
    console.log(`Linked ${BIN_NAME} -> ${CLI_PATH} via npm link (${bin_dir})`);
    remove_stale_bun_link();
    warn_if_not_on_path(bin_dir);
    warn_if_shadowed(bin_path);
}

// The dev link goes through npm, not bun, on purpose: releases are
// distributed with npm install -g, so npm's global bin is the directory
// end-user PATHs already contain, and npm owning the entry lets a later
// released install replace the link cleanly. Bun stays the runtime.
function get_npm_prefix() {
    const result = spawnSync('npm', ['prefix', '-g'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        fail(result.stderr.trim() || 'Failed to resolve the npm global prefix. npm is required to link the dev CLI where released installs land.');
    }

    const npm_prefix = result.stdout.trim();
    if (!npm_prefix) {
        fail('npm global prefix was empty.');
    }

    return npm_prefix;
}

function is_dev_link(global_package_dir) {
    const stat = try_lstat(global_package_dir);
    if (!stat || !stat.isSymbolicLink()) {
        return false;
    }

    try {
        return realpathSync(global_package_dir) === realpathSync(PACKAGE_DIR);
    } catch {
        return false;
    }
}

function verify_link(bin_path) {
    if (!existsSync(bin_path)) {
        fail(`npm link completed but ${bin_path} was not created.`);
    }

    const resolved = realpathSync(bin_path);
    if (resolved !== realpathSync(CLI_PATH)) {
        fail(`npm link completed but ${bin_path} runs ${resolved}, expected ${CLI_PATH}.`);
    }
}

function unlink_cli(global_package_dir) {
    const stat = try_lstat(global_package_dir);
    if (!stat) {
        console.log(`${BIN_NAME} is not linked in npm's global packages`);
        return;
    }

    if (!is_dev_link(global_package_dir)) {
        console.log(`[info] ${global_package_dir} is a released npm install, not a dev link; leaving it. Remove with npm rm -g ${BIN_NAME}.`);
        return;
    }

    const result = spawnSync('npm', ['rm', '-g', BIN_NAME], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        fail(result.stderr.trim() || `npm rm -g ${BIN_NAME} failed.`);
    }

    console.log(`Unlinked ${BIN_NAME} from npm's global packages`);
}

// Earlier versions of this script symlinked the CLI into bun's global bin,
// a directory Homebrew-installed bun never puts on PATH. Clean that link up
// so it cannot shadow or confuse the npm one.
function remove_stale_bun_link() {
    const result = spawnSync('bun', ['pm', 'bin', '-g'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        return;
    }

    const bun_bin_dir = result.stdout.trim();
    if (!bun_bin_dir) {
        return;
    }

    const stale_path = join(bun_bin_dir, BIN_NAME);
    const stat = try_lstat(stale_path);
    if (!stat || !stat.isSymbolicLink()) {
        return;
    }

    const target = resolve(dirname(stale_path), readlinkSync(stale_path));
    if (target !== CLI_PATH) {
        return;
    }

    rmSync(stale_path);
    console.log(`[info] removed the old Bun-global link at ${stale_path}`);
}

function try_lstat(file_path) {
    try {
        return lstatSync(file_path);
    } catch (err) {
        if (is_node_error(err) && err.code === 'ENOENT') {
            return undefined;
        }

        throw err;
    }
}

function is_node_error(value) {
    return typeof value === 'object' && value !== null && 'code' in value;
}

function warn_if_not_on_path(bin_dir) {
    const path_entries = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(entry => resolve(entry));
    if (!path_entries.includes(resolve(bin_dir))) {
        console.warn(`[warn] ${bin_dir} is not on PATH; call the CLI as ${resolve(bin_dir, BIN_NAME)} or update PATH.`);
    }
}

function warn_if_shadowed(bin_path) {
    const result = spawnSync('which', [BIN_NAME], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (result.status !== 0) {
        return;
    }

    const resolved = result.stdout.trim();
    if (!resolved || resolve(resolved) === bin_path) {
        return;
    }

    try {
        if (realpathSync(resolved) === realpathSync(bin_path)) {
            return;
        }
    } catch {
        // Fall through and report the shadowing path.
    }

    if (resolved) {
        console.warn(`[warn] ${BIN_NAME} resolves to ${resolved} before ${bin_path} on PATH.`);
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main();
