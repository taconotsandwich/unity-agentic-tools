import { createRequire } from 'module';

let _cachedEmbedder: any | null = undefined;

export function load_embedding_generator(): any | null {
    if (_cachedEmbedder !== undefined) return _cachedEmbedder;

    try {
        const nativeRequire = createRequire(import.meta.url || __filename);
        const mod = nativeRequire('unity-agentic-tool');
        _cachedEmbedder = new mod.EmbeddingGenerator();
        return _cachedEmbedder;
    } catch {
        _cachedEmbedder = null;
        return null;
    }
}
