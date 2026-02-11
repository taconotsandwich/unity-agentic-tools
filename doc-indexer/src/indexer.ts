import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';
import { estimateTokens } from './tokenizer';
import { load_embedding_generator } from './native';
import type { DocStorage, StoredChunk, SourceManifest, FileManifestEntry } from './storage';
import type { DocSource } from './sources';

/** Maximum tokens per chunk before splitting */
const MAX_CHUNK_TOKENS = 1024;

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
  embeddings_generated: number;
}

function extractCodeBlocks(content: string, filePath: string = ''): Chunk[] {
  const codeBlockPattern = /```(?:csharp|javascript|typescript|cs)\n([\s\S]+?)```/gs;
  const codeBlocks = Array.from(content.matchAll(codeBlockPattern));
  const chunks: Chunk[] = [];

  for (const block of codeBlocks) {
    const language = block.includes('csharp') || block.includes('cs') ? 'csharp' : 'javascript';
    const codeContent = block[1];
    const matchIndex = (block as any).index || 0;

    chunks.push({
      id: generateId(),
      content: codeContent,
      tokens: estimateTokens(codeContent),
      type: 'code',
      metadata: {
        file_path: filePath,
        language,
        section: extractSectionTitle(content, matchIndex)
      }
    });
  }

  return chunks;
}

function extractSectionTitle(content: string, position: number): string | undefined {
  const beforePosition = content.substring(0, position);
  const headingMatch = beforePosition.match(/#{2,3}\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return undefined;
}

function parseAPIReference(content: string, filePath: string): Chunk[] {
  const chunks: Chunk[] = [];

  const methodPattern = /\[method]\(([^)]+)\)/g;
  const propertyPattern = /\[property]\(([^)]+)\)/g;
  const classPattern = /\[class]\(([^)]+)\)/g;

  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    chunks.push({
      id: generateId(),
      content: match[1],
      tokens: estimateTokens(match[1]),
      type: 'api',
      metadata: {
        file_path: filePath,
        unity_method: match[1]
      }
    });
  }

  while ((match = propertyPattern.exec(content)) !== null) {
    chunks.push({
      id: generateId(),
      content: match[1],
      tokens: estimateTokens(match[1]),
      type: 'api',
      metadata: {
        file_path: filePath,
        unity_class: extractClassFromAPI(match[1])
      }
    });
  }

  while ((match = classPattern.exec(content)) !== null) {
    chunks.push({
      id: generateId(),
      content: match[1],
      tokens: estimateTokens(match[1]),
      type: 'api',
      metadata: {
        file_path: filePath,
        unity_class: match[1]
      }
    });
  }

  return chunks;
}

function extractClassFromAPI(methodName: string): string | undefined {
  const classMatch = methodName.match(/(\w+)\.\w+/);
  return classMatch ? classMatch[1] : undefined;
}

function chunkProse(content: string, filePath: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sectionPattern = /#{2,3}\s+/g;
  const sections: { text: string; index: number }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sectionPattern.exec(content)) !== null) {
    if (lastIndex > 0) {
      sections.push({
        text: content.substring(lastIndex, match.index),
        index: lastIndex
      });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    sections.push({
      text: content.substring(lastIndex),
      index: lastIndex
    });
  }

  for (const section of sections) {
    const tokens = estimateTokens(section.text);

    if (tokens <= MAX_CHUNK_TOKENS) {
      chunks.push({
        id: generateId(),
        content: section.text.trim(),
        tokens,
        type: 'prose',
        metadata: {
          file_path: filePath,
          section: extractSectionTitle(content, section.index)
        }
      });
    } else {
      const sentences = section.text.split(/(?<=[.!?])\s+/);
      let currentChunk = '';
      let currentTokens = 0;

      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);

        if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS) {
          if (currentChunk.trim()) {
            chunks.push({
              id: generateId(),
              content: currentChunk.trim(),
              tokens: currentTokens,
              type: 'prose',
              metadata: {
                file_path: filePath
              }
            });
          }
          currentChunk = sentence;
          currentTokens = sentenceTokens;
        } else {
          currentChunk += sentence;
          currentTokens += sentenceTokens;
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          id: generateId(),
          content: currentChunk.trim(),
          tokens: currentTokens,
          type: 'prose',
          metadata: {
            file_path: filePath
          }
        });
      }
    }
  }

  return chunks;
}

