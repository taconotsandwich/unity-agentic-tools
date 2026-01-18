export interface StoredChunk {
    id: string;
    content: string;
    metadata: any;
    embedding?: number[];
}
export interface SearchResult {
    id: string;
    content: string;
    score: number;
    metadata: any;
}
export declare class DocStorage {
    private chunks;
    private loaded;
    init(): Promise<void>;
    storeChunk(chunk: StoredChunk): Promise<void>;
    storeChunks(chunks: StoredChunk[]): Promise<void>;
    private save;
    semanticSearch(queryEmbedding: number[]): Promise<SearchResult[]>;
    keywordSearch(query: string): Promise<SearchResult[]>;
    hybridSearch(queryEmbedding: number[], queryText: string): Promise<{
        semantic: SearchResult[];
        keyword: SearchResult[];
    }>;
    private cosineSimilarity;
    private jaccardSimilarity;
    clearOldChunks(): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map