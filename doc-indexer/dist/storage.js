"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocStorage = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const STORAGE_PATH = (0, path_1.resolve)(process.cwd(), '.unity-docs-index.json');
class DocStorage {
    constructor() {
        this.chunks = new Map();
        this.loaded = false;
    }
    async init() {
        if (this.loaded)
            return;
        if ((0, fs_1.existsSync)(STORAGE_PATH)) {
            const data = (0, fs_1.readFileSync)(STORAGE_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            for (const [id, chunk] of Object.entries(parsed.chunks || {})) {
                this.chunks.set(id, chunk);
            }
            this.loaded = true;
        }
    }
    async storeChunk(chunk) {
        await this.init();
        this.chunks.set(chunk.id, chunk);
        this.save();
    }
    async storeChunks(chunks) {
        await this.init();
        for (const chunk of chunks) {
            this.chunks.set(chunk.id, chunk);
        }
        this.save();
    }
    save() {
        const data = {
            chunks: Object.fromEntries(this.chunks),
            last_updated: Date.now()
        };
        (0, fs_1.writeFileSync)(STORAGE_PATH, JSON.stringify(data, null, 2));
    }
    async semanticSearch(queryEmbedding) {
        await this.init();
        const results = [];
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
    async keywordSearch(query) {
        await this.init();
        const lowerQuery = query.toLowerCase();
        const results = [];
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
    async hybridSearch(queryEmbedding, queryText) {
        const [semantic, keyword] = await Promise.all([
            this.semanticSearch(queryEmbedding),
            this.keywordSearch(queryText)
        ]);
        return { semantic, keyword };
    }
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length)
            return 0;
        let dotProduct = 0;
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * (vec2[i] || 0);
        }
        const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
        const norm2 = Math.sqrt((vec2 || []).reduce((sum, v) => sum + (v || 0) * (v || 0), 0));
        return norm1 > 0 && norm2 > 0 ? dotProduct / (norm1 * norm2) : 0;
    }
    jaccardSimilarity(str1, str2) {
        const set1 = new Set(str1.toLowerCase().split(' '));
        const set2 = new Set(str2.toLowerCase().split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        return intersection.size / Math.max(set1.size, set2.size);
    }
    async clearOldChunks() {
        this.chunks.clear();
        this.save();
    }
}
exports.DocStorage = DocStorage;
//# sourceMappingURL=storage.js.map