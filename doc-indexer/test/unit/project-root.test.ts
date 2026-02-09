import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { find_project_root, resolve_storage_path } from '../../src/project-root';

describe('find_project_root', () => {
    let temp_dir: string;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'project-root-test-'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('should find root by .unity-agentic directory', () => {
        mkdirSync(join(temp_dir, '.unity-agentic'));
        const subDir = join(temp_dir, 'Assets', 'Scripts');
        mkdirSync(subDir, { recursive: true });

        const root = find_project_root(subDir);
        expect(root).toBe(temp_dir);
    });

    it('should find root by Assets directory', () => {
        mkdirSync(join(temp_dir, 'Assets'));
        const subDir = join(temp_dir, 'Assets', 'Scripts');
        mkdirSync(subDir, { recursive: true });

        const root = find_project_root(subDir);
        expect(root).toBe(temp_dir);
    });

    it('should prefer .unity-agentic over Assets when both exist', () => {
        mkdirSync(join(temp_dir, '.unity-agentic'));
        mkdirSync(join(temp_dir, 'Assets'));

        const root = find_project_root(temp_dir);
        expect(root).toBe(temp_dir);
    });

    it('should return null when no project markers found', () => {
        const subDir = join(temp_dir, 'some', 'deep', 'path');
        mkdirSync(subDir, { recursive: true });

        const root = find_project_root(subDir);
        expect(root).toBeNull();
    });

    it('should start from cwd when no startDir given', () => {
        // Just verify it returns string or null without throwing
        const root = find_project_root();
        expect(root === null || typeof root === 'string').toBe(true);
    });
});

describe('resolve_storage_path', () => {
    it('should return per-project path when project root given', () => {
        const result = resolve_storage_path('/my/project');
        expect(result).toBe(join('/my/project', '.unity-agentic', 'doc-index.json'));
    });

    it('should fallback to cwd when no project root', () => {
        const result = resolve_storage_path(null);
        expect(result).toBe(join(process.cwd(), '.unity-docs-index.json'));
    });

    it('should fallback to cwd when undefined', () => {
        const result = resolve_storage_path(undefined);
        expect(result).toBe(join(process.cwd(), '.unity-docs-index.json'));
    });
});
