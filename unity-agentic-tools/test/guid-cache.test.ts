import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    load_guid_cache,
    load_guid_cache_for_file,
    clear_guid_cache_store,
} from '../src/guid-cache';

describe('guid-cache', () => {
    let temp_dir: string;

    beforeEach(() => {
        clear_guid_cache_store();
        temp_dir = mkdtempSync(join(tmpdir(), 'guid-cache-test-'));
    });

    afterEach(() => {
        clear_guid_cache_store();
        rmSync(temp_dir, { recursive: true, force: true });
    });

    function create_project(guids: Record<string, string>): string {
        mkdirSync(join(temp_dir, 'Assets'), { recursive: true });
        mkdirSync(join(temp_dir, '.unity-agentic'), { recursive: true });
        writeFileSync(
            join(temp_dir, '.unity-agentic', 'guid-cache.json'),
            JSON.stringify(guids)
        );
        return temp_dir;
    }

    describe('load_guid_cache', () => {
        it('should return null when no cache exists', () => {
            mkdirSync(join(temp_dir, 'Assets'), { recursive: true });
            expect(load_guid_cache(temp_dir)).toBeNull();
        });

        it('should load a valid cache', () => {
            const project = create_project({
                'abc123def456abc123def456abc123de': 'Assets/Scripts/Player.cs',
            });
            const cache = load_guid_cache(project);
            expect(cache).not.toBeNull();
            expect(cache!.count).toBe(1);
            expect(cache!.project_path).toBe(project);
        });

        it('should memoize repeated loads', () => {
            const project = create_project({
                'aabbccdd11223344aabbccdd11223344': 'Assets/Foo.cs',
            });
            const first = load_guid_cache(project);
            const second = load_guid_cache(project);
            expect(first).toBe(second); // Same object reference
        });

        it('should return null for malformed JSON', () => {
            mkdirSync(join(temp_dir, 'Assets'), { recursive: true });
            mkdirSync(join(temp_dir, '.unity-agentic'), { recursive: true });
            writeFileSync(
                join(temp_dir, '.unity-agentic', 'guid-cache.json'),
                'not valid json {'
            );
            expect(load_guid_cache(temp_dir)).toBeNull();
        });
    });

    describe('resolve', () => {
        it('should resolve a known GUID to a relative path', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Player.cs',
            });
            const cache = load_guid_cache(project)!;
            expect(cache.resolve('abcdef01234567890abcdef012345678')).toBe(
                'Assets/Scripts/Player.cs'
            );
        });

        it('should return null for unknown GUID', () => {
            const project = create_project({});
            const cache = load_guid_cache(project)!;
            expect(cache.resolve('00000000000000000000000000000000')).toBeNull();
        });
    });

    describe('resolve_absolute', () => {
        it('should join project path with relative path', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Player.cs',
            });
            const cache = load_guid_cache(project)!;
            expect(cache.resolve_absolute('abcdef01234567890abcdef012345678')).toBe(
                join(project, 'Assets/Scripts/Player.cs')
            );
        });

        it('should return already-absolute paths unchanged', () => {
            const absolutePath = '/some/absolute/path/to/file.prefab';
            const project = create_project({
                'ffffffffffffffffffffffffffffffff': absolutePath,
            });
            const cache = load_guid_cache(project)!;
            expect(cache.resolve_absolute('ffffffffffffffffffffffffffffffff')).toBe(
                absolutePath
            );
        });

        it('should return null for unknown GUID', () => {
            const project = create_project({});
            const cache = load_guid_cache(project)!;
            expect(cache.resolve_absolute('00000000000000000000000000000000')).toBeNull();
        });
    });

    describe('resolve_many', () => {
        it('should batch-resolve multiple GUIDs', () => {
            const project = create_project({
                'aaaa0000aaaa0000aaaa0000aaaa0000': 'Assets/A.cs',
                'bbbb0000bbbb0000bbbb0000bbbb0000': 'Assets/B.cs',
            });
            const cache = load_guid_cache(project)!;
            const result = cache.resolve_many([
                'aaaa0000aaaa0000aaaa0000aaaa0000',
                'bbbb0000bbbb0000bbbb0000bbbb0000',
                'cccc0000cccc0000cccc0000cccc0000',
            ]);
            expect(result['aaaa0000aaaa0000aaaa0000aaaa0000']).toBe('Assets/A.cs');
            expect(result['bbbb0000bbbb0000bbbb0000bbbb0000']).toBe('Assets/B.cs');
            expect(result['cccc0000cccc0000cccc0000cccc0000']).toBeNull();
        });
    });

    describe('find_by_name', () => {
        it('should find exact filename match', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/PlayerController.cs',
            });
            const cache = load_guid_cache(project)!;
            const found = cache.find_by_name('PlayerController', '.cs');
            expect(found).not.toBeNull();
            expect(found!.guid).toBe('abcdef01234567890abcdef012345678');
            expect(found!.path).toBe('Assets/Scripts/PlayerController.cs');
        });

        it('should find by name without extension filter', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Textures/Hero.png',
            });
            const cache = load_guid_cache(project)!;
            expect(cache.find_by_name('Hero')).not.toBeNull();
        });

        it('should fall back to substring match', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/MyPlayerController.cs',
            });
            const cache = load_guid_cache(project)!;
            const found = cache.find_by_name('Player', '.cs');
            expect(found).not.toBeNull();
            expect(found!.path).toContain('Player');
        });

        it('should prefer exact match over substring', () => {
            const project = create_project({
                'aaaa0000aaaa0000aaaa0000aaaa0000': 'Assets/Scripts/MyPlayerHelper.cs',
                'bbbb0000bbbb0000bbbb0000bbbb0000': 'Assets/Scripts/Player.cs',
            });
            const cache = load_guid_cache(project)!;
            const found = cache.find_by_name('Player', '.cs');
            expect(found).not.toBeNull();
            expect(found!.guid).toBe('bbbb0000bbbb0000bbbb0000bbbb0000');
        });

        it('should return null when no match', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Foo.cs',
            });
            const cache = load_guid_cache(project)!;
            expect(cache.find_by_name('NonExistent', '.cs')).toBeNull();
        });

        it('should filter by extension', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Player.cs',
                'bbbb0000bbbb0000bbbb0000bbbb0000': 'Assets/Textures/Player.png',
            });
            const cache = load_guid_cache(project)!;
            const found = cache.find_by_name('Player', '.png');
            expect(found).not.toBeNull();
            expect(found!.path.endsWith('.png')).toBe(true);
        });
    });

    describe('load_guid_cache_for_file', () => {
        it('should auto-discover project root from file path', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Foo.cs',
            });
            const scriptDir = join(project, 'Assets', 'Scripts');
            mkdirSync(scriptDir, { recursive: true });
            const scriptPath = join(scriptDir, 'Foo.cs');
            writeFileSync(scriptPath, 'class Foo {}');

            const cache = load_guid_cache_for_file(scriptPath);
            expect(cache).not.toBeNull();
            expect(cache!.project_path).toBe(project);
        });

        it('should use explicit project path when provided', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/Scripts/Bar.cs',
            });
            const cache = load_guid_cache_for_file('/some/random/file.cs', project);
            expect(cache).not.toBeNull();
            expect(cache!.project_path).toBe(project);
        });

        it('should return null when no project root found', () => {
            expect(load_guid_cache_for_file('/tmp/no-project-here/file.cs')).toBeNull();
        });
    });

    describe('clear_guid_cache_store', () => {
        it('should clear memoized caches', () => {
            const project = create_project({
                'abcdef01234567890abcdef012345678': 'Assets/X.cs',
            });
            const first = load_guid_cache(project);
            expect(first).not.toBeNull();

            clear_guid_cache_store();

            // After clearing, a fresh load should return a new object
            const second = load_guid_cache(project);
            expect(second).not.toBeNull();
            expect(second).not.toBe(first);
        });
    });
});
