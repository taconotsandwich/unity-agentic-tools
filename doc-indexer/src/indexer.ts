import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { estimateTokens } from './tokenizer';

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

let chunkId = 0;

function generateId(): string {
  return `chunk_${Date.now()}_${chunkId++}`;
}

export function indexMarkdownFile(filePath: string): IndexResult {
  const startTime = Date.now();
  const content = readFileSync(filePath, 'utf-8');

  const chunks: Chunk[] = [];

  chunks.push(...extractCodeBlocks(content, filePath));
  chunks.push(...chunkProse(content.replace(/```[\s\S]+?```/g, ''), filePath));

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime
  };
}

export async function indexDocsDirectory(
  dirPath: string,
  extensions: string[] = ['.md', '.txt']
): Promise<IndexResult> {
  const startTime = Date.now();
  const files = readdirSync(dirPath);
  const allChunks: Chunk[] = [];

  let filesProcessed = 0;

  for (const file of files) {
    const ext = file.substring(file.lastIndexOf('.'));
    if (!extensions.includes(ext)) continue;

    const fullPath = resolve(dirPath, file);
    const stat = statSync(fullPath);

    if (!stat.isFile()) continue;

    const content = readFileSync(fullPath, 'utf-8');

    allChunks.push(...extractCodeBlocks(content));
    allChunks.push(...chunkProse(content.replace(/```[\s\S]+?```/g, ''), fullPath));

    filesProcessed++;
  }

  const totalTokens = allChunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: allChunks.length,
    total_tokens: totalTokens,
    files_processed: filesProcessed,
    elapsed_ms: Date.now() - startTime
  };
}

export function indexScriptableObject(filePath: string): IndexResult {
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

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime
  };
}

export async function indexUnityPackage(packageName: string): Promise<IndexResult> {
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

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return {
    chunks_indexed: chunks.length,
    total_tokens: totalTokens,
    files_processed: 1,
    elapsed_ms: Date.now() - startTime
  };
}
