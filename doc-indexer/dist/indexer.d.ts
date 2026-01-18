export interface Chunk {
    id: string;
    content: string;
    tokens: number;
    type: 'prose' | 'code' | 'api' | 'example';
    metadata: {
        file_path: string;
        section?: string;
        language?: string;
        unity_class?: string;
        unity_method?: string;
    };
}
export interface IndexResult {
    chunks_indexed: number;
    total_tokens: number;
    files_processed: number;
    elapsed_ms: number;
}
export declare function indexMarkdownFile(filePath: string): IndexResult;
export declare function indexDocsDirectory(dirPath: string, extensions?: string[]): Promise<IndexResult>;
export declare function indexScriptableObject(filePath: string): IndexResult;
export declare function indexUnityPackage(packageName: string): Promise<IndexResult>;
//# sourceMappingURL=indexer.d.ts.map