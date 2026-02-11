import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateGuid, atomicWrite, validate_name } from '../src/utils';

describe('generateGuid', () => {
    it('should return a 32-character lowercase hex string', () => {
        const guid = generateGuid();
        expect(guid).toMatch(/^[0-9a-f]{32}$/);
        expect(guid).toHaveLength(32);
    });

    it('should only contain valid hex characters', () => {
        for (let i = 0; i < 10; i++) {
            const guid = generateGuid();
            expect(guid).toMatch(/^[0-9a-f]+$/);
        }
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
        const content = 'hello 🌍🎮';

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
});

describe('validate_name', () => {
    it('should accept valid names', () => {
        expect(validate_name('Player', 'Test')).toBeNull();
        expect(validate_name('Main Camera', 'Test')).toBeNull();
        expect(validate_name('Object (1)', 'Test')).toBeNull();
        expect(validate_name('Enemy_Boss_v2', 'Test')).toBeNull();
    });

    it('should accept Unicode names', () => {
        expect(validate_name('敵キャラ', 'Test')).toBeNull();
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
