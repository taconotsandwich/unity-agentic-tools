import { describe, expect, it } from 'vitest';
import { resolve, join } from 'path';
import { walk_project_files, grep_project } from '../src/project-search';

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
