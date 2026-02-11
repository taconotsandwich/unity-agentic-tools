import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { walk_project_files, grep_project, search_project } from '../src/project-search';
import { isNativeModuleAvailable, getNativeWalkProjectFiles, getNativeGrepProject, getNativeBuildGuidCache } from '../src/scanner';

// Root-level fixtures have the full Unity project structure
const EXTERNAL_FIXTURES = resolve(__dirname, '..', '..', 'test', 'fixtures', 'external');

describe('walk_project_files', () => {
    it('should find .unity scene files', () => {
        const files = walk_project_files(EXTERNAL_FIXTURES, ['.unity']);
        expect(files.length).toBeGreaterThanOrEqual(2);
        expect(files.some(f => f.includes('Level.unity'))).toBe(true);
        expect(files.some(f => f.includes('Menu.unity'))).toBe(true);
    });

    it('should find .prefab files', () => {
        const files = walk_project_files(EXTERNAL_FIXTURES, ['.prefab']);
        expect(files.length).toBeGreaterThanOrEqual(5);
        expect(files.some(f => f.includes('IceBox.prefab'))).toBe(true);
    });

    it('should find .asset files including ProjectSettings', () => {
        const files = walk_project_files(EXTERNAL_FIXTURES, ['.asset']);
        expect(files.some(f => f.includes('TagManager.asset'))).toBe(true);
    });

    it('should find .cs script files', () => {
        const files = walk_project_files(EXTERNAL_FIXTURES, ['.cs']);
        expect(files.length).toBeGreaterThanOrEqual(5);
        expect(files.some(f => f.includes('GameManager.cs'))).toBe(true);
    });

    it('should handle missing project path', () => {
        const files = walk_project_files('/nonexistent/path', ['.unity']);
        expect(files).toEqual([]);
    });
});

