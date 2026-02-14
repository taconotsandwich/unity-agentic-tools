use regex::Regex;
use std::collections::HashMap;

use crate::common::Component;
use super::config::ComponentConfig;

/// Extract a block from content by header
fn extract_block<'a>(content: &'a str, header: &str) -> Option<&'a str> {
    let start_pos = content.find(header)?;
    let after_header = &content[start_pos..];

    let end_offset = after_header[header.len()..]
        .find("--- !u!")
        .map(|pos| header.len() + pos)
        .unwrap_or(after_header.len());

    Some(&after_header[..end_offset])
}

/// Extract all components for a GameObject
pub fn extract_components(
    content: &str,
    gameobject_file_id: &str,
    guid_cache: &HashMap<String, String>,
) -> Vec<Component> {
    extract_components_with_config(content, gameobject_file_id, guid_cache, &ComponentConfig::default())
}

/// Extract all components for a GameObject with custom config
pub fn extract_components_with_config(
    content: &str,
    gameobject_file_id: &str,
    guid_cache: &HashMap<String, String>,
    config: &ComponentConfig,
) -> Vec<Component> {
    // Find the GameObject block
    let go_header = format!("--- !u!{} &{}", config.gameobject_class_id, gameobject_file_id);
    let go_block = match extract_block(content, &go_header) {
        Some(block) => block,
        None => return Vec::new(),
    };

    // Get component refs
    let comp_ref_re = Regex::new(r"component:\s*\{fileID:\s*(\d+)\}").unwrap();
    let comp_refs: Vec<String> = comp_ref_re
        .captures_iter(go_block)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();

    // Extract each component
    comp_refs
        .iter()
        .filter_map(|ref_id| extract_single_component_with_config(content, ref_id, guid_cache, config))
        .collect()
}

#[allow(dead_code)]
fn extract_single_component(
    content: &str,
    file_id: &str,
    guid_cache: &HashMap<String, String>,
) -> Option<Component> {
    extract_single_component_with_config(content, file_id, guid_cache, &ComponentConfig::default())
}

fn extract_single_component_with_config(
    content: &str,
    file_id: &str,
    guid_cache: &HashMap<String, String>,
    config: &ComponentConfig,
) -> Option<Component> {
    // Find the component block header
    let header_pattern = format!(r"--- !u!(\d+) &{}\s*\n.*?([A-Za-z][A-Za-z0-9_]*):", file_id);
    let header_re = Regex::new(&header_pattern).ok()?;
    let caps = header_re.captures(content)?;

    let class_id: u32 = caps.get(1)?.as_str().parse().ok()?;
    let type_name = caps.get(2)?.as_str().to_string();

    let mut component = Component {
        type_name,
        class_id,
        file_id: file_id.to_string(),
        script_path: None,
        script_guid: None,
        script_name: None,
        properties: None,
    };

    // For script containers (MonoBehaviour-like), try to extract script GUID
    if config.is_script_container(class_id) {
        let script_pattern = format!(
            r"--- !u!{} &{}[\s\S]*?{}:\s*\{{fileID:\s*\d+,\s*guid:\s*([a-f0-9]{{32}})",
            class_id,
            file_id,
            regex::escape(&config.script_field)
        );
        if let Ok(script_re) = Regex::new(&script_pattern) {
            if let Some(script_caps) = script_re.captures(content) {
                if let Some(guid_match) = script_caps.get(1) {
                    let guid = guid_match.as_str().to_string();
                    component.script_guid = Some(guid.clone());

                    // Try to resolve GUID to path
                    if let Some(path) = guid_cache.get(&guid) {
                        component.script_path = Some(path.clone());

                        // Derive script_name from file stem
                        if let Some(stem) = std::path::Path::new(path)
                            .file_stem()
                            .and_then(|s| s.to_str())
                        {
                            component.script_name = Some(stem.to_string());
                        }
                    }
                }
            }
        }
    }

    // Extract properties
    component.properties = Some(extract_properties(content, file_id, class_id, guid_cache));

    Some(component)
}

/// Unity metadata properties that are rarely useful for agents and waste tokens.
/// These are internal Unity fields present on nearly every component.
const METADATA_PROPERTIES: &[&str] = &[
    "ObjectHideFlags",
    "CorrespondingSourceObject",
    "PrefabInstance",
    "PrefabAsset",
    "PrefabInternal",
];

/// Resolve GUID references in a property value string.
/// Matches `{fileID: X, guid: <32hex>, type: N}` and appends ` -> resolved/path` when found in cache.
fn resolve_guid_in_value(value: &str, guid_cache: &HashMap<String, String>) -> String {
    if !value.contains("guid:") {
        return value.to_string();
    }
    let guid_re = Regex::new(r"guid:\s*([a-f0-9]{32})").unwrap();
    if let Some(caps) = guid_re.captures(value) {
        if let Some(guid_match) = caps.get(1) {
            let guid = guid_match.as_str();
            if let Some(path) = guid_cache.get(guid) {
                return format!("{} -> {}", value, path);
            }
        }
    }
    value.to_string()
}

