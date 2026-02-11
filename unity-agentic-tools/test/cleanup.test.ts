import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { cleanup } from '../src/cleanup';

/**
 * Create a temp Unity project with a .unity-agentic/ directory populated
 * with typical files (config.json, guid-cache.json, doc-index.json).
 */
function create_temp_project_with_agentic(files?: string[]): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
    const agenticDir = join(dir, '.unity-agentic');
    mkdirSync(agenticDir, { recursive: true });

    const defaultFiles = files || ['config.json', 'guid-cache.json', 'doc-index.json'];
    for (const file of defaultFiles) {
        writeFileSync(join(agenticDir, file), '{}');
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

describe('cleanup', () => {
    let project: { dir: string; cleanup: () => void } | undefined;

    afterEach(() => {
        project?.cleanup();
        project = undefined;
    });

    it('should succeed when .unity-agentic/ does not exist', () => {
        const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
        const cleanupDir = () => rmSync(dir, { recursive: true, force: true });

        try {
            const result = cleanup({ project: dir });
            expect(result.success).toBe(true);
            expect(result.files_removed).toEqual([]);
        } finally {
            cleanupDir();
        }
    });

    it('should remove cache files but keep config.json on partial cleanup', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.files_removed).toContain('guid-cache.json');
        expect(result.files_removed).toContain('doc-index.json');
        // config.json should still exist
        expect(existsSync(join(project.dir, '.unity-agentic', 'config.json'))).toBe(true);
    });

    it('should report removed file names in result', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir });

        expect(result.files_removed.length).toBeGreaterThan(0);
        for (const name of result.files_removed) {
            expect(typeof name).toBe('string');
        }
    });

    it('should remove entire directory on full cleanup (all: true)', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir, all: true });

        expect(result.success).toBe(true);
        expect(result.directory_removed).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic'))).toBe(false);
    });

    it('should set directory_removed: true on full cleanup', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir, all: true });

        expect(result.directory_removed).toBe(true);
    });

    it('should handle nested subdirectories in full cleanup', () => {
        project = create_temp_project_with_agentic();
        // Add a nested subdirectory inside .unity-agentic
        const nestedDir = join(project.dir, '.unity-agentic', 'cache', 'deep');
        mkdirSync(nestedDir, { recursive: true });
        writeFileSync(join(nestedDir, 'data.json'), '{}');

        const result = cleanup({ project: project.dir, all: true });

        expect(result.success).toBe(true);
        expect(result.directory_removed).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic'))).toBe(false);
    });

    it('should handle empty .unity-agentic/ directory', () => {
        const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
        mkdirSync(join(dir, '.unity-agentic'), { recursive: true });
        project = { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };

        const result = cleanup({ project: dir });

        expect(result.success).toBe(true);
        expect(result.files_removed).toEqual([]);
    });
});
