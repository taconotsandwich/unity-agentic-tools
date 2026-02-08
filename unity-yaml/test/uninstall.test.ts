import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('uninstall', () => {
    let tempHome: string;
    let binDir: string;
    let pluginDir: string;
    const scriptPath = join(__dirname, '..', '..', 'scripts', 'install-binary.ts');

    beforeEach(() => {
        // Create a unique temp directory to act as HOME
        tempHome = join(tmpdir(), `unity-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        pluginDir = join(tempHome, '.claude', 'unity-agentic-tools');
        binDir = join(pluginDir, 'bin');
        mkdirSync(binDir, { recursive: true });
    });

    afterEach(() => {
        // Clean up temp directory
        if (existsSync(tempHome)) {
            rmSync(tempHome, { recursive: true, force: true });
        }
    });

    function runUninstall(): string {
        return execSync(`bun "${scriptPath}" uninstall`, {
            env: {
                ...process.env,
                HOME: tempHome,           // Unix
                USERPROFILE: tempHome,     // Windows
            },
            encoding: 'utf-8',
        });
    }

    it('should remove .node binary and clean up empty directories', () => {
        // Seed a fake .node binary
        writeFileSync(join(binDir, 'unity-agentic-core.darwin-arm64.node'), 'fake-binary');

        const output = runUninstall();

        expect(output).toContain('Removed:');
        expect(output).toContain('Uninstall complete');
        expect(existsSync(binDir)).toBe(false);
        expect(existsSync(pluginDir)).toBe(false);
    });

    it('should remove multiple files from bin directory', () => {
        writeFileSync(join(binDir, 'unity-agentic-core.darwin-arm64.node'), 'fake-binary');
        writeFileSync(join(binDir, 'unity-agentic-core.linux-x64-gnu.node'), 'fake-binary');

        const output = runUninstall();

        expect(output).toContain('Uninstall complete');
        expect(existsSync(binDir)).toBe(false);
    });

    it('should preserve parent directory if it has other contents', () => {
        writeFileSync(join(binDir, 'unity-agentic-core.darwin-arm64.node'), 'fake-binary');
        // Add a sibling file outside bin/ so pluginDir is not empty after bin/ removal
        writeFileSync(join(pluginDir, 'other-file.txt'), 'keep me');

        const output = runUninstall();

        expect(output).toContain('Uninstall complete');
        expect(existsSync(binDir)).toBe(false);
        // pluginDir should survive because it still has other-file.txt
        expect(existsSync(pluginDir)).toBe(true);
    });

    it('should handle missing bin directory gracefully', () => {
        // Remove the bin directory we created in beforeEach
        rmSync(binDir, { recursive: true });

        const output = runUninstall();

        expect(output).toContain('Nothing to remove');
    });
});
