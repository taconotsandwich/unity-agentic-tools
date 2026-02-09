import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { EmbeddingVector } from './types';

export interface StoredChunk {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    embedding?: EmbeddingVector;
}

export interface SearchResult {
    id: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
}

export interface FileManifestEntry {
    mtime: number;
    chunk_ids: string[];
}

export interface SourceManifest {
    path: string;
    files: Record<string, FileManifestEntry>;
    last_indexed: number;
}

export class DocStorage {
    private chunks: Map<string, StoredChunk> = new Map();
    private sources: Map<string, SourceManifest> = new Map();
    private loaded: boolean = false;
    private storagePath: string;

    constructor(storagePath?: string) {
        this.storagePath = storagePath ?? resolve(process.cwd(), '.unity-docs-index.json');
    }

    async init(): Promise<void> {
        if (this.loaded) return;

        if (existsSync(this.storagePath)) {
            const data = readFileSync(this.storagePath, 'utf-8');
            const parsed = JSON.parse(data);
            for (const [id, chunk] of Object.entries(parsed.chunks || {})) {
                this.chunks.set(id, chunk as StoredChunk);
            }
            for (const [id, source] of Object.entries(parsed.sources || {})) {
                this.sources.set(id, source as SourceManifest);
            }
            this.loaded = true;
        }
    }

    async storeChunk(chunk: StoredChunk): Promise<void> {
        await this.init();
        this.chunks.set(chunk.id, chunk);
        this.save();
    }

    async storeChunks(chunks: StoredChunk[]): Promise<void> {
        await this.init();
        for (const chunk of chunks) {
            this.chunks.set(chunk.id, chunk);
        }
        this.save();
    }

    /** Store a source manifest (file mtimes + chunk IDs per file). */
    async storeSourceManifest(sourceId: string, manifest: SourceManifest): Promise<void> {
        await this.init();
        this.sources.set(sourceId, manifest);
        this.save();
    }

    /** Retrieve a stored source manifest for comparison. */
    async getSourceManifest(sourceId: string): Promise<SourceManifest | null> {
        await this.init();
        return this.sources.get(sourceId) ?? null;
    }

    /** Delete all chunks belonging to a source, and remove its manifest. */
    async removeChunksBySource(sourceId: string): Promise<number> {
        await this.init();
        const manifest = this.sources.get(sourceId);
        if (!manifest) return 0;

        let removed = 0;
        for (const fileEntry of Object.values(manifest.files)) {
            for (const chunkId of fileEntry.chunk_ids) {
                if (this.chunks.delete(chunkId)) removed++;
            }
        }

        this.sources.delete(sourceId);
        this.save();
        return removed;
    }

    /** Get all known source IDs. */
    async getSourceIds(): Promise<string[]> {
        await this.init();
        return Array.from(this.sources.keys());
    }

    private save(): void {
        // Auto-create parent directory if needed
        const dir = dirname(this.storagePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        const data = {
            sources: Object.fromEntries(this.sources),
            chunks: Object.fromEntries(this.chunks),
            last_updated: Date.now()
        };
        writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    }

    async semanticSearch(queryEmbedding: EmbeddingVector): Promise<SearchResult[]> {
        await this.init();

        const results: SearchResult[] = [];

        for (const [id, chunk] of this.chunks) {
            const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding || []);

            if (similarity > 0.5) {
                results.push({
                    id,
                    content: chunk.content,
                    score: similarity,
                    metadata: chunk.metadata
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 5);
    }

    async keywordSearch(query: string): Promise<SearchResult[]> {
        await this.init();

        const lowerQuery = query.toLowerCase();
        const results: SearchResult[] = [];

        for (const [id, chunk] of this.chunks) {
            const lowerContent = chunk.content.toLowerCase();

            if (lowerContent.includes(lowerQuery)) {
                const score = this.jaccardSimilarity(query, lowerContent);

                if (score > 0.3) {
                    results.push({
                        id,
                        content: chunk.content,
                        score,
                        metadata: chunk.metadata
                    });
                }
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 5);
    }

    async hybridSearch(
        queryEmbedding: EmbeddingVector,
        queryText: string
    ): Promise<{ semantic: SearchResult[]; keyword: SearchResult[] }> {
        const [semantic, keyword] = await Promise.all([
            this.semanticSearch(queryEmbedding),
            this.keywordSearch(queryText)
        ]);

        return { semantic, keyword };
    }

    private cosineSimilarity(vec1: EmbeddingVector, vec2: EmbeddingVector): number {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

        let dotProduct = 0;
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * (vec2[i] || 0);
        }

        const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
        const norm2 = Math.sqrt((vec2 || []).reduce((sum, v) => sum + (v || 0) * (v || 0), 0));

        return norm1 > 0 && norm2 > 0 ? dotProduct / (norm1 * norm2) : 0;
    }

    private jaccardSimilarity(str1: string, str2: string): number {
        const set1 = new Set(str1.toLowerCase().split(' '));
        const set2 = new Set(str2.toLowerCase().split(' '));

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        return intersection.size / Math.max(set1.size, set2.size);
    }

    async clearOldChunks(): Promise<void> {
        this.chunks.clear();
        this.sources.clear();
        this.save();
    }
}
