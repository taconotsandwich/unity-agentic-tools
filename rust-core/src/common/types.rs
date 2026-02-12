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
    #[napi(ts_type = "number | undefined")]
    pub depth: Option<u32>,
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

/// A single property override in a PrefabInstance
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefabModification {
    pub target_file_id: String,
    #[napi(ts_type = "string | undefined")]
    pub target_guid: Option<String>,
    pub property_path: String,
    pub value: String,
}

/// Union result from find_by_name: either a GameObject or PrefabInstance
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindResult {
    pub name: String,
    pub file_id: String,
    pub result_type: String,  // "GameObject" or "PrefabInstance"
    #[napi(ts_type = "boolean | undefined")]
    pub active: Option<bool>,
    #[napi(ts_type = "number | undefined")]
    pub match_score: Option<f64>,
    #[napi(ts_type = "string | undefined")]
    pub source_guid: Option<String>,
    #[napi(ts_type = "string | undefined")]
    pub source_prefab: Option<String>,
    #[napi(ts_type = "number | undefined")]
    pub modifications_count: Option<u32>,
}

impl FindResult {
    pub fn from_game_object(go: &GameObject, score: Option<f64>) -> Self {
        FindResult {
            name: go.name.clone(),
            file_id: go.file_id.clone(),
            result_type: "GameObject".to_string(),
            active: Some(go.active),
            match_score: score,
            source_guid: None,
            source_prefab: None,
            modifications_count: None,
        }
    }

    pub fn from_prefab_instance(pi: &PrefabInstanceInfo, score: Option<f64>) -> Self {
        FindResult {
            name: pi.name.clone(),
            file_id: pi.file_id.clone(),
            result_type: "PrefabInstance".to_string(),
            active: None,
            match_score: score,
            source_guid: Some(pi.source_guid.clone()),
            source_prefab: pi.source_prefab.clone(),
            modifications_count: Some(pi.modifications_count),
        }
    }
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
    #[napi(ts_type = "string | undefined")]
    pub filter_component: Option<String>,
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
    #[napi(ts_type = "string | undefined")]
    pub error: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_result_from_game_object() {
        let go = GameObject {
            name: "Player".to_string(),
            file_id: "12345".to_string(),
            active: true,
            match_score: None,
        };
        let result = FindResult::from_game_object(&go, Some(85.0));
        assert_eq!(result.name, "Player");
        assert_eq!(result.file_id, "12345");
        assert_eq!(result.result_type, "GameObject");
        assert_eq!(result.active, Some(true));
        assert_eq!(result.match_score, Some(85.0));
        assert!(result.source_guid.is_none());
        assert!(result.source_prefab.is_none());
        assert!(result.modifications_count.is_none());
    }

    #[test]
    fn test_find_result_from_game_object_no_score() {
        let go = GameObject {
            name: "Camera".to_string(),
            file_id: "999".to_string(),
            active: false,
            match_score: None,
        };
        let result = FindResult::from_game_object(&go, None);
        assert_eq!(result.active, Some(false));
        assert!(result.match_score.is_none());
    }

    #[test]
    fn test_find_result_from_prefab_instance() {
        let pi = PrefabInstanceInfo {
            name: "Enemy".to_string(),
            file_id: "700000".to_string(),
            source_guid: "aabbccdd".to_string(),
            source_prefab: Some("Assets/Prefabs/Enemy.prefab".to_string()),
            modifications_count: 3,
        };
        let result = FindResult::from_prefab_instance(&pi, Some(70.0));
        assert_eq!(result.name, "Enemy");
        assert_eq!(result.file_id, "700000");
        assert_eq!(result.result_type, "PrefabInstance");
        assert!(result.active.is_none());
        assert_eq!(result.match_score, Some(70.0));
        assert_eq!(result.source_guid, Some("aabbccdd".to_string()));
        assert_eq!(result.source_prefab, Some("Assets/Prefabs/Enemy.prefab".to_string()));
        assert_eq!(result.modifications_count, Some(3));
    }

    #[test]
    fn test_find_result_from_prefab_instance_no_source_prefab() {
        let pi = PrefabInstanceInfo {
            name: "Ally".to_string(),
            file_id: "800000".to_string(),
            source_guid: "11223344".to_string(),
            source_prefab: None,
            modifications_count: 0,
        };
        let result = FindResult::from_prefab_instance(&pi, None);
        assert!(result.source_prefab.is_none());
        assert!(result.match_score.is_none());
        assert_eq!(result.modifications_count, Some(0));
    }
}
