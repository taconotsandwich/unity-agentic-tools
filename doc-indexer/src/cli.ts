#!/usr/bin/env bun

import { Command } from 'commander';
import { indexMarkdownFile, indexDocsDirectory, indexScriptableObject } from './indexer';
import { DocStorage } from './storage';
import { DocSearch } from './search';

const program = new Command();

program
  .name('unity-doc-indexer')
  .description('Fast Unity documentation indexer with local embeddings')
  .version('1.0.0');

program
  .command('index <path>')
  .description('Index documentation')
  .action(async (path) => {
    console.log(`Indexing: ${path}`);
    const storage = new DocStorage();

    const stat = require('fs').statSync(path);
    if (stat.isDirectory()) {
      const result = await indexDocsDirectory(path, ['.md', '.txt'], storage);
      console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
      if (result.embeddings_generated > 0) {
        console.log(`Generated ${result.embeddings_generated} embeddings`);
      }
      console.log(`Processed ${result.files_processed} files in ${result.elapsed_ms}ms`);
    } else if (path.endsWith('.md')) {
      const result = indexMarkdownFile(path, storage);
      console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
      console.log(`Processed in ${result.elapsed_ms}ms`);
    } else if (path.endsWith('.asset')) {
      const result = indexScriptableObject(path, storage);
      console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
      console.log(`Processed in ${result.elapsed_ms}ms`);
    } else {
      console.error('Unsupported file type. Use: .md, .asset, or directory');
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search documentation')
  .option('-s, --summarize', 'Summarize results (truncate content)')
  .option('-c, --compress', 'Compress results (minimal output)')
  .option('-j, --json', 'Output as JSON')
  .action(async (query, options) => {
    const storage = new DocStorage();
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
  .command('clear')
  .description('Clear old indices')
  .action(async () => {
    const storage = new DocStorage();
    await storage.clearOldChunks();
    console.log('Cleared old chunks');
  });

program.parse();