pub(crate) fn extract_properties(content: &str, file_id: &str, class_id: u32, guid_cache: &HashMap<String, String>) -> serde_json::Value {
    // Find the start of this block
    let header = format!("--- !u!{} &{}", class_id, file_id);
    let start_pos = match content.find(&header) {
        Some(pos) => pos,
        None => return serde_json::json!({}),
    };

    // Find the end of this block (start of next block or end of content)
    let after_header = &content[start_pos + header.len()..];
    let end_offset = after_header.find("--- !u!").unwrap_or(after_header.len());
    let block = &after_header[..end_offset];

    let prop_re = Regex::new(r"(?m)^\s*(m_)?([A-Za-z0-9_]+):\s*(.+)$").unwrap();
    let mut props = serde_json::Map::new();

    let lines: Vec<&str> = block.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        if let Some(caps) = prop_re.captures(lines[i]) {
            if let (Some(name), Some(value)) = (caps.get(2), caps.get(3)) {
                let clean_name = name.as_str().to_string();
                // Skip Unity metadata properties that waste tokens
                if METADATA_PROPERTIES.contains(&clean_name.as_str()) {
                    i += 1;
                    continue;
                }
                let mut clean_value = value.as_str().trim().to_string();

                // Handle multi-line flow mappings: if braces/brackets are unbalanced,
                // read continuation lines until balanced
                let open_braces = clean_value.matches('{').count();
                let close_braces = clean_value.matches('}').count();
                let open_brackets = clean_value.matches('[').count();
                let close_brackets = clean_value.matches(']').count();

                if open_braces > close_braces || open_brackets > close_brackets {
                    let mut j = i + 1;
                    while j < lines.len() {
                        let continuation = lines[j].trim();
                        // Stop if we hit a new block header or top-level property
                        if continuation.starts_with("--- !u!") {
                            break;
                        }
                        clean_value.push(' ');
                        clean_value.push_str(continuation);

                        let ob = clean_value.matches('{').count();
                        let cb = clean_value.matches('}').count();
                        let obk = clean_value.matches('[').count();
                        let cbk = clean_value.matches(']').count();
                        j += 1;
                        if ob <= cb && obk <= cbk {
                            break;
                        }
                    }
                    i = j;
                } else {
                    i += 1;
                }

                let resolved_value = resolve_guid_in_value(&clean_value, guid_cache);
                props.insert(clean_name, serde_json::json!(resolved_value));
                continue;
            }
        }
        i += 1;
    }

    serde_json::Value::Object(props)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_properties() {
        let content = "--- !u!4 &123\nTransform:\n  m_ObjectHideFlags: 0\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n  m_LocalScale: {x: 1, y: 1, z: 1}\n";
        let props = extract_properties(content, "123", 4, &HashMap::new());
        assert!(props.is_object());
        let obj = props.as_object().unwrap();
        assert!(obj.contains_key("LocalPosition"));
        assert!(obj.contains_key("LocalScale"));
    }

    #[test]
    fn test_metadata_properties_filtered() {
        let content = "--- !u!4 &456\nTransform:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_LocalPosition: {x: 1, y: 2, z: 3}\n";
        let props = extract_properties(content, "456", 4, &HashMap::new());
        let obj = props.as_object().unwrap();
        // Metadata should be filtered out
        assert!(!obj.contains_key("ObjectHideFlags"));
        assert!(!obj.contains_key("CorrespondingSourceObject"));
        assert!(!obj.contains_key("PrefabInstance"));
        assert!(!obj.contains_key("PrefabAsset"));
        // Real properties should remain
        assert!(obj.contains_key("LocalPosition"));
    }

    #[test]
    fn test_script_name_populated_from_path() {
        // MonoBehaviour with GUID in cache -> script_name derived from path
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 200}\n\
--- !u!114 &200\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}\n  m_Enabled: 1\n";
        let mut cache = HashMap::new();
        cache.insert(
            "aabbccdd11223344aabbccdd11223344".to_string(),
            "Assets/Scripts/PlayerController.cs".to_string(),
        );
        let result = extract_single_component(content, "200", &cache);
        let comp = result.expect("should find component");
        assert_eq!(comp.script_name, Some("PlayerController".to_string()));
        assert_eq!(comp.script_path, Some("Assets/Scripts/PlayerController.cs".to_string()));
    }

    #[test]
    fn test_script_name_none_when_guid_not_in_cache() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 300}\n\
--- !u!114 &300\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ffffffffffffffffffffffffffffffff, type: 3}\n";
        let cache = HashMap::new(); // empty
        let result = extract_single_component(content, "300", &cache);
        let comp = result.expect("should find component");
        assert!(comp.script_name.is_none());
        assert!(comp.script_path.is_none());
        assert_eq!(comp.script_guid, Some("ffffffffffffffffffffffffffffffff".to_string()));
    }

    #[test]
    fn test_script_name_handles_nested_path() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 400}\n\
