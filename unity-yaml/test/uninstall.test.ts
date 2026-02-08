import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('uninstall', () => {
    let tempHome: string;
    let binDir: string;
    let pluginDir: string;
    let manifestPath: string;
    const scriptPath = join(__dirname, '..', '..', 'scripts', 'install-binary.ts');

    beforeEach(() => {
        tempHome = join(tmpdir(), `unity-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        pluginDir = join(tempHome, '.claude', 'unity-agentic-tools');
        binDir = join(pluginDir, 'bin');
        manifestPath = join(pluginDir, 'manifest.json');
        mkdirSync(binDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempHome)) {
            rmSync(tempHome, { recursive: true, force: true });
        }
    });

    function runUninstall(): string {
        return execSync(`bun "${scriptPath}" uninstall`, {
            env: {
                ...process.env,
                HOME: tempHome,
                USERPROFILE: tempHome,
            },
            encoding: 'utf-8',
        });
    }

    function seedManifest(paths: string[]): void {
        writeFileSync(manifestPath, JSON.stringify(paths, null, 2) + '\n');
    }

    it('should remove files listed in manifest and clean up directories', () => {
        const binaryPath = join(binDir, 'unity-agentic-core.darwin-arm64.node');
        writeFileSync(binaryPath, 'fake-binary');
        seedManifest([binaryPath]);

        const output = runUninstall();

        expect(output).toContain('Removed:');
        expect(output).toContain('Uninstall complete');
        expect(existsSync(binaryPath)).toBe(false);
        expect(existsSync(manifestPath)).toBe(false);
        expect(existsSync(binDir)).toBe(false);
        expect(existsSync(pluginDir)).toBe(false);
    });

    it('should remove multiple files from manifest', () => {
        const path1 = join(binDir, 'unity-agentic-core.darwin-arm64.node');
        const path2 = join(binDir, 'unity-agentic-core.linux-x64-gnu.node');
        writeFileSync(path1, 'fake');
        writeFileSync(path2, 'fake');
        seedManifest([path1, path2]);

        const output = runUninstall();

        expect(output).toContain('Uninstall complete');
        expect(existsSync(path1)).toBe(false);
        expect(existsSync(path2)).toBe(false);
        expect(existsSync(binDir)).toBe(false);
    });

    it('should skip files that no longer exist', () => {
        // Manifest references a file that was already deleted
        seedManifest([join(binDir, 'already-gone.node')]);

        const output = runUninstall();

        expect(output).toContain('Uninstall complete');
        expect(existsSync(manifestPath)).toBe(false);
    });

    it('should preserve parent directory if it has non-manifest contents', () => {
        const binaryPath = join(binDir, 'unity-agentic-core.darwin-arm64.node');
        writeFileSync(binaryPath, 'fake-binary');
        writeFileSync(join(pluginDir, 'other-file.txt'), 'keep me');
        seedManifest([binaryPath]);

        const output = runUninstall();

        expect(output).toContain('Uninstall complete');
        expect(existsSync(binaryPath)).toBe(false);
        // pluginDir survives because other-file.txt is not in the manifest
        expect(existsSync(pluginDir)).toBe(true);
    });

    it('should handle no manifest gracefully', () => {
        // No manifest file at all
        rmSync(binDir, { recursive: true });
        rmSync(pluginDir, { recursive: true });

        const output = runUninstall();

        expect(output).toContain('Nothing to remove');
    });

    it('should handle empty manifest gracefully', () => {
        seedManifest([]);

        const output = runUninstall();

        // Manifest exists but is empty -- still clean up manifest itself
        expect(existsSync(manifestPath)).toBe(false);
    });
});
