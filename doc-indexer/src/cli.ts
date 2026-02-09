#!/usr/bin/env bun

import { Command } from 'commander';
import { indexMarkdownFile, indexDocsDirectory, indexScriptableObject, indexHtmlFile, indexSource, checkSourceChanged } from './indexer';
import { DocStorage } from './storage';
import { DocSearch } from './search';
import { find_project_root, resolve_storage_path } from './project-root';
import { discover_sources, read_unity_version, resolve_editor_docs_path } from './sources';

const program = new Command();

program
    .name('unity-doc-indexer')
    .description('Fast Unity documentation indexer with local embeddings')
    .version('1.0.0')
    .option('--project-root <path>', 'Unity project root (auto-detected if omitted)')
    .option('--storage-path <path>', 'Index storage file path (auto-resolved if omitted)');

/** Resolve storage path from CLI options. */
function get_storage_path(opts: { projectRoot?: string; storagePath?: string }): string {
    if (opts.storagePath) return opts.storagePath;
    const root = opts.projectRoot || find_project_root() || undefined;
    return resolve_storage_path(root);
}

/** Auto-discover sources and re-index any that changed. Returns count of sources re-indexed. */
async function auto_index(storage: DocStorage, projectRoot: string | null): Promise<number> {
    if (!projectRoot) return 0;

    const sources = discover_sources(projectRoot);
    let reindexed = 0;

    for (const source of sources) {
        const changed = await checkSourceChanged(source, storage);
        if (changed) {
            process.stderr.write(`Indexing ${source.id}...\n`);
            const result = await indexSource(source, storage);
            process.stderr.write(`  ${result.files_processed} files, ${result.chunks_indexed} chunks\n`);
            reindexed++;
        }
    }

    return reindexed;
}

program
    .command('search <query>')
    .description('Search documentation (auto-discovers and indexes on first use)')
    .option('-s, --summarize', 'Summarize results (truncate content)')
    .option('-c, --compress', 'Compress results (minimal output)')
    .option('-j, --json', 'Output as JSON')
    .action(async (query, options) => {
        const globalOpts = program.opts();
        const storagePath = get_storage_path(globalOpts);
        const projectRoot = globalOpts.projectRoot || find_project_root() || null;

        const storage = new DocStorage(storagePath);
        await storage.init();

        // Auto-index if project root found
        await auto_index(storage, projectRoot);

        const searcher = new DocSearch(storage);

        const results = await searcher.search({
            query,
            top_k: 5,
            semantic_weight: 0.6,
            keyword_weight: 0.4
        });

        if (options.json) {
            const output = options.summarize
                ? { ...results, results: results.results.map(r => ({ ...r, content: r.content.slice(0, 200) })) }
                : options.compress
                    ? { ...results, results: results.results.map(({ content, ...r }) => r) }
                    : results;
            console.log(JSON.stringify(output, null, 2));
            return;
        }

        if (options.compress) {
            for (const result of results.results) {
                const title = result.metadata?.section || result.metadata?.unity_class || result.metadata?.file_path;
                console.log(`${title} (${result.score.toFixed(4)})`);
            }
            return;
        }

        console.log(`Found ${results.results.length} results in ${results.elapsed_ms}ms`);
        console.log(`Semantic: ${results.semantic_count}, Keyword: ${results.keyword_count}`);

        for (let i = 0; i < results.results.length; i++) {
            const result = results.results[i];
            const title = result.metadata?.section || result.metadata?.unity_class || result.metadata?.file_path;
            const content = options.summarize ? result.content.slice(0, 200) + '...' : result.content;
            console.log(`\n[${i + 1}] ${title}`);
            console.log(content);
            console.log(`Score: ${result.score.toFixed(4)}`);
        }
    });

program
    .command('index [path]')
    .description('Index documentation (auto-discovers sources if no path given)')
    .action(async (path) => {
        const globalOpts = program.opts();
        const storagePath = get_storage_path(globalOpts);
        const storage = new DocStorage(storagePath);
        await storage.init();

        // If no path given, auto-discover and index all sources
        if (!path) {
            const projectRoot = globalOpts.projectRoot || find_project_root() || null;
            if (!projectRoot) {
                console.error('No Unity project found. Provide a path or run from within a Unity project.');
                process.exit(1);
            }

            const sources = discover_sources(projectRoot);
            if (sources.length === 0) {
                const version = read_unity_version(projectRoot);
                const lines = ['No documentation sources found.', ''];
                lines.push('Checked:');
                lines.push('  - Packages/*/Documentation~/ (package docs convention)');
                if (version) {
                    const editorPath = resolve_editor_docs_path(version);
                    lines.push(`  - ${editorPath || `Unity Hub Editor/${version}/Documentation/en (not found)`}`);
                    lines.push(`  - Unity Hub Editor/*/ (glob fallback, no docs installed)`);
                } else {
                    lines.push('  - ProjectSettings/ProjectVersion.txt not found (cannot resolve editor version)');
                    lines.push('  - Unity Hub Editor/*/ (glob fallback, no docs installed)');
                }
                lines.push('');
                lines.push('To fix:');
                lines.push('  1. Install documentation via Unity Hub > Installs > Modules > Documentation');
                lines.push('  2. Place docs in a package Documentation~/ folder');
                lines.push('  3. Or run: index-docs <path-to-docs-directory>');
                console.log(lines.join('\n'));
                return;
            }

            let totalChunks = 0;
            let totalFiles = 0;

            for (const source of sources) {
                console.log(`Indexing ${source.id} (${source.path})...`);
                const result = await indexSource(source, storage);
                console.log(`  ${result.files_processed} files, ${result.chunks_indexed} chunks`);
                totalChunks += result.chunks_indexed;
                totalFiles += result.files_processed;
            }

            console.log(`\nTotal: ${sources.length} sources, ${totalFiles} files, ${totalChunks} chunks`);
            return;
        }

        // Manual path indexing (existing behavior)
        const stat = require('fs').statSync(path);
        if (stat.isDirectory()) {
            const result = await indexDocsDirectory(path, ['.md', '.txt', '.html'], storage);
            console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
            if (result.embeddings_generated > 0) {
                console.log(`Generated ${result.embeddings_generated} embeddings`);
            }
            console.log(`Processed ${result.files_processed} files in ${result.elapsed_ms}ms`);
        } else if (path.endsWith('.md')) {
            const result = indexMarkdownFile(path, storage);
            console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
            console.log(`Processed in ${result.elapsed_ms}ms`);
        } else if (path.endsWith('.html') || path.endsWith('.htm')) {
            const result = indexHtmlFile(path, storage);
            console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
            console.log(`Processed in ${result.elapsed_ms}ms`);
        } else if (path.endsWith('.asset')) {
            const result = indexScriptableObject(path, storage);
            console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
            console.log(`Processed in ${result.elapsed_ms}ms`);
        } else {
            console.error('Unsupported file type. Use: .md, .html, .asset, or directory');
            process.exit(1);
        }
    });

program
    .command('clear')
    .description('Clear all indexed documentation')
    .action(async () => {
        const globalOpts = program.opts();
        const storagePath = get_storage_path(globalOpts);
        const storage = new DocStorage(storagePath);
        await storage.clearOldChunks();
        console.log('Cleared old chunks');
    });

program.parse();
