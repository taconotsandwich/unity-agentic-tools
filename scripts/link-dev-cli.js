#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { delimiter, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = resolve(REPO_ROOT, 'unity-agentic-tools', 'dist', 'cli.js');
const BIN_NAME = 'unity-agentic-tools';

function main() {
    const should_unlink = process.argv.includes('--unlink');
    const bin_dir = get_bun_global_bin();
    const bin_path = resolve(bin_dir, BIN_NAME);

    if (should_unlink) {
        unlink_cli(bin_path);
        return;
    }

    if (!existsSync(CLI_PATH)) {
        fail(`CLI build not found at ${CLI_PATH}. Run bun run build first.`);
    }

    mkdirSync(bin_dir, { recursive: true });
    const changed = replace_symlink(bin_path, CLI_PATH);
    console.log(changed ? `Linked ${BIN_NAME} -> ${CLI_PATH}` : `${BIN_NAME} is already linked to ${CLI_PATH}`);
    warn_if_not_on_path(bin_dir);
    warn_if_shadowed(bin_path);
}

function get_bun_global_bin() {
    const result = spawnSync('bun', ['pm', 'bin', '-g'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        fail(result.stderr.trim() || 'Failed to resolve Bun global bin directory.');
    }

    const bin_dir = result.stdout.trim();
    if (!bin_dir) {
        fail('Bun global bin directory was empty.');
    }

    return bin_dir;
}

function replace_symlink(bin_path, target_path) {
    const stat = try_lstat(bin_path);
    if (stat) {
        if (!stat.isSymbolicLink()) {
            fail(`${bin_path} already exists and is not a symlink.`);
        }

        const existing_target = resolve(dirname(bin_path), readlinkSync(bin_path));
        if (existing_target === target_path) {
            return false;
        }

        rmSync(bin_path);
    }

    symlinkSync(target_path, bin_path);
    return true;
}

function unlink_cli(bin_path) {
    const stat = try_lstat(bin_path);
    if (!stat) {
        console.log(`${BIN_NAME} is not linked in ${dirname(bin_path)}`);
        return;
    }

    if (!stat.isSymbolicLink()) {
        fail(`${bin_path} exists and is not a symlink.`);
    }

    rmSync(bin_path);
    console.log(`Unlinked ${bin_path}`);
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
