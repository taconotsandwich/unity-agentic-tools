import { DocStorage } from './storage';
import type { EmbeddingVector, OpenAIEmbeddingResponse } from './types';

export interface SearchOptions {
  query: string;
  top_k?: number;
  include_code?: boolean;
  semantic_weight?: number;
  keyword_weight?: number;
}

// Removed generateEmbedding and hybridSearch for brevity
// Full RAG implementation can be added when embedding service is configured

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

  constructor(storage: DocStorage) {
    this.storage = storage;
  }

  async search(options: SearchOptions): Promise<SearchResults> {
    const startTime = Date.now();
    const topK = options.top_k || 5;
    const semanticWeight = options.semantic_weight ?? 0.6;
    const keywordWeight = options.keyword_weight ?? 0.4;

    let queryEmbedding: EmbeddingVector | null = null;

    if (options.query.length > 0) {
      queryEmbedding = await this.generateEmbedding(options.query);
    }

    const semanticResults = await this.storage.semanticSearch(queryEmbedding || []);
    const keywordResults = await this.storage.keywordSearch(options.query);

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
      semantic_count: Math.floor(topK * semanticWeight * 2),
      keyword_count: Math.floor(topK * keywordWeight * 2),
      elapsed_ms: Date.now() - startTime
    };
  }

  async generateEmbedding(text: string): Promise<EmbeddingVector> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as OpenAIEmbeddingResponse;
    return data.data[0].embedding;
  }
}
