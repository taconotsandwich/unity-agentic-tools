import { describe, expect, it, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const hooks_dir = resolve(__dirname, '..', '..', 'hooks');
const fixtures_dir = resolve(__dirname, 'fixtures');

/**
 * Run a hook script by piping JSON to its stdin.
 * Returns { stdout, stderr, exitCode }.
 */
function run_hook(name: string, input: Record<string, unknown>): { stdout: string; stderr: string; exitCode: number } {
    const hookPath = join(hooks_dir, name);
    try {
        const stdout = execFileSync('bun', [hookPath], {
            input: JSON.stringify(input),
            encoding: 'utf-8',
            timeout: 10000,
        });
        return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: (err.stdout || '').trim(),
            stderr: (err.stderr || '').trim(),
            exitCode: err.status ?? 1,
        };
    }
}

// ── detect_unity.js ──────────────────────────────

describe('detect_unity.js', () => {
    it('should inject context when prompt mentions .unity file', () => {
        const result = run_hook('detect_unity.js', {
            user_prompt: 'Please inspect Assets/Scenes/Main.unity',
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toContain('unity-yaml CLI');
    });

    it('should inject context when prompt mentions .prefab file', () => {
        const result = run_hook('detect_unity.js', {
            user_prompt: 'Edit the Player.prefab to change speed',
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toContain('unity-yaml CLI');
    });

    it('should pass through unchanged when no Unity files in prompt', () => {
        const result = run_hook('detect_unity.js', {
            user_prompt: 'How do I install bun?',
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toBeUndefined();
    });

    it('should pass through with empty prompt', () => {
        const result = run_hook('detect_unity.js', {
            user_prompt: '',
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toBeUndefined();
    });
});

// ── pre_unity_validate.js ────────────────────────

describe('pre_unity_validate.js', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should pass through for non-Edit/Write tools', () => {
        const result = run_hook('pre_unity_validate.js', {
            tool_name: 'Read',
            tool_input: { filePath: '/some/file.unity' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.decision).toBeUndefined();
    });

    it('should pass through for non-Unity file extensions', () => {
        const result = run_hook('pre_unity_validate.js', {
            tool_name: 'Edit',
            tool_input: { filePath: '/some/file.ts' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.decision).toBeUndefined();
    });

    it('should pass through when Unity file does not exist', () => {
        const result = run_hook('pre_unity_validate.js', {
            tool_name: 'Edit',
            tool_input: { filePath: '/nonexistent/file.unity' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.decision).toBeUndefined();
    });

    it('should block when file has invalid YAML header', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'hook-validate-'));
        const badFile = join(temp_dir, 'corrupt.unity');
        writeFileSync(badFile, 'NOT A YAML FILE\nsome garbage content\n');

        const result = run_hook('pre_unity_validate.js', {
            tool_name: 'Edit',
            tool_input: { filePath: badFile },
        });
        expect(result.exitCode).toBe(1);
        const data = JSON.parse(result.stdout);
        expect(data.decision).toBe('block');
        expect(data.message).toContain('validation failed');
    });

    it('should pass through for a valid Unity fixture', () => {
        const fixturePath = resolve(fixtures_dir, 'SampleScene.unity');
        const result = run_hook('pre_unity_validate.js', {
            tool_name: 'Edit',
            tool_input: { filePath: fixturePath },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.decision).toBeUndefined();
    });
});

// ── post_unity_verify.js ─────────────────────────

describe('post_unity_verify.js', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should pass through for non-Edit tools', () => {
        const result = run_hook('post_unity_verify.js', {
            tool_name: 'Read',
            tool_input: { filePath: '/some/file.unity' },
            tool_result: {},
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.warnings).toBeUndefined();
    });

    it('should skip verification when tool_result has error', () => {
        const result = run_hook('post_unity_verify.js', {
            tool_name: 'Edit',
            tool_input: { filePath: '/some/file.unity' },
            tool_result: { error: 'something went wrong' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.warnings).toBeUndefined();
    });

    it('should report warnings for corrupted file (missing %YAML)', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'hook-verify-'));
        const badFile = join(temp_dir, 'corrupt.unity');
        writeFileSync(badFile, 'NOT YAML\nsome content\n');

        const result = run_hook('post_unity_verify.js', {
            tool_name: 'Edit',
            tool_input: { filePath: badFile },
            tool_result: {},
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.warnings).toBeDefined();
        expect(data.warnings.length).toBeGreaterThan(0);
        expect(data.warnings[0]).toContain('YAML header');
    });

    it('should produce no warnings for a clean fixture', () => {
        const fixturePath = resolve(fixtures_dir, 'SampleScene.unity');
        const result = run_hook('post_unity_verify.js', {
            tool_name: 'Edit',
            tool_input: { filePath: fixturePath },
            tool_result: {},
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.warnings).toBeUndefined();
    });
});

// ── unity_context_inject.js ──────────────────────

describe('unity_context_inject.js', () => {
    it('should inject context for Read on a .unity file', () => {
        const result = run_hook('unity_context_inject.js', {
            tool_name: 'Read',
            tool_input: { filePath: '/project/Assets/Main.unity' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toContain('Main.unity');
        expect(data.context).toContain('unity-yaml CLI');
    });

    it('should not inject context for Read on a .txt file', () => {
        const result = run_hook('unity_context_inject.js', {
            tool_name: 'Read',
            tool_input: { filePath: '/project/README.txt' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toBeUndefined();
    });

    it('should not inject context for non-Read tools', () => {
        const result = run_hook('unity_context_inject.js', {
            tool_name: 'Edit',
            tool_input: { filePath: '/project/Assets/Main.unity' },
        });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.context).toBeUndefined();
    });
});

// ── unity_docs_index.js ──────────────────────────

describe('unity_docs_index.js', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should pass through for directory without ProjectSettings', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'hook-docs-'));
        const result = run_hook('unity_docs_index.js', { cwd: temp_dir });
        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        // Should just pass through without crash
        expect(data.cwd).toBe(temp_dir);
    });

    it('should not crash for directory with ProjectVersion.txt', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'hook-docs-'));
        const settingsDir = join(temp_dir, 'ProjectSettings');
        mkdirSync(settingsDir, { recursive: true });
        writeFileSync(
            join(settingsDir, 'ProjectVersion.txt'),
            'm_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (abc123)\n'
        );

        const result = run_hook('unity_docs_index.js', { cwd: temp_dir });
        expect(result.exitCode).toBe(0);
        // Should parse without error
        JSON.parse(result.stdout);
    });

    it('should pass through for non-Unity directory', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'hook-docs-'));
        writeFileSync(join(temp_dir, 'package.json'), '{}');

        const result = run_hook('unity_docs_index.js', { cwd: temp_dir });
        expect(result.exitCode).toBe(0);
        JSON.parse(result.stdout);
    });

    it('should exit 1 on invalid JSON input', () => {
        const hookPath = join(hooks_dir, 'unity_docs_index.js');
        try {
            execFileSync('bun', [hookPath], {
                input: 'NOT JSON AT ALL',
                encoding: 'utf-8',
                timeout: 10000,
            });
            // Should not reach here
            expect.unreachable('Should have thrown');
        } catch (err: any) {
            expect(err.status).toBe(1);
        }
    });
});
