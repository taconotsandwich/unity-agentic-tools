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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Create a unique temp directory for each test (cleaned up on Drop).
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let count = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir().join(format!("rust_indexer_test_{}_{}", std::process::id(), count));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("Failed to create temp dir");
            TempDir(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn test_index_nonexistent_file_returns_zero_chunks() {
        let mut indexer = Indexer {
            storage: IndexStorage::new(),
        };
        let result = indexer.index_file("/nonexistent/path/to/file.md".to_string());
        assert_eq!(result.chunks_indexed, 0);
        assert_eq!(result.files_processed, 0);
    }

    #[test]
    fn test_index_real_temp_md_file() {
        let dir = TempDir::new();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "## Test\n\nThis is test content for indexing.\n").unwrap();

        let mut indexer = Indexer {
            storage: IndexStorage::new(),
        };
        let result = indexer.index_file(file_path.to_string_lossy().to_string());
        assert!(result.chunks_indexed > 0);
        assert_eq!(result.files_processed, 1);
    }

    #[test]
    fn test_index_empty_directory() {
        let dir = TempDir::new();

        let mut indexer = Indexer {
            storage: IndexStorage::new(),
        };
        let result = indexer.index_directory(dir.path().to_string_lossy().to_string());
        assert_eq!(result.files_processed, 0);
        assert_eq!(result.chunks_indexed, 0);
    }

    #[test]
    fn test_index_directory_with_two_md_files() {
        let dir = TempDir::new();
        fs::write(dir.path().join("a.md"), "## First\n\nContent one.\n").unwrap();
        fs::write(dir.path().join("b.md"), "## Second\n\nContent two.\n").unwrap();

        let mut indexer = Indexer {
            storage: IndexStorage::new(),
        };
        let result = indexer.index_directory(dir.path().to_string_lossy().to_string());
        assert_eq!(result.files_processed, 2);
        assert!(result.chunks_indexed > 0);
    }

    #[test]
    fn test_search_after_index_returns_results() {
        let dir = TempDir::new();
        // Use content where every word in the query appears in the chunk
        // to ensure Jaccard score exceeds 0.3 threshold
        fs::write(
            dir.path().join("unity.md"),
            "## Unity\n\nunity monobehaviour scripting guide\n",
        )
        .unwrap();

        let mut indexer = Indexer {
            storage: IndexStorage::new(),
        };
        indexer.index_file(dir.path().join("unity.md").to_string_lossy().to_string());

        let results = indexer.search("unity monobehaviour scripting".to_string());
        assert!(!results.is_empty(), "Search should find indexed content");
    }
}
