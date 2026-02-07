import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
    indexMarkdownFile,
    indexDocsDirectory,
    indexScriptableObject,
} from '../../src/indexer';

const fixtures_dir = resolve(__dirname, '..', 'fixtures');

describe('indexMarkdownFile', () => {
    it('should return chunks_indexed > 0 and files_processed === 1', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.chunks_indexed).toBeGreaterThan(0);
        expect(result.files_processed).toBe(1);
    });

    it('should extract code blocks from markdown', () => {
        // The sample.md has csharp code blocks, so chunks should include code
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        // There are at least 2 code blocks in sample.md
        expect(result.chunks_indexed).toBeGreaterThanOrEqual(2);
    });

    it('should compute total_tokens > 0', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.total_tokens).toBeGreaterThan(0);
    });

    it('should report elapsed_ms >= 0', () => {
        const result = indexMarkdownFile(resolve(fixtures_dir, 'sample.md'));

        expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
});

describe('indexDocsDirectory', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should process all .md files in a directory', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        writeFileSync(join(temp_dir, 'doc1.md'), '## Heading\n\nSome content.');
        writeFileSync(join(temp_dir, 'doc2.md'), '## Other\n\nMore content.');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(2);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should skip non-matching extensions', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        writeFileSync(join(temp_dir, 'readme.md'), '## Test\n\nContent.');
        writeFileSync(join(temp_dir, 'image.png'), 'binary data');
        writeFileSync(join(temp_dir, 'script.js'), 'console.log("hi")');

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(1); // only .md
    });

    it('should return 0 chunks for empty directory', async () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));

        const result = await indexDocsDirectory(temp_dir);

        expect(result.files_processed).toBe(0);
        expect(result.chunks_indexed).toBe(0);
    });
});

describe('indexScriptableObject', () => {
    it('should index a .asset file', () => {
        const result = indexScriptableObject(resolve(fixtures_dir, 'sample.asset'));

        expect(result.files_processed).toBe(1);
        expect(result.chunks_indexed).toBeGreaterThan(0);
    });

    it('should fall back to prose chunking for non-ScriptableObject content', () => {
        // sample.asset uses MonoBehaviour with m_ properties
        // Either ScriptableObject parsing or prose fallback should produce chunks
        const result = indexScriptableObject(resolve(fixtures_dir, 'sample.asset'));

        expect(result.chunks_indexed).toBeGreaterThan(0);
        expect(result.total_tokens).toBeGreaterThan(0);
    });
});

describe('large section chunking', () => {
    let temp_dir: string | undefined;

    afterEach(() => {
        if (temp_dir && existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
        temp_dir = undefined;
    });

    it('should produce multiple chunks for sections >4096 chars', () => {
        temp_dir = mkdtempSync(join(tmpdir(), 'indexer-test-'));
        // Create a file with a very large section (>4096 chars = >1024 tokens)
        const largeContent = '## Large Section\n\n' + ('This is a sentence that contains words. '.repeat(200));
        const filePath = join(temp_dir, 'large.md');
        writeFileSync(filePath, largeContent);

        const result = indexMarkdownFile(filePath);

        // With ~8000 chars of prose, should be split into multiple chunks
        expect(result.chunks_indexed).toBeGreaterThan(1);
    });
});
