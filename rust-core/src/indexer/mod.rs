pub mod chunker;
pub mod tokenizer;
pub mod storage;

use napi_derive::napi;
use std::fs;
use std::path::Path;
use std::time::Instant;

use crate::common::{IndexResult, SearchResult};
use chunker::MarkdownChunker;
use storage::IndexStorage;

/// High-performance documentation indexer
#[napi]
pub struct Indexer {
    storage: IndexStorage,
}

#[napi]
impl Indexer {
    #[napi(constructor)]
    pub fn new() -> Self {
        Indexer {
            storage: IndexStorage::new(),
        }
    }

    /// Index a single file
    #[napi]
    pub fn index_file(&mut self, path: String) -> IndexResult {
        let start = Instant::now();

        let file_path = Path::new(&path);
        if !file_path.exists() {
            return IndexResult {
                chunks_indexed: 0,
                total_tokens: 0,
                files_processed: 0,
                elapsed_ms: start.elapsed().as_millis() as u32,
            };
        }

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => {
                return IndexResult {
                    chunks_indexed: 0,
                    total_tokens: 0,
                    files_processed: 0,
                    elapsed_ms: start.elapsed().as_millis() as u32,
                }
            }
        };

        let chunks = MarkdownChunker::chunk_markdown(&content, &path);
        let total_tokens: u32 = chunks.iter().map(|c| c.tokens).sum();

        for chunk in &chunks {
            self.storage.store_chunk(chunk.clone());
        }

        self.storage.save();

        IndexResult {
            chunks_indexed: chunks.len() as u32,
            total_tokens,
            files_processed: 1,
            elapsed_ms: start.elapsed().as_millis() as u32,
        }
    }

    /// Index a directory of files
    #[napi]
    pub fn index_directory(&mut self, path: String) -> IndexResult {
        let start = Instant::now();

        let dir_path = Path::new(&path);
        if !dir_path.exists() || !dir_path.is_dir() {
            return IndexResult {
                chunks_indexed: 0,
                total_tokens: 0,
                files_processed: 0,
                elapsed_ms: start.elapsed().as_millis() as u32,
            };
        }

        let extensions = ["md", "txt"];
        let mut total_chunks = 0u32;
        let mut total_tokens = 0u32;
        let mut files_processed = 0u32;

        self.process_directory(
            dir_path,
            &extensions,
            &mut total_chunks,
            &mut total_tokens,
            &mut files_processed,
        );

        self.storage.save();

        IndexResult {
            chunks_indexed: total_chunks,
            total_tokens,
            files_processed,
            elapsed_ms: start.elapsed().as_millis() as u32,
        }
    }

    fn process_directory(
        &mut self,
        dir: &Path,
        extensions: &[&str],
        total_chunks: &mut u32,
        total_tokens: &mut u32,
        files_processed: &mut u32,
    ) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();

                if path.is_dir() {
                    self.process_directory(
                        &path,
                        extensions,
                        total_chunks,
                        total_tokens,
                        files_processed,
                    );
                } else if let Some(ext) = path.extension() {
                    if extensions.iter().any(|e| ext == *e) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let path_str = path.to_string_lossy().to_string();
                            let chunks = MarkdownChunker::chunk_markdown(&content, &path_str);

                            for chunk in &chunks {
                                *total_tokens += chunk.tokens;
                                self.storage.store_chunk(chunk.clone());
                            }

                            *total_chunks += chunks.len() as u32;
                            *files_processed += 1;
                        }
                    }
                }
            }
        }
    }

    /// Search the index
    #[napi]
    pub fn search(&self, query: String) -> Vec<SearchResult> {
        self.storage.keyword_search(&query)
    }

    /// Clear the index
    #[napi]
    pub fn clear(&mut self) {
        self.storage.clear();
    }

    /// Get index statistics
    #[napi]
    pub fn stats(&self) -> serde_json::Value {
        let (chunk_count, total_tokens) = self.storage.stats();
        serde_json::json!({
            "chunk_count": chunk_count,
            "total_tokens": total_tokens
        })
    }
}
