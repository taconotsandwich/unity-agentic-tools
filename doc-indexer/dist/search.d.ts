import { DocStorage } from './storage';
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
        metadata: any;
    }>;
    semantic_count: number;
    keyword_count: number;
    elapsed_ms: number;
}
export declare class DocSearch {
    private storage;
    constructor(storage: DocStorage);
    search(options: SearchOptions): Promise<SearchResults>;
    generateEmbedding(text: string): Promise<number[]>;
}
//# sourceMappingURL=search.d.ts.map