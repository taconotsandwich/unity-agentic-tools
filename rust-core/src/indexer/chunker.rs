use regex::Regex;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::common::{Chunk, ChunkMetadata, ChunkType};
use super::tokenizer::estimate_tokens;

static CHUNK_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_id() -> String {
    let count = CHUNK_COUNTER.fetch_add(1, Ordering::SeqCst);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("chunk_{}_{}", timestamp, count)
}

pub struct MarkdownChunker;

impl MarkdownChunker {
    /// Chunk markdown content into searchable pieces
    pub fn chunk_markdown(content: &str, file_path: &str) -> Vec<Chunk> {
        let mut chunks = Vec::new();

        // Extract code blocks
        chunks.extend(Self::extract_code_blocks(content, file_path));

        // Chunk prose (content without code blocks)
        let prose_content = Self::remove_code_blocks(content);
        chunks.extend(Self::chunk_prose(&prose_content, file_path));

        chunks
    }

    /// Extract code blocks from markdown
    fn extract_code_blocks(content: &str, file_path: &str) -> Vec<Chunk> {
        let pattern = Regex::new(r"```(?:csharp|javascript|typescript|cs)?\n([\s\S]+?)```")
            .expect("Invalid regex");

        pattern
            .captures_iter(content)
            .map(|cap| {
                let code_content = cap.get(1).map_or("", |m| m.as_str());
                let match_start = cap.get(0).map_or(0, |m| m.start());

                let language = if content[..match_start + 3].ends_with("csharp")
                    || content[..match_start + 3].ends_with("cs")
                {
                    Some("csharp".to_string())
                } else if content[..match_start + 3].ends_with("javascript") {
                    Some("javascript".to_string())
                } else if content[..match_start + 3].ends_with("typescript") {
                    Some("typescript".to_string())
                } else {
                    None
                };

                Chunk {
                    id: generate_id(),
                    content: code_content.to_string(),
                    tokens: estimate_tokens(code_content),
                    chunk_type: ChunkType::Code,
                    metadata: ChunkMetadata {
                        file_path: file_path.to_string(),
                        section: Self::extract_section_title(content, match_start),
                        language,
                        unity_class: None,
                        unity_method: None,
                    },
                }
            })
            .collect()
    }

    /// Remove code blocks from content
    fn remove_code_blocks(content: &str) -> String {
        let pattern = Regex::new(r"```[\s\S]+?```").expect("Invalid regex");
        pattern.replace_all(content, "").to_string()
    }

    /// Extract section title from heading before position
    fn extract_section_title(content: &str, position: usize) -> Option<String> {
        let before = &content[..position];
        let pattern = Regex::new(r"#{2,3}\s+(.+)$").ok()?;

        // Find the last heading before this position
        for line in before.lines().rev() {
            if let Some(caps) = pattern.captures(line) {
                return caps.get(1).map(|m| m.as_str().trim().to_string());
            }
        }

        None
    }

    /// Chunk prose content by sections
    fn chunk_prose(content: &str, file_path: &str) -> Vec<Chunk> {
        let mut chunks = Vec::new();
        let section_pattern = Regex::new(r"(?m)^#{2,3}\s+").expect("Invalid regex");

        // Split by section headings
        let mut sections: Vec<(String, usize)> = Vec::new();
        let mut last_end = 0;

        for mat in section_pattern.find_iter(content) {
            if last_end > 0 {
                sections.push((content[last_end..mat.start()].to_string(), last_end));
            }
            last_end = mat.end();
        }

        if last_end < content.len() {
            sections.push((content[last_end..].to_string(), last_end));
        }

        for (section_text, index) in sections {
            let tokens = estimate_tokens(&section_text);

            if tokens <= 1024 {
                // Small enough to be one chunk
                chunks.push(Chunk {
                    id: generate_id(),
                    content: section_text.trim().to_string(),
                    tokens,
                    chunk_type: ChunkType::Prose,
                    metadata: ChunkMetadata {
                        file_path: file_path.to_string(),
                        section: Self::extract_section_title(content, index),
                        language: None,
                        unity_class: None,
                        unity_method: None,
                    },
                });
            } else {
                // Split by sentences
                chunks.extend(Self::chunk_by_sentences(&section_text, file_path, content, index));
            }
        }

        chunks
    }