/** Strip HTML tags, scripts, styles, and decode common entities */
export function stripHtml(html: string): string {
  let text = html;
  // Remove script and style blocks entirely (replace with space to avoid merging adjacent text)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** Recursively walk a directory and return all file paths */
function walkDirectory(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkDirectory(fullPath));
    } else if (stat.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

let chunkId = 0;

function generateId(): string {
  return `chunk_${Date.now()}_${chunkId++}`;
}

async function store_chunks(chunks: Chunk[], storage?: DocStorage): Promise<number> {
    if (!storage || chunks.length === 0) return 0;

    const embedder = load_embedding_generator();
    let embeddings: number[][] | null = null;

    if (embedder) {
        try {
            const texts = chunks.map(c => c.content);
            embeddings = embedder.generate_batch(texts);
        } catch {
            // Embedding generation failed — store without embeddings
        }
    }

    const storedChunks: StoredChunk[] = chunks.map((chunk, i) => ({
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata as Record<string, unknown>,
        embedding: embeddings?.[i] ?? undefined,
    }));

    await storage.storeChunks(storedChunks);
    return embeddings?.length ?? 0;
}

export function indexMarkdownFile(filePath: string, storage?: DocStorage): IndexResult {
  const startTime = Date.now();
  const content = readFileSync(filePath, 'utf-8');

  const chunks: Chunk[] = [];

  chunks.push(...extractCodeBlocks(content, filePath));
  chunks.push(...chunkProse(content.replace(/```[\s\S]+?```/g, ''), filePath));

  let embeddingsGenerated = 0;
  if (storage) {
    // store_chunks is async but we return sync — caller should use indexDocsDirectory for async
    store_chunks(chunks, storage).then(n => { embeddingsGenerated = n; });
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime,
    embeddings_generated: embeddingsGenerated
  };
}

export function indexHtmlFile(filePath: string, storage?: DocStorage): IndexResult {
  const startTime = Date.now();
  const html = readFileSync(filePath, 'utf-8');
  const text = stripHtml(html);

  const chunks = chunkProse(text, filePath);

  let embeddingsGenerated = 0;
  if (storage) {
    store_chunks(chunks, storage).then(n => { embeddingsGenerated = n; });
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime,
    embeddings_generated: embeddingsGenerated
  };
}

export async function indexDocsDirectory(
  dirPath: string,
  extensions: string[] = ['.md', '.txt', '.html'],
  storage?: DocStorage
): Promise<IndexResult> {
  const startTime = Date.now();
  const files = walkDirectory(dirPath);
  const allChunks: Chunk[] = [];

  let filesProcessed = 0;

  for (const fullPath of files) {
    const ext = fullPath.substring(fullPath.lastIndexOf('.'));
    if (!extensions.includes(ext)) continue;

    const content = readFileSync(fullPath, 'utf-8');

    if (ext === '.html') {
      const text = stripHtml(content);
      allChunks.push(...chunkProse(text, fullPath));
    } else {
      allChunks.push(...extractCodeBlocks(content));
      allChunks.push(...chunkProse(content.replace(/```[\s\S]+?```/g, ''), fullPath));
    }

    filesProcessed++;
  }

  const embeddingsGenerated = await store_chunks(allChunks, storage);
  const totalTokens = allChunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: allChunks.length,
    total_tokens: totalTokens,
    files_processed: filesProcessed,
    elapsed_ms: Date.now() - startTime,
    embeddings_generated: embeddingsGenerated
  };
}

export function indexScriptableObject(filePath: string, storage?: DocStorage): IndexResult {
  const startTime = Date.now();
  const content = readFileSync(filePath, 'utf-8');

  const chunks: Chunk[] = [];

  const classPattern = /--- !u!114 &(\d+)\s*ScriptableObject:\s*.*?m_Name:\s*([^\n]+)/gs;
  const classMatch = content.match(classPattern);

  if (classMatch) {
    const className = classMatch[1];

    const properties = content.matchAll(/\s*m_(\w+):\s*(.+)$/gm);

    for (const prop of properties) {
      chunks.push({
        id: generateId(),
        content: `${className}.${prop[1]}: ${prop[2].trim()}`,
        tokens: estimateTokens(prop[2]),
        type: 'api',
        metadata: {
          file_path: filePath,
          unity_class: className,
          unity_method: prop[1]
        }
      });
    }
  } else {
    chunks.push(...chunkProse(content, filePath));
  }

  let embeddingsGenerated = 0;
  if (storage) {
    store_chunks(chunks, storage).then(n => { embeddingsGenerated = n; });
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime,
    embeddings_generated: embeddingsGenerated
  };
}

