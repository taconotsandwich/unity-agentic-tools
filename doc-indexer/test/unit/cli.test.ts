import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

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

/**
 * Integration tests that exercise the built CLI binary via subprocess.
 * These catch Commander.js wiring bugs (e.g. the 2-arg .command() form
 * that triggers executable subcommand mode) that unit tests miss.
 */
describe('doc-indexer CLI integration', () => {
    it('search subcommand should execute without "does not exist" error', () => {
        // The bug: 2-arg .command('search <query>', 'desc') made Commander
        // look for a 'unity-doc-indexer-search' binary instead of running inline.
        // Without OPENAI_API_KEY the search will fail with an API error,
        // but that proves the action handler ran (not "binary not found").
        const result = runCli('search "Rigidbody"');
        expect(result.stderr).not.toContain('does not exist');
        expect(result.stderr).not.toContain('is not recognized');
        // Either succeeds with "Found" or fails with an API/embedding error
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/Found|OpenAI|API|error/i);
    });

    it('index subcommand should execute against a nonexistent path gracefully', () => {
        const result = runCli('index /tmp/nonexistent-path-12345');
        // Should fail with a file error, NOT with "unity-doc-indexer-index does not exist"
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
});
