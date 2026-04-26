import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { cleanup } from '../src/cleanup';

/**
 * Create a temp Unity project with a .unity-agentic/ directory populated
 * with typical files.
 */
function create_temp_project_with_agentic(files?: string[]): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
    const agenticDir = join(dir, '.unity-agentic');
    mkdirSync(agenticDir, { recursive: true });

    const defaultFiles = files || [
        'config.json',
        'guid-cache.json',
        'package-cache.json',
        'local-package-cache.json',
        'type-registry.json',
        'doc-index.json',
        'editor.json',
        'editor.last.json',
    ];
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
            expect(result.modes).toEqual(['stale']);
            expect(result.files_removed).toEqual([]);
        } finally {
            cleanupDir();
        }
    });

    it('should remove stale editor files by default and keep caches', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir });

        expect(result.success).toBe(true);
        expect(result.modes).toEqual(['stale']);
        expect(result.files_removed).toContain('editor.json');
        expect(result.files_removed).toContain('editor.last.json');
        expect(existsSync(join(project.dir, '.unity-agentic', 'config.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'guid-cache.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'package-cache.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'editor.json'))).toBe(false);
        expect(existsSync(join(project.dir, '.unity-agentic', 'editor.last.json'))).toBe(false);
    });

    it('should keep a live editor lock during stale cleanup', () => {
        project = create_temp_project_with_agentic();
        writeFileSync(join(project.dir, '.unity-agentic', 'editor.json'), JSON.stringify({ pid: process.pid }));

        const result = cleanup({ project: project.dir, stale: true });

        expect(result.success).toBe(true);
        expect(result.files_removed).not.toContain('editor.json');
        expect(result.files_removed).toContain('editor.last.json');
        expect(existsSync(join(project.dir, '.unity-agentic', 'editor.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'editor.last.json'))).toBe(false);
    });

    it('should remove rebuildable caches only when cache cleanup is requested', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir, cache: true });

        expect(result.success).toBe(true);
        expect(result.modes).toEqual(['cache']);
        expect(result.files_removed).toContain('guid-cache.json');
        expect(result.files_removed).toContain('package-cache.json');
        expect(result.files_removed).toContain('local-package-cache.json');
        expect(result.files_removed).toContain('type-registry.json');
        expect(result.files_removed).toContain('doc-index.json');
        expect(result.files_removed).not.toContain('editor.json');
        expect(existsSync(join(project.dir, '.unity-agentic', 'config.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'editor.json'))).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic', 'guid-cache.json'))).toBe(false);
    });

    it('should remove entire directory on full cleanup (all: true)', () => {
        project = create_temp_project_with_agentic();

        const result = cleanup({ project: project.dir, all: true });

        expect(result.success).toBe(true);
        expect(result.modes).toEqual(['all']);
        expect(result.directory_removed).toBe(true);
        expect(existsSync(join(project.dir, '.unity-agentic'))).toBe(false);
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