export async function indexUnityPackage(packageName: string, storage?: DocStorage): Promise<IndexResult> {
  const startTime = Date.now();
  const chunks: Chunk[] = [];

  const response = await fetch(`https://packages.unity.com/v1/packages/${packageName}`);

  if (!response.ok) {
    console.error(`Failed to fetch package: ${response.statusText}`);
    throw new Error(`Failed to fetch package: ${response.statusText}`);
  }

  const pkg: any = await response.json();

  if (pkg.readme) {
    chunks.push(...chunkProse(pkg.readme, `registry:${packageName}`));
  }

  if (pkg.documentationUrl) {
    const docsResponse = await fetch(pkg.documentationUrl);
    const docsContent = await docsResponse.text();

    chunks.push(...extractCodeBlocks(docsContent, `registry:${packageName}`));
    chunks.push(...parseAPIReference(docsContent, `registry:${packageName}`));
    chunks.push(...chunkProse(docsContent, `registry:${packageName}`));
  }

  const embeddingsGenerated = await store_chunks(chunks, storage);
  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime,
    embeddings_generated: embeddingsGenerated
  };
}

// --- Source-aware indexing ---

interface FileSnapshot {
    relativePath: string;
    fullPath: string;
    mtime: number;
}

/** Scan a source directory and collect file mtimes for .md and .html files. */
function scan_source_files(sourcePath: string): FileSnapshot[] {
    const files = walkDirectory(sourcePath);
    const snapshots: FileSnapshot[] = [];

    for (const fullPath of files) {
        const ext = fullPath.substring(fullPath.lastIndexOf('.'));
        if (ext !== '.md' && ext !== '.html' && ext !== '.txt') continue;

        try {
            const stat = statSync(fullPath);
            snapshots.push({
                relativePath: relative(sourcePath, fullPath),
                fullPath,
                mtime: stat.mtimeMs,
            });
        } catch {
            // Skip files we can't stat
        }
    }

    return snapshots;
}

/** Check if a source has changed by comparing current file mtimes against stored manifest. */
export async function checkSourceChanged(source: DocSource, storage: DocStorage): Promise<boolean> {
    const manifest = await storage.getSourceManifest(source.id);
    if (!manifest) return true; // Never indexed

    const currentFiles = scan_source_files(source.path);
    const storedFiles = manifest.files;

    // Check for new or modified files
    for (const file of currentFiles) {
        const stored = storedFiles[file.relativePath];
        if (!stored) return true; // New file
        if (file.mtime > stored.mtime) return true; // Modified
    }

    // Check for deleted files
    const currentPaths = new Set(currentFiles.map(f => f.relativePath));
    for (const storedPath of Object.keys(storedFiles)) {
        if (!currentPaths.has(storedPath)) return true; // Deleted
    }

    return false;
}

/** Index a single source: chunk all files, store chunks, build manifest. */
export async function indexSource(source: DocSource, storage: DocStorage): Promise<IndexResult> {
    const startTime = Date.now();

    // Remove old chunks for this source
    await storage.removeChunksBySource(source.id);

    const currentFiles = scan_source_files(source.path);
    const manifestFiles: Record<string, FileManifestEntry> = {};
    const allChunks: Chunk[] = [];
    let filesProcessed = 0;

    for (const file of currentFiles) {
        const content = readFileSync(file.fullPath, 'utf-8');
        const ext = file.fullPath.substring(file.fullPath.lastIndexOf('.'));
        const fileChunks: Chunk[] = [];

        if (ext === '.html') {
            const text = stripHtml(content);
            fileChunks.push(...chunkProse(text, file.fullPath));
        } else {
            fileChunks.push(...extractCodeBlocks(content, file.fullPath));
            fileChunks.push(...chunkProse(content.replace(/```[\s\S]+?```/g, ''), file.fullPath));
        }

        manifestFiles[file.relativePath] = {
            mtime: file.mtime,
            chunk_ids: fileChunks.map(c => c.id),
        };

        allChunks.push(...fileChunks);
        filesProcessed++;
    }

    const embeddingsGenerated = await store_chunks(allChunks, storage);

    // Store the manifest
    const manifest: SourceManifest = {
        path: source.path,
        files: manifestFiles,
        last_indexed: Date.now(),
    };
    await storage.storeSourceManifest(source.id, manifest);

    const totalTokens = allChunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

    return {
        chunks_indexed: allChunks.length,
        total_tokens: totalTokens,
        files_processed: filesProcessed,
        elapsed_ms: Date.now() - startTime,
        embeddings_generated: embeddingsGenerated,
    };
}
