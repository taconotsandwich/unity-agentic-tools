use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::common::{Chunk, SearchResult};

const STORAGE_FILENAME: &str = ".unity-docs-index.json";

/// Index storage for chunks
pub struct IndexStorage {
    chunks: HashMap<String, Chunk>,
    storage_path: PathBuf,
    loaded: bool,
}

impl IndexStorage {
    pub fn new() -> Self {
        let storage_path = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(STORAGE_FILENAME);

        IndexStorage {
            chunks: HashMap::new(),
            storage_path,
            loaded: false,
        }
    }

    /// Load index from disk
    pub fn load(&mut self) {
        if self.loaded {
            return;
        }

        if self.storage_path.exists() {
            if let Ok(content) = fs::read_to_string(&self.storage_path) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(chunks_obj) = data.get("chunks").and_then(|c| c.as_object()) {
                        for (id, chunk_val) in chunks_obj {
                            if let Ok(chunk) = serde_json::from_value::<Chunk>(chunk_val.clone()) {
                                self.chunks.insert(id.clone(), chunk);
                            }
                        }
                    }
                }
            }
        }

        self.loaded = true;
    }

    /// Save index to disk
    pub fn save(&self) {
        let chunks_map: HashMap<&String, &Chunk> = self.chunks.iter().collect();

        let data = serde_json::json!({
            "chunks": chunks_map,
            "last_updated": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        });

        if let Ok(json) = serde_json::to_string_pretty(&data) {
            let _ = fs::write(&self.storage_path, json);
        }
    }

    /// Store a chunk
    pub fn store_chunk(&mut self, chunk: Chunk) {
        self.load();
        self.chunks.insert(chunk.id.clone(), chunk);
    }

    /// Keyword search
    pub fn keyword_search(&self, query: &str) -> Vec<SearchResult> {
        let lower_query = query.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for chunk in self.chunks.values() {
            let lower_content = chunk.content.to_lowercase();

            if lower_content.contains(&lower_query) {
                let score = jaccard_similarity(query, &chunk.content);

                if score > 0.3 {
                    results.push(SearchResult {
                        id: chunk.id.clone(),
                        content: chunk.content.clone(),
                        score,
                        metadata: chunk.metadata.clone(),
                    });
                }
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(5);
        results
    }

    /// Clear all chunks
    pub fn clear(&mut self) {
        self.chunks.clear();
        self.save();
    }

    /// Get storage statistics
    pub fn stats(&self) -> (usize, u32) {
        let chunk_count = self.chunks.len();
        let total_tokens: u32 = self.chunks.values().map(|c| c.tokens).sum();
        (chunk_count, total_tokens)
    }
}

fn jaccard_similarity(str1: &str, str2: &str) -> f64 {
    let lower1 = str1.to_lowercase();
    let lower2 = str2.to_lowercase();
    let set1: std::collections::HashSet<&str> = lower1.split_whitespace().collect();
    let set2: std::collections::HashSet<&str> = lower2.split_whitespace().collect();

    let intersection: std::collections::HashSet<_> = set1.intersection(&set2).collect();
    let union_size = set1.len().max(set2.len());

    if union_size == 0 {
        0.0
    } else {
        intersection.len() as f64 / union_size as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jaccard_similarity() {
        assert!(jaccard_similarity("hello world", "hello world") > 0.9);
        assert!(jaccard_similarity("hello", "world") < 0.1);
    }
}
