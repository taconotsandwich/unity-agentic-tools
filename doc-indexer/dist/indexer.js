"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexMarkdownFile = indexMarkdownFile;
exports.indexDocsDirectory = indexDocsDirectory;
exports.indexScriptableObject = indexScriptableObject;
exports.indexUnityPackage = indexUnityPackage;
const fs_1 = require("fs");
const path_1 = require("path");
const tokenizer_1 = require("./tokenizer");
function extractCodeBlocks(content, filePath = '') {
    const codeBlockPattern = /```(?:csharp|javascript|typescript|cs)\n([\s\S]+?)```/gs;
    const codeBlocks = Array.from(content.matchAll(codeBlockPattern));
    const chunks = [];
    for (const block of codeBlocks) {
        const language = block.includes('csharp') || block.includes('cs') ? 'csharp' : 'javascript';
        const codeContent = block[1];
        const matchIndex = block.index || 0;
        chunks.push({
            id: generateId(),
            content: codeContent,
            tokens: (0, tokenizer_1.estimateTokens)(codeContent),
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
function extractSectionTitle(content, position) {
    const beforePosition = content.substring(0, position);
    const headingMatch = beforePosition.match(/#{2,3}\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    return undefined;
}
function parseAPIReference(content, filePath) {
    const chunks = [];
    const methodPattern = /\[method]\(([^)]+)\)/g;
    const propertyPattern = /\[property]\(([^)]+)\)/g;
    const classPattern = /\[class]\(([^)]+)\)/g;
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
        chunks.push({
            id: generateId(),
            content: match[1],
            tokens: (0, tokenizer_1.estimateTokens)(match[1]),
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
            tokens: (0, tokenizer_1.estimateTokens)(match[1]),
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
            tokens: (0, tokenizer_1.estimateTokens)(match[1]),
            type: 'api',
            metadata: {
                file_path: filePath,
                unity_class: match[1]
            }
        });
    }
    return chunks;
}
function extractClassFromAPI(methodName) {
    const classMatch = methodName.match(/(\w+)\.\w+/);
    return classMatch ? classMatch[1] : undefined;
}
function chunkProse(content, filePath) {
    const chunks = [];
    const sectionPattern = /#{2,3}\s+/g;
    const sections = [];
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
        const tokens = (0, tokenizer_1.estimateTokens)(section.text);
        if (tokens <= 1024) {
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
        }
        else {
            const sentences = section.text.split(/(?<=[.!?])\s+/);
            let currentChunk = '';
            let currentTokens = 0;
            for (const sentence of sentences) {
                const sentenceTokens = (0, tokenizer_1.estimateTokens)(sentence);
                if (currentTokens + sentenceTokens > 1024) {
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
                }
                else {
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
function generateId() {
    return `chunk_${Date.now()}_${chunkId++}`;
}
function indexMarkdownFile(filePath) {
    const startTime = Date.now();
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const chunks = [];
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
async function indexDocsDirectory(dirPath, extensions = ['.md', '.txt']) {
    const startTime = Date.now();
    const files = (0, fs_1.readdirSync)(dirPath);
    const allChunks = [];
    let filesProcessed = 0;
    for (const file of files) {
        const ext = file.substring(file.lastIndexOf('.'));
        if (!extensions.includes(ext))
            continue;
        const fullPath = (0, path_1.resolve)(dirPath, file);
        const stat = (0, fs_1.statSync)(fullPath);
        if (!stat.isFile())
            continue;
        const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
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
function indexScriptableObject(filePath) {
    const startTime = Date.now();
    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const chunks = [];
    const classPattern = /--- !u!114 &(\d+)\s*ScriptableObject:\s*.*?m_Name:\s*([^\n]+)/gs;
    const classMatch = content.match(classPattern);
    if (classMatch) {
        const className = classMatch[1];
        const properties = content.matchAll(/\s*m_(\w+):\s*(.+)$/gm);
        for (const prop of properties) {
            chunks.push({
                id: generateId(),
                content: `${className}.${prop[1]}: ${prop[2].trim()}`,
                tokens: (0, tokenizer_1.estimateTokens)(prop[2]),
                type: 'api',
                metadata: {
                    file_path: filePath,
                    unity_class: className,
                    unity_method: prop[1]
                }
            });
        }
    }
    else {
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
async function indexUnityPackage(packageName) {
    const startTime = Date.now();
    const chunks = [];
    const response = await fetch(`https://packages.unity.com/v1/packages/${packageName}`);
    if (!response.ok) {
        console.error(`Failed to fetch package: ${response.statusText}`);
        throw new Error(`Failed to fetch package: ${response.statusText}`);
    }
    const pkg = await response.json();
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
//# sourceMappingURL=indexer.js.map