#![deny(clippy::all)]

pub mod common;
pub mod scanner;
pub mod indexer;
pub mod embeddings;
pub mod walker;

use napi_derive::napi;

// Re-export main types
pub use common::*;
pub use scanner::Scanner;
pub use indexer::Indexer;
pub use embeddings::EmbeddingGenerator;

/// Get the version of the native module
#[napi]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if the native module is available
#[napi]
pub fn is_native_available() -> bool {
    true
}
