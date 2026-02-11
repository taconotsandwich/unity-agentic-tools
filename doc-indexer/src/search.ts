import { DocStorage } from './storage';
import { load_embedding_generator } from './native';
import type { EmbeddingVector } from './types';

export interface SearchOptions {
  query: string;
  top_k?: number;
  include_code?: boolean;
  semantic_weight?: number;
  keyword_weight?: number;
}

export interface SearchResults {
  results: Array<{
    id: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  semantic_count: number;
  keyword_count: number;
  elapsed_ms: number;
}

export class DocSearch {
    private storage: DocStorage;
    private _embedder: any | null | undefined = undefined;

    constructor(storage: DocStorage) {
        this.storage = storage;
    }

    /** Lazy-load the embedding model on first use (avoids blocking constructor). */
    private get embedder(): any | null {
        if (this._embedder === undefined) {
            this._embedder = load_embedding_generator();
        }
        return this._embedder;
    }

    async search(options: SearchOptions): Promise<SearchResults> {
        const startTime = Date.now();
        const topK = options.top_k || 5;
        const semanticWeight = options.semantic_weight ?? 0.6;
        const keywordWeight = options.keyword_weight ?? 0.4;

        let queryEmbedding: EmbeddingVector | null = null;

        if (this.embedder && options.query.length > 0) {
            try {
                queryEmbedding = this.embedder.generate(options.query);
            } catch {
                // Embedding failed — fall back to keyword-only
            }
        }

        const keywordResults = await this.storage.keywordSearch(options.query);

        if (queryEmbedding) {
            const semanticResults = await this.storage.semanticSearch(queryEmbedding);
            const combined = new Map<string, number>();

            for (const result of semanticResults) {
                combined.set(result.id, (combined.get(result.id) || 0) + result.score * semanticWeight);
            }

            for (const result of keywordResults) {
                combined.set(result.id, (combined.get(result.id) || 0) + result.score * keywordWeight);
            }

            const sorted = Array.from(combined.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, topK)
                .map(([id, score]) => {
                    const found = [...semanticResults, ...keywordResults].find(r => r.id === id);
                    return found || { id, content: '', score, metadata: {} };
                });

            return {
                results: sorted,
                semantic_count: semanticResults.length,
                keyword_count: keywordResults.length,
                elapsed_ms: Date.now() - startTime
            };
        }

        // Keyword-only fallback (no embedder or empty query)
        const sorted = keywordResults
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return {
            results: sorted,
            semantic_count: 0,
            keyword_count: keywordResults.length,
            elapsed_ms: Date.now() - startTime
        };
    }
}