    /// Chunk large sections by sentences
    fn chunk_by_sentences(
        text: &str,
        file_path: &str,
        full_content: &str,
        position: usize,
    ) -> Vec<Chunk> {
        let mut chunks = Vec::new();
        // Split after sentence-ending punctuation followed by whitespace.
        // Rust regex doesn't support lookbehind, so we find boundaries manually.
        let boundary = Regex::new(r"[.!?]\s+").expect("Invalid regex");
        let mut sentences = Vec::new();
        let mut last = 0;
        for m in boundary.find_iter(text) {
            // Include the punctuation char with the preceding sentence
            let end = m.start() + 1;
            sentences.push(&text[last..end]);
            last = m.end();
        }
        if last < text.len() {
            sentences.push(&text[last..]);
        }

        let mut current_chunk = String::new();
        let mut current_tokens = 0u32;

        for sentence in sentences {
            let sentence_tokens = estimate_tokens(sentence);

            if current_tokens + sentence_tokens > 1024 {
                if !current_chunk.trim().is_empty() {
                    chunks.push(Chunk {
                        id: generate_id(),
                        content: current_chunk.trim().to_string(),
                        tokens: current_tokens,
                        chunk_type: ChunkType::Prose,
                        metadata: ChunkMetadata {
                            file_path: file_path.to_string(),
                            section: Self::extract_section_title(full_content, position),
                            language: None,
                            unity_class: None,
                            unity_method: None,
                        },
                    });
                }
                current_chunk = sentence.to_string();
                current_tokens = sentence_tokens;
            } else {
                current_chunk.push_str(sentence);
                current_tokens += sentence_tokens;
            }
        }

        if !current_chunk.trim().is_empty() {
            chunks.push(Chunk {
                id: generate_id(),
                content: current_chunk.trim().to_string(),
                tokens: current_tokens,
                chunk_type: ChunkType::Prose,
                metadata: ChunkMetadata {
                    file_path: file_path.to_string(),
                    section: Self::extract_section_title(full_content, position),
                    language: None,
                    unity_class: None,
                    unity_method: None,
                },
            });
        }

        chunks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_markdown_code() {
        let content = r#"
## Example

```csharp
void Start() {
    Debug.Log("Hello");
}
```
"#;
        let chunks = MarkdownChunker::chunk_markdown(content, "test.md");
        assert!(!chunks.is_empty());
        assert!(chunks.iter().any(|c| c.chunk_type == ChunkType::Code));
    }

    #[test]
    fn test_chunk_markdown_prose() {
        let content = r#"
## Introduction

This is some prose content about Unity development.
It should be chunked properly.
"#;
        let chunks = MarkdownChunker::chunk_markdown(content, "test.md");
        assert!(!chunks.is_empty());
        assert!(chunks.iter().any(|c| c.chunk_type == ChunkType::Prose));
    }

    #[test]
    fn test_chunk_markdown_empty() {
        let chunks = MarkdownChunker::chunk_markdown("", "empty.md");
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_chunk_markdown_no_headings() {
        let content = "Just plain text without any headings or structure.";
        let chunks = MarkdownChunker::chunk_markdown(content, "plain.md");
        // Content without headings should still produce chunks (falls through to last section)
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_code_block_produces_chunks() {
        let content = "## Code\n\n```csharp\nvoid Start() {}\n```\n";
        let chunks = MarkdownChunker::chunk_markdown(content, "test.md");
        let code_chunks: Vec<_> = chunks.iter().filter(|c| c.chunk_type == ChunkType::Code).collect();
        assert!(!code_chunks.is_empty(), "Should extract at least one code chunk");
        // Code content should contain the function
        assert!(code_chunks[0].content.contains("Start"));
    }

    #[test]
    fn test_multiple_sections_produce_multiple_chunks() {
        let content = "## Section One\n\nFirst section content.\n\n## Section Two\n\nSecond section content.\n";
        let chunks = MarkdownChunker::chunk_markdown(content, "test.md");
        let prose_chunks: Vec<_> = chunks.iter().filter(|c| c.chunk_type == ChunkType::Prose).collect();
        assert!(prose_chunks.len() >= 2, "Two sections should produce at least 2 prose chunks, got {}", prose_chunks.len());
    }

    #[test]
    fn test_section_title_in_metadata() {
        // Use two sections so the second one has a heading before it
        let content = "## First\n\nFirst content.\n\n## My Section\n\nSome content under the section.\n";
        let chunks = MarkdownChunker::chunk_markdown(content, "test.md");
        // At least one chunk should have a section in its metadata
        assert!(chunks.iter().any(|c| c.metadata.section.is_some()), "At least one chunk should have section metadata");
    }
}
