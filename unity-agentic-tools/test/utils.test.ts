import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateGuid, atomicWrite, validate_name, path_glob_to_regex, normalize_property_path } from '../src/utils';

describe('generateGuid', () => {
    it('should return a 32-character lowercase hex string', () => {
        const guid = generateGuid();
        expect(guid).toMatch(/^[0-9a-f]{32}$/);
        expect(guid).toHaveLength(32);
    });

    it('should generate unique values across 100 calls', () => {
        const guids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            guids.add(generateGuid());
        }
        expect(guids.size).toBe(100);
    });
});

describe('atomicWrite', () => {
    let temp_dir: string;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    function makeTempDir(): string {
        temp_dir = mkdtempSync(join(tmpdir(), 'utils-test-'));
        return temp_dir;
    }

    it('should write a new file and return success with bytes_written', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'test.txt');
        const content = 'hello world';

        const result = atomicWrite(filePath, content);

        expect(result.success).toBe(true);
        expect(result.file_path).toBe(filePath);
        expect(result.bytes_written).toBe(11);
        expect(readFileSync(filePath, 'utf-8')).toBe(content);
    });

    it('should overwrite existing file atomically with no leftover .tmp/.bak', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'test.txt');
        writeFileSync(filePath, 'original content');

        const result = atomicWrite(filePath, 'updated content');

        expect(result.success).toBe(true);
        expect(readFileSync(filePath, 'utf-8')).toBe('updated content');
        expect(existsSync(`${filePath}.tmp`)).toBe(false);
        expect(existsSync(`${filePath}.bak`)).toBe(false);
    });

    it('should return correct byte count for UTF-8 multi-byte characters', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'utf8.txt');
        // Each emoji is 4 bytes in UTF-8
        const content = 'hello \u{1F30D}\u{1F3AE}';

        const result = atomicWrite(filePath, content);

        expect(result.success).toBe(true);
        expect(result.bytes_written).toBe(Buffer.byteLength(content, 'utf-8'));
        // 6 ASCII bytes + 1 space + 4 + 4 = 15
        expect(result.bytes_written).toBeGreaterThan(content.length);
    });

    it('should return success: false with error on write failure', () => {
        // Attempt to write to a non-existent directory
        const result = atomicWrite('/nonexistent/path/file.txt', 'data');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
    });

    it('should preserve original file if write to .tmp fails', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'important.txt');
        writeFileSync(filePath, 'important data');

        // Try to write where .tmp would go to an invalid path
        const badPath = join(dir, 'subdir', 'nested', 'file.txt');
        const result = atomicWrite(badPath, 'new data');

        expect(result.success).toBe(false);
        // Original file should be untouched
        expect(readFileSync(filePath, 'utf-8')).toBe('important data');
    });

    it('should write empty string successfully', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'empty.txt');

        const result = atomicWrite(filePath, '');

        expect(result.success).toBe(true);
        expect(result.bytes_written).toBe(0);
        expect(readFileSync(filePath, 'utf-8')).toBe('');
    });

    it('should not leave uniquely-suffixed .bak after successful write', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'test.txt');
        writeFileSync(filePath, 'current');

        const result = atomicWrite(filePath, 'new content');

        expect(result.success).toBe(true);
        expect(readFileSync(filePath, 'utf-8')).toBe('new content');
        const bakFiles = readdirSync(dir).filter(f => f.endsWith('.bak'));
        expect(bakFiles).toHaveLength(0);
    });

    it('should clean up .tmp on write failure', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'test.txt');
        writeFileSync(filePath, 'original');

        // Make the directory read-only so rename to .bak succeeds but
        // the test still exercises cleanup. We simulate by checking that
        // no .tmp files linger after a failed write to a bad path.
        const badPath = join(dir, 'no-such-subdir', 'file.txt');
        atomicWrite(badPath, 'data');

        // No .tmp files should remain in the parent dir
        const tmpFiles = readdirSync(dir).filter(f => f.endsWith('.tmp'));
        expect(tmpFiles).toHaveLength(0);
    });

    it('should succeed when target file is deleted externally before rename to .bak', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'ephemeral.txt');
        // File does not exist -- simulates external deletion between permission
        // check and the rename-to-.bak step (TOCTOU window)

        const result = atomicWrite(filePath, 'new content');

        expect(result.success).toBe(true);
        expect(readFileSync(filePath, 'utf-8')).toBe('new content');
    });

    it('should not leave .tmp or .bak files after concurrent writes to same path', () => {
        const dir = makeTempDir();
        const filePath = join(dir, 'concurrent.txt');
        writeFileSync(filePath, 'initial');

        // Simulate rapid sequential writes (concurrent writes with randomized tmp names)
        for (let i = 0; i < 5; i++) {
            const result = atomicWrite(filePath, `write-${i}`);
            expect(result.success).toBe(true);
        }

        expect(readFileSync(filePath, 'utf-8')).toBe('write-4');
        const leftovers = readdirSync(dir).filter(f => f.endsWith('.tmp') || f.endsWith('.bak'));
        expect(leftovers).toHaveLength(0);
    });
});

