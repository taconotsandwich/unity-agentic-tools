use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// Basic GameObject information
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameObject {
    pub name: String,
    pub file_id: String,
    pub active: bool,
    #[napi(ts_type = "number | undefined")]
    pub match_score: Option<f64>,
}

/// Component information
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Component {
    #[napi(js_name = "type")]
    pub type_name: String,
    pub class_id: u32,
    pub file_id: String,
    #[napi(ts_type = "string | undefined")]
    pub script_path: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub script_guid: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub script_name: Option<String>,
    #[napi(ts_type = "Record<string, any> | undefined")]
    pub properties: Option<serde_json::Value>,
}

/// GameObject with detailed component information
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameObjectDetail {
    pub name: String,
    pub file_id: String,
    pub active: bool,
    pub tag: String,
    pub layer: u32,
    pub components: Vec<Component>,
    #[napi(ts_type = "string[] | undefined")]
    pub children: Option<Vec<String>>,
    #[napi(ts_type = "string | undefined")]
    pub parent_transform_id: Option<String>,
}

/// PrefabInstance information
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefabInstanceInfo {
    pub name: String,
    pub file_id: String,
    pub source_guid: String,
    #[napi(ts_type = "string | undefined")]
    pub source_prefab: Option<String>,
    pub modifications_count: u32,
}

/// Full scene inspection result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneInspection {
    pub file: String,
    pub count: u32,
    pub gameobjects: Vec<GameObjectDetail>,
    #[napi(ts_type = "PrefabInstanceInfo[] | undefined")]
    pub prefab_instances: Option<Vec<PrefabInstanceInfo>>,
}

/// Options for scanning
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    #[napi(ts_type = "boolean | undefined")]
    pub verbose: Option<bool>,
}

/// Options for inspecting
#[napi(object)]
#[derive(Debug, Clone)]
pub struct InspectOptions {
    pub file: String,
    #[napi(ts_type = "string | undefined")]
    pub identifier: Option<String>,
    #[napi(ts_type = "boolean | undefined")]
    pub include_properties: Option<bool>,
    #[napi(ts_type = "boolean | undefined")]
    pub verbose: Option<bool>,
}

/// Pagination options for inspect_all
#[napi(object)]
#[derive(Debug, Clone)]
pub struct PaginationOptions {
    pub file: String,
    #[napi(ts_type = "boolean | undefined")]
    pub include_properties: Option<bool>,
    #[napi(ts_type = "boolean | undefined")]
    pub verbose: Option<bool>,
    #[napi(ts_type = "number | undefined")]
    pub page_size: Option<u32>,
    #[napi(ts_type = "number | undefined")]
    pub cursor: Option<u32>,
    #[napi(ts_type = "number | undefined")]
    pub max_depth: Option<u32>,
}

/// Paginated inspection result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedInspection {
    pub file: String,
    pub total: u32,
    pub cursor: u32,
    #[napi(ts_type = "number | undefined")]
    pub next_cursor: Option<u32>,
    pub truncated: bool,
    pub page_size: u32,
    pub gameobjects: Vec<GameObjectDetail>,
    #[napi(ts_type = "PrefabInstanceInfo[] | undefined")]
    pub prefab_instances: Option<Vec<PrefabInstanceInfo>>,
}

/// Chunk types for indexing
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChunkType {
    Prose,
    Code,
    Api,
    Example,
}

/// Chunk metadata
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkMetadata {
    pub file_path: String,
    #[napi(ts_type = "string | undefined")]
    pub section: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub language: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub unity_class: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub unity_method: Option<String>,
}

/// A chunk of indexed content
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub content: String,
    pub tokens: u32,
    #[napi(js_name = "type")]
    pub chunk_type: ChunkType,
    pub metadata: ChunkMetadata,
}

/// Result of indexing operation
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexResult {
    pub chunks_indexed: u32,
    pub total_tokens: u32,
    pub files_processed: u32,
    pub elapsed_ms: u32,
}

/// Search result from index
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub content: String,
    pub score: f64,
    pub metadata: ChunkMetadata,
}
