import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { setup } from '../src/setup';

/**
 * Create a minimal temp Unity project with Assets/ and optional .meta files.
 */
function create_temp_unity_project(metaFiles?: { path: string; guid: string }[]): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'setup-test-'));
    mkdirSync(join(dir, 'Assets'), { recursive: true });

    if (metaFiles) {
        for (const { path: relPath, guid } of metaFiles) {
            const fullPath = join(dir, relPath);
            const parentDir = dirname(fullPath);
            mkdirSync(parentDir, { recursive: true });
            writeFileSync(fullPath, `fileFormatVersion: 2\nguid: ${guid}\n`);
        }
    }

    return {
        dir,
        cleanup: () => {
            if (existsSync(dir)) {
                rmSync(dir, { recursive: true, force: true });
            }
        },
    };
}

describe('setup', () => {
    let project: { dir: string; cleanup: () => void } | undefined;

    afterEach(() => {
        project?.cleanup();
        project = undefined;
    });

    it('should fail when Assets/ is missing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'setup-test-'));
        const cleanup = () => rmSync(dir, { recursive: true, force: true });

        try {
            const result = setup({ project: dir });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Assets');
        } finally {
            cleanup();
        }
    });

    it('should create .unity-agentic/ directory', () => {
        project = create_temp_unity_project();
        const result = setup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic'))).toBe(true);
    });

    it('should create config.json with version, project_path, created_at', () => {
        project = create_temp_unity_project();
        setup({ project: project.dir });

        const configPath = join(project.dir, '.unity-agentic', 'config.json');
        expect(existsSync(configPath)).toBe(true);

        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(config.version).toBeDefined();
        expect(config.project_path).toBe(project.dir);
        expect(config.created_at).toBeDefined();
    });

    it('should build GUID cache from .meta files (3 files -> guid_count: 3)', () => {
        project = create_temp_unity_project([
            { path: 'Assets/Script1.cs.meta', guid: 'a'.repeat(32) },
            { path: 'Assets/Script2.cs.meta', guid: 'b'.repeat(32) },
            { path: 'Assets/Material.mat.meta', guid: 'c'.repeat(32) },
        ]);

        const result = setup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.guid_count).toBe(3);
        expect(result.guid_cache_created).toBe(true);
    });

    it('should handle nested .meta files in subdirectories', () => {
        project = create_temp_unity_project([
            { path: 'Assets/Scripts/Player/Movement.cs.meta', guid: 'd'.repeat(32) },
            { path: 'Assets/Prefabs/Enemy.prefab.meta', guid: 'e'.repeat(32) },
        ]);

        const result = setup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.guid_count).toBe(2);
    });

    it('should skip malformed .meta files (no guid: line)', () => {
        project = create_temp_unity_project([
            { path: 'Assets/Good.cs.meta', guid: 'f'.repeat(32) },
        ]);
        // Write a malformed .meta file (no guid line)
        const badMetaPath = join(project.dir, 'Assets', 'Bad.cs.meta');
        writeFileSync(badMetaPath, 'fileFormatVersion: 2\nnotAGuid: something\n');

        const result = setup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.guid_count).toBe(1); // Only the good one
    });

    it('should create doc-index.json when indexDocs: true', () => {
        project = create_temp_unity_project();
        const result = setup({ project: project.dir, indexDocs: true });

        expect(result.success).toBe(true);
        expect(result.doc_index_created).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'doc-index.json'))).toBe(true);
    });

    it('should skip doc-index.json by default', () => {
        project = create_temp_unity_project();
        const result = setup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.doc_index_created).toBe(false);
        expect(existsSync(join(project.dir, '.unity-agentic', 'doc-index.json'))).toBe(false);
    });
});