--- !u!114 &400\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: 11111111222222223333333344444444, type: 3}\n";
        let mut cache = HashMap::new();
        cache.insert(
            "11111111222222223333333344444444".to_string(),
            "Assets/Scripts/UI/Panels/HealthBarUI.cs".to_string(),
        );
        let result = extract_single_component(content, "400", &cache);
        let comp = result.expect("should find component");
        assert_eq!(comp.script_name, Some("HealthBarUI".to_string()));
    }

    #[test]
    fn test_non_script_component_has_no_script_name() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 500}\n\
--- !u!4 &500\nTransform:\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n";
        let cache = HashMap::new();
        let result = extract_single_component(content, "500", &cache);
        let comp = result.expect("should find component");
        assert_eq!(comp.type_name, "Transform");
        assert!(comp.script_name.is_none());
        assert!(comp.script_guid.is_none());
        assert!(comp.script_path.is_none());
    }

    // --- GUID resolution in property values ---

    #[test]
    fn test_resolve_guid_in_value_with_known_guid() {
        let mut cache = HashMap::new();
        cache.insert(
            "aabbccdd11223344aabbccdd11223344".to_string(),
            "Assets/Scripts/PlayerController.cs".to_string(),
        );
        let input = "{fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}";
        let result = resolve_guid_in_value(input, &cache);
        assert!(result.contains("-> Assets/Scripts/PlayerController.cs"));
        assert!(result.starts_with("{fileID:"));
    }

    #[test]
    fn test_resolve_guid_in_value_unknown_guid() {
        let cache = HashMap::new();
        let input = "{fileID: 11500000, guid: ffffffffffffffffffffffffffffffff, type: 3}";
        let result = resolve_guid_in_value(input, &cache);
        assert_eq!(result, input); // unchanged
    }

    #[test]
    fn test_resolve_guid_in_value_no_guid() {
        let cache = HashMap::new();
        let input = "{x: 1, y: 2}";
        let result = resolve_guid_in_value(input, &cache);
        assert_eq!(result, input); // fast path, no "guid:" substring
    }

    #[test]
    fn test_resolve_guid_in_value_null_reference() {
        let cache = HashMap::new();
        let input = "{fileID: 0}";
        let result = resolve_guid_in_value(input, &cache);
        assert_eq!(result, input); // no guid field at all
    }

    #[test]
    fn test_extract_properties_with_guid_resolution() {
        let mut cache = HashMap::new();
        cache.insert(
            "aabbccdd11223344aabbccdd11223344".to_string(),
            "Assets/Scripts/PlayerController.cs".to_string(),
        );
        let content = "--- !u!114 &600\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}\n  m_Enabled: 1\n";
        let props = extract_properties(content, "600", 114, &cache);
        let obj = props.as_object().unwrap();
        let script_val = obj.get("Script").unwrap().as_str().unwrap();
        assert!(script_val.contains("-> Assets/Scripts/PlayerController.cs"));
    }

    #[test]
    fn test_extract_properties_preserves_non_guid_values() {
        let content = "--- !u!4 &700\nTransform:\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}\n";
        let props = extract_properties(content, "700", 4, &HashMap::new());
        let obj = props.as_object().unwrap();
        assert_eq!(obj.get("LocalPosition").unwrap().as_str().unwrap(), "{x: 0, y: 0, z: 0}");
        assert_eq!(obj.get("LocalRotation").unwrap().as_str().unwrap(), "{x: 0, y: 0, z: 0, w: 1}");
    }

    #[test]
    fn test_extract_properties_includes_non_m_prefixed() {
        let content = "--- !u!114 &800\nMonoBehaviour:\n  m_Enabled: 1\n  m_Script: {fileID: 11500000, guid: aabb, type: 3}\n  Text: Hello World\n  customField: 42\n  speed: 5.5\n";
        let props = extract_properties(content, "800", 114, &HashMap::new());
        let obj = props.as_object().unwrap();
        // m_-prefixed properties should still work (without m_ prefix in key)
        assert!(obj.contains_key("Enabled"));
        // Non-m_ properties should now appear
        assert!(obj.contains_key("Text"));
        assert_eq!(obj.get("Text").unwrap().as_str().unwrap(), "Hello World");
        assert!(obj.contains_key("customField"));
        assert_eq!(obj.get("customField").unwrap().as_str().unwrap(), "42");
        assert!(obj.contains_key("speed"));
        assert_eq!(obj.get("speed").unwrap().as_str().unwrap(), "5.5");
    }

    #[test]
    fn test_extract_properties_metadata_filter_still_works() {
        let content = "--- !u!114 &900\nMonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  Text: Hello\n  m_Enabled: 1\n";
        let props = extract_properties(content, "900", 114, &HashMap::new());
        let obj = props.as_object().unwrap();
        // Metadata still filtered
        assert!(!obj.contains_key("ObjectHideFlags"));
        assert!(!obj.contains_key("CorrespondingSourceObject"));
        assert!(!obj.contains_key("PrefabInstance"));
        assert!(!obj.contains_key("PrefabAsset"));
        // Non-metadata properties kept
        assert!(obj.contains_key("Text"));
        assert!(obj.contains_key("Enabled"));
    }
}
