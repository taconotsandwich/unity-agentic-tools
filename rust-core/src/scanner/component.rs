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
                    }
                }
            }
        }
    }

    // Extract properties
    component.properties = Some(extract_properties(content, file_id, class_id));

    Some(component)
}

fn extract_properties(content: &str, file_id: &str, class_id: u32) -> serde_json::Value {
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

    let prop_re = Regex::new(r"(?m)^\s*m_([A-Za-z0-9_]+):\s*(.+)$").unwrap();
    let mut props = serde_json::Map::new();

    for line in block.lines() {
        if let Some(caps) = prop_re.captures(line) {
            if let (Some(name), Some(value)) = (caps.get(1), caps.get(2)) {
                let clean_name = name.as_str().to_string();
                let clean_value = value.as_str().trim().to_string();
                props.insert(clean_name, serde_json::json!(clean_value));
            }
        }
    }

    serde_json::Value::Object(props)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_properties() {
        let content = "--- !u!4 &123\nTransform:\n  m_ObjectHideFlags: 0\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n  m_LocalScale: {x: 1, y: 1, z: 1}\n";
        let props = extract_properties(content, "123", 4);
        assert!(props.is_object());
        let obj = props.as_object().unwrap();
        assert!(obj.contains_key("LocalPosition"));
        assert!(obj.contains_key("LocalScale"));
    }
}