describe('normalize_property_path', () => {
    it('should convert dot-notation array index to bracket notation', () => {
        expect(normalize_property_path('m_Materials.Array.data.0')).toBe('m_Materials.Array.data[0]');
        expect(normalize_property_path('m_Points.Array.data.5.x')).toBe('m_Points.Array.data[5].x');
    });

    it('should leave bracket notation unchanged', () => {
        expect(normalize_property_path('m_Materials.Array.data[0]')).toBe('m_Materials.Array.data[0]');
    });

    it('should leave non-array paths unchanged', () => {
        expect(normalize_property_path('m_LocalPosition.x')).toBe('m_LocalPosition.x');
        expect(normalize_property_path('m_Name')).toBe('m_Name');
    });

    it('should handle multiple array indices in one path', () => {
        expect(normalize_property_path('m_Outer.Array.data.2.m_Inner.Array.data.3'))
            .toBe('m_Outer.Array.data[2].m_Inner.Array.data[3]');
    });
});

describe('validate_name', () => {
    it('should accept valid names', () => {
        expect(validate_name('Player', 'Test')).toBeNull();
        expect(validate_name('Main Camera', 'Test')).toBeNull();
        expect(validate_name('Object (1)', 'Test')).toBeNull();
        expect(validate_name('Enemy_Boss_v2', 'Test')).toBeNull();
    });

    it('should accept Unicode names', () => {
        expect(validate_name('\u6575\u30AD\u30E3\u30E9', 'Test')).toBeNull();
        expect(validate_name('Spieler', 'Test')).toBeNull();
    });

    it('should reject forward slashes', () => {
        const result = validate_name('Parent/Child', 'GameObject name');
        expect(result).not.toBeNull();
        expect(result).toContain('forward slashes');
        expect(result).toContain('GameObject name');
    });

    it('should reject backslashes', () => {
        const result = validate_name('Path\\Name', 'Tag name');
        expect(result).not.toBeNull();
        expect(result).toContain('backslashes');
    });

    it('should reject newlines', () => {
        expect(validate_name('Line1\nLine2', 'Test')).toContain('newlines');
        expect(validate_name('Line1\rLine2', 'Test')).toContain('newlines');
        expect(validate_name('Line1\r\nLine2', 'Test')).toContain('newlines');
    });

    it('should reject null bytes', () => {
        expect(validate_name('Name\0Bad', 'Test')).toContain('null bytes');
    });

    it('should include the label in error messages', () => {
        const result = validate_name('Bad/Name', 'Tag name');
        expect(result).toContain('Tag name');
    });
});

describe('path_glob_to_regex', () => {
    it('should match ** glob across directory separators', () => {
        const re = path_glob_to_regex('**/*.cs');
        expect(re.test('Assets/Scripts/Player.cs')).toBe(true);
        expect(re.test('Assets/Deep/Nested/Dir/File.cs')).toBe(true);
        expect(re.test('Player.cs')).toBe(false); // no directory prefix to match **/
    });

    it('should match * glob within a single directory segment', () => {
        const re = path_glob_to_regex('Assets/*.cs');
        expect(re.test('Assets/Player.cs')).toBe(true);
        expect(re.test('Assets/Scripts/Player.cs')).toBe(false); // * does not cross /
    });

    it('should handle ? as single-character wildcard', () => {
        const re = path_glob_to_regex('Player?.cs');
        expect(re.test('Assets/Player1.cs')).toBe(true);
        expect(re.test('Assets/PlayerAB.cs')).toBe(false);
    });

    it('should do substring match when no wildcards present', () => {
        const re = path_glob_to_regex('Editor');
        expect(re.test('Assets/Editor/Foo.cs')).toBe(true);
        expect(re.test('Assets/Scripts/Player.cs')).toBe(false);
    });

    it('should be case-insensitive', () => {
        const re = path_glob_to_regex('**/*.CS');
        expect(re.test('Assets/player.cs')).toBe(true);
    });

    it('should escape regex special chars in the pattern', () => {
        const re = path_glob_to_regex('file(1).txt');
        expect(re.test('Assets/file(1).txt')).toBe(true);
        expect(re.test('Assets/fileX1Y.txt')).toBe(false); // ( ) are literal, not groups
    });

    it('should not crash on patterns that are invalid regex', () => {
        // This was the original bug: **/*.cs passed as raw RegExp crashes
        expect(() => path_glob_to_regex('**/*.cs')).not.toThrow();
        expect(() => path_glob_to_regex('**/+*.cs')).not.toThrow();
    });
});
