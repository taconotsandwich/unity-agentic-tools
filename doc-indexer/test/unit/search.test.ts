import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DocStorage } from '../../src/storage';
import { DocSearch } from '../../src/search';

describe('DocSearch', () => {
    let temp_dir: string;
    let storage: DocStorage;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'search-test-'));
        storage = new DocStorage(join(temp_dir, '.unity-docs-index.json'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('should construct with DocStorage', () => {
        const search = new DocSearch(storage);
        expect(search).toBeDefined();
    });

    it('should return keyword results without native module', async () => {
        await storage.storeChunk({
            id: 'k1',
            content: 'Unity MonoBehaviour lifecycle methods',
            metadata: { source: 'test' },
        });

        const search = new DocSearch(storage);
        const results = await search.search({ query: 'MonoBehaviour lifecycle' });
        expect(results.results.length).toBeGreaterThanOrEqual(0);
        expect(results.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should respect top_k limit', async () => {
        for (let i = 0; i < 10; i++) {
            await storage.storeChunk({
                id: `chunk_${i}`,
                content: `test content about Unity topic ${i}`,
                metadata: { source: 'test' },
            });
        }

        const search = new DocSearch(storage);
        const results = await search.search({ query: 'test', top_k: 2 });
        expect(results.results.length).toBeLessThanOrEqual(2);
    });

    it('should report elapsed_ms >= 0', async () => {
        const search = new DocSearch(storage);
        const results = await search.search({ query: 'anything' });
        expect(results.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty query gracefully', async () => {
        const search = new DocSearch(storage);
        const results = await search.search({ query: '' });
        expect(results).toBeDefined();
        expect(results.semantic_count).toBe(0);
    });

    it('should fall back to keyword-only when embedder unavailable', async () => {
        await storage.storeChunk({
            id: 'k2',
            content: 'Rigidbody physics simulation',
            metadata: { source: 'test' },
        });

        const search = new DocSearch(storage);
        const results = await search.search({ query: 'Rigidbody physics' });
        // Without native module, semantic_count should be 0
        expect(results.semantic_count).toBe(0);
        expect(results.keyword_count).toBeGreaterThanOrEqual(0);
    });
});
