import { createRequire } from 'module';
import { resolve, dirname, join } from 'path';

export interface EmbeddingGenerator {
    generate(text: string): number[] | null;
    generate_batch(texts: string[]): number[][] | null;
}

let _loaded = false;
let _cachedEmbedder: EmbeddingGenerator | null = null;

export function load_embedding_generator(): EmbeddingGenerator | null {
    if (_loaded) return _cachedEmbedder;
    _loaded = true;

    try {
        const scriptDir = process.argv[1]
            ? dirname(resolve(process.argv[1]))
            : __dirname;
        const nativeRequire = createRequire(join(scriptDir, '_'));
        let mod: Record<string, unknown>;
        try {
            // Published package: native/ directory bundled alongside dist/
            mod = nativeRequire('../native/index.js') as Record<string, unknown>;
        } catch {
            // Dev workspace: resolve via workspace link
            mod = nativeRequire('unity-file-tools') as Record<string, unknown>;
        }
        const Ctor = mod.EmbeddingGenerator as new () => EmbeddingGenerator;
        _cachedEmbedder = new Ctor();
        return _cachedEmbedder;
    } catch {
        return null;
    }
}
