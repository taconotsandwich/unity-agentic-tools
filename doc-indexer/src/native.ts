import { createRequire } from 'module';

let _cachedEmbedder: any | null = undefined;

export function load_embedding_generator(): any | null {
    if (_cachedEmbedder !== undefined) return _cachedEmbedder;

    try {
        const nativeRequire = createRequire(import.meta.url || __filename);
        let mod: any;
        try {
            // Published package: native/ directory bundled alongside dist/
            mod = nativeRequire('../native/index.js');
        } catch {
            // Dev workspace: resolve via workspace link
            mod = nativeRequire('unity-file-tools');
        }
        _cachedEmbedder = new mod.EmbeddingGenerator();
        return _cachedEmbedder;
    } catch {
        _cachedEmbedder = null;
        return null;
    }
}
