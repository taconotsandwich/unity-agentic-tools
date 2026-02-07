import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DocStorage } from '../../src/storage';
import type { StoredChunk } from '../../src/storage';

describe('DocStorage', () => {
    let temp_dir: string;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    /** Build a storage instance scoped to the temp dir — no process.chdir needed. */
    function makeStorage(): DocStorage {
        return new DocStorage(join(temp_dir, '.unity-docs-index.json'));
    }

    function makeChunk(id: string, content: string, embedding?: number[]): StoredChunk {
        return {
            id,
            content,
            metadata: { source: 'test' },
            embedding,
        };
    }

    it('should initialize without errors', async () => {
        const storage = makeStorage();
        await storage.init();
        // No error means success
    });

    it('should store a single chunk', async () => {
        const storage = makeStorage();
        // Use content where query words form a high proportion (Jaccard > 0.3)
        const chunk = makeChunk('c1', 'Unity game engine');

        await storage.storeChunk(chunk);

        const results = await storage.keywordSearch('Unity game engine');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].content).toContain('Unity');
    });

    it('should find stored chunk by content substring via keyword search', async () => {
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('c1', 'MonoBehaviour lifecycle methods in Unity development'));
        await storage.storeChunk(makeChunk('c2', 'Rigidbody physics simulation'));

        const results = await storage.keywordSearch('MonoBehaviour lifecycle');

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].id).toBe('c1');
    });

    it('should return empty for non-matching keyword query', async () => {
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('c1', 'Unity game engine'));

        const results = await storage.keywordSearch('nonexistent_query_xyz');

        expect(results).toEqual([]);
    });

    it('should clear all chunks', async () => {
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('c1', 'some content'));
        await storage.storeChunk(makeChunk('c2', 'more content'));

        await storage.clearOldChunks();

        const results = await storage.keywordSearch('content');
        expect(results).toEqual([]);
    });

    it('should persist to disk so a new instance can load stored chunks', async () => {
        const storagePath = join(temp_dir, '.unity-docs-index.json');
        const storage1 = new DocStorage(storagePath);
        await storage1.storeChunk(makeChunk('persist1', 'persistent Unity data for testing'));

        // Create a fresh instance pointing at the same file
        const storage2 = new DocStorage(storagePath);
        await storage2.init();

        const results = await storage2.keywordSearch('persistent Unity data');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].id).toBe('persist1');
    });

    it('should return ~1.0 cosine similarity for identical vectors via semanticSearch', async () => {
        const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('v1', 'vector content', embedding));

        const results = await storage.semanticSearch(embedding);

        expect(results.length).toBe(1);
        expect(results[0].score).toBeCloseTo(1.0, 4);
    });

    it('should return 0 cosine similarity for mismatched vector lengths', async () => {
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('v1', 'vector content', [0.1, 0.2, 0.3]));

        // Query with a different-length vector
        const results = await storage.semanticSearch([0.1, 0.2, 0.3, 0.4, 0.5]);

        // Should return empty since cosine of mismatched lengths returns 0, below 0.5 threshold
        expect(results).toEqual([]);
    });

    it('should score Jaccard similarity correctly via keyword search', async () => {
        const storage = makeStorage();
        // "hello world test" has high Jaccard overlap with "hello world" query
        await storage.storeChunk(makeChunk('j1', 'hello world test'));
        // "goodbye universe" has no overlap
        await storage.storeChunk(makeChunk('j2', 'goodbye universe something'));

        const results = await storage.keywordSearch('hello world');

        expect(results.length).toBe(1);
        expect(results[0].id).toBe('j1');
    });

    it('should limit results to 5 max', async () => {
        const storage = makeStorage();

        // Store 10 chunks that all match "unity"
        for (let i = 0; i < 10; i++) {
            await storage.storeChunk(makeChunk(`c${i}`, `unity game development content ${i}`));
        }

        const results = await storage.keywordSearch('unity game development');

        expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should sort results by score descending', async () => {
        const storage = makeStorage();
        // "unity development" has higher overlap with query "unity development"
        await storage.storeChunk(makeChunk('c1', 'unity development tools and features'));
        // "unity development" exact — more words dilute Jaccard
        await storage.storeChunk(makeChunk('c2', 'unity development'));

        const results = await storage.keywordSearch('unity development');

        expect(results.length).toBeGreaterThanOrEqual(1);
        // Results should be sorted by score descending
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
    });

    it('should return both semantic and keyword result sets from hybridSearch', async () => {
        const embedding = [0.5, 0.5, 0.5];
        const storage = makeStorage();
        await storage.storeChunk(makeChunk('h1', 'hybrid search test content', embedding));

        const results = await storage.hybridSearch(embedding, 'hybrid search test');

        expect(results).toHaveProperty('semantic');
        expect(results).toHaveProperty('keyword');
        expect(Array.isArray(results.semantic)).toBe(true);
        expect(Array.isArray(results.keyword)).toBe(true);
    });
});
