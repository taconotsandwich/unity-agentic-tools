#!/usr/bin/env bun

import { Command } from 'commander';
import { indexMarkdownFile, indexDocsDirectory, indexScriptableObject } from './indexer';
import { DocStorage } from './storage';
import { DocSearch } from './search';

const program = new Command();

program
  .name('unity-doc-indexer')
  .description('Fast Unity documentation indexer with RAG')
  .version('1.0.0');

program
  .command('index <path>')
  .description('Index documentation')
  .action(async (path) => {
    console.log(`Indexing: ${path}`);

    const stat = require('fs').statSync(path);
    if (stat.isDirectory()) {
      const result = await indexDocsDirectory(path);
      console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
      console.log(`Processed ${result.files_processed} files in ${result.elapsed_ms}ms`);
    } else if (path.endsWith('.md')) {
      const result = indexMarkdownFile(path);
      console.log(`Indexed ${result.chunks_indexed} chunks (${result.total_tokens} tokens)`);
      console.log(`Processed in ${result.elapsed_ms}ms`);
    } else if (path.endsWith('.asset')) {
      const result = await indexScriptableObject(path);
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
  .action(async (query) => {
    const storage = new DocStorage();
    const searcher = new DocSearch(storage);

    const results = await searcher.search({
      query,
      top_k: 5,
      semantic_weight: 0.6,
      keyword_weight: 0.4
    });

    console.log(`Found ${results.results.length} results in ${results.elapsed_ms}ms`);
    console.log(`Semantic: ${results.semantic_count}, Keyword: ${results.keyword_count}`);

    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      console.log(`\n[${i + 1}] ${result.metadata?.section || result.metadata?.unity_class || result.metadata?.file_path}`);
      console.log(result.content);
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
