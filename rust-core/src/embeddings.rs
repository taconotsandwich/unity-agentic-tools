use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use napi_derive::napi;
use std::path::PathBuf;

/// Local CPU embedding generator using all-MiniLM-L6-v2 (384 dims).
/// Wraps fastembed-rs / ONNX Runtime. Model auto-downloads on first use
/// and is cached at ~/.claude/unity-agentic-tools/models/.
#[napi]
pub struct EmbeddingGenerator {
    model: TextEmbedding,
}

fn get_cache_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".claude")
        .join("unity-agentic-tools")
        .join("models")
}

#[napi]
impl EmbeddingGenerator {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let cache_dir = get_cache_dir();
        std::fs::create_dir_all(&cache_dir).map_err(|e| {
            napi::Error::from_reason(format!("Failed to create model cache dir: {e}"))
        })?;

        let options = InitOptions::new(EmbeddingModel::AllMiniLML6V2)
            .with_cache_dir(cache_dir)
            .with_show_download_progress(true);

        let model = TextEmbedding::try_new(options).map_err(|e| {
            napi::Error::from_reason(format!("Failed to initialize embedding model: {e}"))
        })?;

        Ok(EmbeddingGenerator { model })
    }

    /// Generate embedding for a single text. Returns a Vec<f64> (384 dims).
    #[napi]
    pub fn generate(&self, text: String) -> napi::Result<Vec<f64>> {
        let embeddings = self.model.embed(vec![text], None).map_err(|e| {
            napi::Error::from_reason(format!("Embedding generation failed: {e}"))
        })?;

        Ok(embeddings
            .into_iter()
            .next()
            .unwrap_or_default()
            .into_iter()
            .map(|v| v as f64)
            .collect())
    }

    /// Generate embeddings for a batch of texts. Returns Vec<Vec<f64>>.
    #[napi]
    pub fn generate_batch(&self, texts: Vec<String>) -> napi::Result<Vec<Vec<f64>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let embeddings = self.model.embed(texts, None).map_err(|e| {
            napi::Error::from_reason(format!("Batch embedding generation failed: {e}"))
        })?;

        Ok(embeddings
            .into_iter()
            .map(|emb| emb.into_iter().map(|v| v as f64).collect())
            .collect())
    }
}