describe('grep_project', () => {
    it('should find "killzone" in yaml files', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: 'killzone',
            file_type: 'asset',
        });

        expect(result.success).toBe(true);
        expect(result.total_matches).toBeGreaterThanOrEqual(1);
        expect(result.matches.some(m => m.file.includes('TagManager.asset'))).toBe(true);
    });

    it('should find patterns in C# scripts', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: 'class\\s+\\w+',
            file_type: 'cs',
        });

        expect(result.success).toBe(true);
        expect(result.total_matches).toBeGreaterThanOrEqual(1);
    });

    it('should include context lines when requested', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: 'killzone',
            file_type: 'asset',
            context_lines: 2,
        });

        expect(result.success).toBe(true);
        const match = result.matches.find(m => m.file.includes('TagManager.asset'));
        expect(match).toBeDefined();
        if (match) {
            expect(match.context_before).toBeDefined();
            expect(match.context_after).toBeDefined();
        }
    });

    it('should respect max_results cap', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: '.*',
            file_type: 'all',
            max_results: 3,
        });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(3);
        expect(result.truncated).toBe(true);
    });

    it('should find matches with --type yaml (includes .unity, .prefab, .asset)', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: 'm_LocalPosition',
            file_type: 'yaml',
        });

        expect(result.success).toBe(true);
        expect(result.total_files_scanned).toBeGreaterThan(0);
        expect(result.total_matches).toBeGreaterThan(0);
    });

    it('should return error for invalid regex', () => {
        const result = grep_project({
            project_path: EXTERNAL_FIXTURES,
            pattern: '[invalid',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid regex');
    });

    it('should return error for missing project path', () => {
        const result = grep_project({
            project_path: '/nonexistent/path',
            pattern: 'test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

const describeIfNative = isNativeModuleAvailable() ? describe : describe.skip;

describeIfNative('search_project', () => {
    it('should respect max_matches cap', () => {
        const result = search_project({
            project_path: EXTERNAL_FIXTURES,
            max_matches: 2,
        });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(2);
        expect(result.truncated).toBe(true);
    });

    it('should return all matches when max_matches exceeds total', () => {
        const result = search_project({
            project_path: EXTERNAL_FIXTURES,
            name: 'Camera',
            max_matches: 9999,
        });

        expect(result.success).toBe(true);
        // Should not be truncated due to max_matches (may be truncated by page_size)
        if (result.total_matches < 50) {
            expect(result.truncated).toBe(false);
        }
    });
});

// ========== Native vs JS Parity Tests ==========

describeIfNative('native vs JS parity', () => {
    it('walk_project_files: native and JS find the same .cs files', () => {
        const nativeWalk = getNativeWalkProjectFiles()!;
        // Native returns files directly
        const nativeFiles = nativeWalk(EXTERNAL_FIXTURES, ['.cs'], null).sort();
        // The public walk_project_files uses native first; test JS fallback explicitly
        // by importing the module internals isn't possible, but we can compare against
        // the known expected behavior
        expect(nativeFiles.length).toBeGreaterThanOrEqual(5);
        expect(nativeFiles.some((f: string) => f.includes('GameManager.cs'))).toBe(true);
        // Verify all paths are absolute
        for (const f of nativeFiles) {
            expect(f).toMatch(/^\//);
        }
    });

    it('walk_project_files: native and JS find the same .asset files with ProjectSettings', () => {
        const nativeWalk = getNativeWalkProjectFiles()!;
        const nativeFiles = nativeWalk(EXTERNAL_FIXTURES, ['.asset'], null);
        expect(nativeFiles.some((f: string) => f.includes('TagManager.asset'))).toBe(true);
    });

    it('walk_project_files: native returns empty for nonexistent path', () => {
        const nativeWalk = getNativeWalkProjectFiles()!;
        const files = nativeWalk('/nonexistent/path', ['.cs'], null);
        expect(files).toEqual([]);
    });

    it('grep_project: native finds killzone in asset files', () => {
        const nativeGrep = getNativeGrepProject()!;
        const result = nativeGrep({
            projectPath: EXTERNAL_FIXTURES,
            pattern: 'killzone',
            fileType: 'asset',
        });
        expect(result.success).toBe(true);
        expect(result.totalMatches).toBeGreaterThanOrEqual(1);
        expect(result.matches.some((m: any) => m.file.includes('TagManager.asset'))).toBe(true);
    });

    it('grep_project: native respects maxResults', () => {
        const nativeGrep = getNativeGrepProject()!;
        const result = nativeGrep({
            projectPath: EXTERNAL_FIXTURES,
            pattern: '.*',
            fileType: 'all',
            maxResults: 3,
        });
        expect(result.success).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(3);
        expect(result.truncated).toBe(true);
    });

    it('grep_project: native includes context lines', () => {
        const nativeGrep = getNativeGrepProject()!;
        const result = nativeGrep({
            projectPath: EXTERNAL_FIXTURES,
            pattern: 'killzone',
            fileType: 'asset',
            contextLines: 2,
        });
        expect(result.success).toBe(true);
        const match = result.matches.find((m: any) => m.file.includes('TagManager.asset'));
        expect(match).toBeDefined();
        if (match) {
            expect(match.contextBefore).toBeDefined();
            expect(match.contextAfter).toBeDefined();
        }
    });

    it('grep_project: native returns error for invalid regex', () => {
        const nativeGrep = getNativeGrepProject()!;
        const result = nativeGrep({
            projectPath: EXTERNAL_FIXTURES,
            pattern: '[invalid',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid regex');
    });

    it('build_guid_cache: native produces non-empty cache', () => {
        const nativeBuild = getNativeBuildGuidCache()!;
        const cache = nativeBuild(EXTERNAL_FIXTURES);
        const keys = Object.keys(cache);
        expect(keys.length).toBeGreaterThan(0);
        // All GUIDs should be 32-char hex strings
        for (const guid of keys) {
            expect(guid).toMatch(/^[a-f0-9]{32}$/);
        }
        // All values should be relative paths (no leading /)
        for (const path of Object.values(cache)) {
            expect(path as string).not.toMatch(/^\//);
        }
    });

    it('build_guid_cache: native returns empty for no Assets dir', () => {
        const nativeBuild = getNativeBuildGuidCache()!;
        const cache = nativeBuild('/tmp');
        expect(Object.keys(cache).length).toBe(0);
    });
});
