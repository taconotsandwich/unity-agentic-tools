import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = join(__dirname, '..', '..', 'dist', 'cli.js');

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execSync(`bun ${CLI_PATH} ${args}`, {
            encoding: 'utf-8',
            timeout: 10000,
        });
        return { stdout, stderr: '', exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || '',
            exitCode: err.status ?? 1,
        };
    }
}

describe('doc-indexer CLI integration', () => {
    it('search subcommand should execute without "does not exist" error', () => {
        const result = runCli('search "Rigidbody"');
        expect(result.stderr).not.toContain('does not exist');
        expect(result.stderr).not.toContain('is not recognized');
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/Found|error/i);
    });

    it('index subcommand should execute against a nonexistent path gracefully', () => {
        const result = runCli('index /tmp/nonexistent-path-12345');
        expect(result.stderr).not.toContain('does not exist');
    });

    it('clear subcommand should execute without error', () => {
        const result = runCli('clear');
        expect(result.stderr).not.toContain('does not exist');
        expect(result.stdout).toContain('Cleared');
    });

    it('--help should list all three subcommands', () => {
        const result = runCli('--help');
        expect(result.stdout).toContain('index');
        expect(result.stdout).toContain('search');
        expect(result.stdout).toContain('clear');
    });

    it('search -s (summarize) should be accepted', () => {
        const result = runCli('search "Rigidbody" -s');
        expect(result.stderr).not.toContain('unknown option');
        expect(result.stdout + result.stderr).toMatch(/Found|error/i);
    });

    it('search -c (compress) should be accepted', () => {
        const result = runCli('search "Rigidbody" -c');
        expect(result.stderr).not.toContain('unknown option');
    });

    it('search -j (json) should output valid JSON', () => {
        const result = runCli('search "Rigidbody" -j');
        expect(result.stderr).not.toContain('unknown option');
        expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
});

describe('doc-indexer CLI --storage-path', () => {
    let temp_dir: string;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'cli-storage-test-'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('should use --storage-path for search', () => {
        const storagePath = join(temp_dir, 'custom-index.json');
        const result = runCli(`--storage-path ${storagePath} search "test"`);

        // Should not crash; index file may or may not be created (no sources)
        expect(result.stderr).not.toContain('does not exist');
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/Found|error/i);
    });

    it('should use --storage-path for clear', () => {
        const storagePath = join(temp_dir, 'custom-index.json');
        const result = runCli(`--storage-path ${storagePath} clear`);

        expect(result.stdout).toContain('Cleared');
    });

    it('index without path should fail when no project root found', () => {
        const storagePath = join(temp_dir, 'custom-index.json');
        const result = runCli(`--storage-path ${storagePath} index`);

        // Should fail gracefully (no Unity project found)
        expect(result.exitCode).not.toBe(0);
    });

    it('index without path should discover sources when project root given', () => {
        // Create a fake Unity project with package docs
        const projectDir = join(temp_dir, 'MyProject');
        mkdirSync(join(projectDir, 'Assets'), { recursive: true });
        const docsDir = join(projectDir, 'Packages', 'com.unity.test-pkg', 'Documentation~');
        mkdirSync(docsDir, { recursive: true });
        writeFileSync(join(docsDir, 'index.md'), '# Test Package\n\nSome documentation content.');

        const storagePath = join(temp_dir, 'test-index.json');
        const result = runCli(`--project-root ${projectDir} --storage-path ${storagePath} index`);

        expect(result.stdout).toContain('pkg:com.unity.test-pkg');
        expect(result.stdout).toContain('1 files');
        expect(existsSync(storagePath)).toBe(true);
    });
});
