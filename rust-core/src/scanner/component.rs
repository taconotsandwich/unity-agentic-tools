use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::common::Component;
use super::config::ComponentConfig;
use super::parser::BlockIndex;

// Cached regexes — compiled once, reused across all calls
static COMP_REF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"component:\s*\{fileID:\s*(-?\d+)\}").unwrap()
});
static TYPE_NAME_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([A-Za-z][A-Za-z0-9_]*):").unwrap()
});
static PROP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^\s*(m_)?([A-Za-z0-9_]+):\s*(.+)$").unwrap()
});
static GUID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"guid:\s*([a-f0-9]{32})").unwrap()
});
static EMPTY_KEY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\s*)(m_)?([A-Za-z0-9_]+):[ \t]*$").unwrap()
});

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
    let comp_refs: Vec<String> = COMP_REF_RE
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
    let header_pattern = format!(r"--- !u!(\d+) &{}\s*\n.*?([A-Za-z][A-Za-z0-9_]*):", regex::escape(file_id));
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
            r"--- !u!{} &{}[\s\S]*?{}:\s*\{{fileID:\s*-?\d+,\s*guid:\s*([a-f0-9]{{32}})",
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

/// Extract all components for a GameObject using pre-indexed block lookup (O(1) per block).
pub fn extract_components_indexed(
    index: &BlockIndex,
    gameobject_file_id: &str,
    guid_cache: &HashMap<String, String>,
    config: &ComponentConfig,
) -> Vec<Component> {
    let go_block = match index.get_by_class_and_id(config.gameobject_class_id, gameobject_file_id) {
        Some(block) => block,
        None => return Vec::new(),
    };

    let comp_refs: Vec<&str> = COMP_REF_RE
        .captures_iter(go_block)
        .filter_map(|c| c.get(1).map(|m| m.as_str()))
        .collect();

    comp_refs
        .iter()
        .filter_map(|ref_id| extract_single_component_indexed(index, ref_id, guid_cache, config))
        .collect()
}

fn extract_single_component_indexed(
    index: &BlockIndex,
    file_id: &str,
    guid_cache: &HashMap<String, String>,
    config: &ComponentConfig,
) -> Option<Component> {
    let (class_id, block) = index.get(file_id)?;

    // Extract type name from first line (e.g., "Transform:" or "MonoBehaviour:")
    let type_name = TYPE_NAME_RE.captures(block)?
        .get(1)?.as_str().to_string();

    let mut component = Component {
        type_name,
        class_id,
        file_id: file_id.to_string(),
        script_path: None,
        script_guid: None,
        script_name: None,
        properties: None,
    };

    // For script containers, extract script GUID from block (not full content)
    if config.is_script_container(class_id) {
        let script_pattern = format!(
            r"{}:\s*\{{fileID:\s*-?\d+,\s*guid:\s*([a-f0-9]{{32}})",
            regex::escape(&config.script_field)
        );
        if let Ok(script_re) = Regex::new(&script_pattern) {
            if let Some(script_caps) = script_re.captures(block) {
                if let Some(guid_match) = script_caps.get(1) {
                    let guid = guid_match.as_str().to_string();
                    component.script_guid = Some(guid.clone());
                    if let Some(path) = guid_cache.get(&guid) {
                        component.script_path = Some(path.clone());
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

    component.properties = Some(extract_properties_from_block(block, guid_cache));

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
    if let Some(caps) = GUID_RE.captures(value) {
        if let Some(guid_match) = caps.get(1) {
            let guid = guid_match.as_str();
            if let Some(path) = guid_cache.get(guid) {
                return format!("{} -> {}", value, path);
            }
        }
    }
    value.to_string()
}

/// Collect continuation lines for multi-line brace/bracket-balanced values.
/// Advances `i` past any consumed continuation lines.
fn collect_multiline_value(value: &mut String, lines: &[&str], i: &mut usize) {
    let open_braces = value.matches('{').count();
    let close_braces = value.matches('}').count();
    let open_brackets = value.matches('[').count();
    let close_brackets = value.matches(']').count();

    if open_braces <= close_braces && open_brackets <= close_brackets {
        return;
    }

    while *i < lines.len() {
        let cont = lines[*i].trim();
        if cont.starts_with("--- !u!") {
            break;
        }
        value.push(' ');
        value.push_str(cont);
        *i += 1;
        let ob = value.matches('{').count();
        let cb = value.matches('}').count();
        let obk = value.matches('[').count();
        let cbk = value.matches(']').count();
        if ob <= cb && obk <= cbk {
            break;
        }
    }
}

/// Recursively parse a YAML map (block mapping) from lines starting at `*i`.
/// Processes lines while their indent >= `min_indent`. Returns the collected map.
fn parse_map(
    lines: &[&str],
    i: &mut usize,
    min_indent: usize,
    guid_cache: &HashMap<String, String>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut props = serde_json::Map::new();

    while *i < lines.len() {
        let line = lines[*i];
        if line.starts_with("--- !u!") {
            break;
        }
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            *i += 1;
            continue;
        }
        let indent = line.len() - trimmed.len();
        if indent < min_indent {
            break;
        }

        // Empty key (key with no value after colon, e.g. "  m_Bounds:")
        if let Some(caps) = EMPTY_KEY_RE.captures(line) {
            let key_indent = caps.get(1).map_or(0, |m| m.as_str().len());
            let clean_name = caps.get(3).unwrap().as_str().to_string();

            if METADATA_PROPERTIES.contains(&clean_name.as_str()) {
                *i += 1;
                continue;
            }

            *i += 1;

            // Peek at next non-empty line to determine sub-structure type
            let mut peek = *i;
            while peek < lines.len() {
                let pt = lines[peek].trim_start();
                if !pt.is_empty() {
                    break;
                }
                peek += 1;
            }

            if peek < lines.len() && !lines[peek].starts_with("--- !u!") {
                let next_trimmed = lines[peek].trim_start();
                let next_indent = lines[peek].len() - next_trimmed.len();
                let seq_prefix = format!("{}- ", " ".repeat(key_indent));

                if lines[peek].starts_with(&seq_prefix) {
                    // Sub-sequence
                    props.insert(clean_name, serde_json::Value::Array(
                        parse_sequence(lines, i, key_indent, guid_cache)
                    ));
                } else if next_indent > key_indent {
                    // Sub-map
                    props.insert(clean_name, serde_json::Value::Object(
                        parse_map(lines, i, next_indent, guid_cache)
                    ));
                } else {
                    // Empty value (same or lower indent means no children)
                    props.insert(clean_name, serde_json::json!(""));
                }
            } else {
                props.insert(clean_name, serde_json::json!(""));
            }
            continue;
        }

        // Property with value (key: value)
        if let Some(caps) = PROP_RE.captures(line) {
            if let (Some(name), Some(value)) = (caps.get(2), caps.get(3)) {
                let clean_name = name.as_str().to_string();
                if METADATA_PROPERTIES.contains(&clean_name.as_str()) {
                    *i += 1;
                    continue;
                }
                let mut clean_value = value.as_str().trim().to_string();
                *i += 1;
                collect_multiline_value(&mut clean_value, lines, i);
                let resolved = resolve_guid_in_value(&clean_value, guid_cache);
                props.insert(clean_name, serde_json::json!(resolved));
                continue;
            }
        }

        *i += 1;
    }

    props
}

/// Recursively parse a YAML sequence (block sequence) from lines starting at `*i`.
/// `key_indent` is the indent of the parent key that owns this sequence.
/// Sequence entries start with `" ".repeat(key_indent) + "- "`.
fn parse_sequence(
    lines: &[&str],
    i: &mut usize,
    key_indent: usize,
    guid_cache: &HashMap<String, String>,
) -> Vec<serde_json::Value> {
    let mut entries = Vec::new();
    let seq_prefix = format!("{}- ", " ".repeat(key_indent));
    let entry_indent = key_indent + 2;

    while *i < lines.len() {
        let line = lines[*i];
        if line.starts_with("--- !u!") {
            break;
        }
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            *i += 1;
            continue;
        }
        let indent = line.len() - trimmed.len();

        // Only process lines that are entries at our level
        if !line.starts_with(&seq_prefix) {
            if indent <= key_indent {
                break;
            }
            *i += 1;
            continue;
        }

        // Start a new entry
        let mut entry = serde_json::Map::new();

        // Strip "- " prefix to get first content
        let first_content = &line[seq_prefix.len()..];
        *i += 1;

        // Synthesize a line at entry_indent for regex matching
        let synth_line = format!("{}{}", " ".repeat(entry_indent), first_content);

        if let Some(caps) = EMPTY_KEY_RE.captures(&synth_line) {
            let clean_name = caps.get(3).unwrap().as_str().to_string();
            if !METADATA_PROPERTIES.contains(&clean_name.as_str()) {
                // Peek at next non-empty line to determine sub-structure type
                let mut peek = *i;
                while peek < lines.len() {
                    let pt = lines[peek].trim_start();
                    if !pt.is_empty() {
                        break;
                    }
                    peek += 1;
                }

                if peek < lines.len() && !lines[peek].starts_with("--- !u!") {
                    let next_trimmed = lines[peek].trim_start();
                    let next_indent = lines[peek].len() - next_trimmed.len();
                    let sub_seq_prefix = format!("{}- ", " ".repeat(entry_indent));

                    if lines[peek].starts_with(&sub_seq_prefix) {
                        // Sub-sequence under this key
                        entry.insert(clean_name, serde_json::Value::Array(
                            parse_sequence(lines, i, entry_indent, guid_cache)
                        ));
                    } else if next_indent > entry_indent {
                        // Sub-map under this key
                        entry.insert(clean_name, serde_json::Value::Object(
                            parse_map(lines, i, next_indent, guid_cache)
                        ));
                    } else {
                        // Empty value
                        entry.insert(clean_name, serde_json::json!(""));
                    }
                } else {
                    entry.insert(clean_name, serde_json::json!(""));
                }
            }
        } else if let Some(caps) = PROP_RE.captures(&synth_line) {
            if let (Some(name), Some(value)) = (caps.get(2), caps.get(3)) {
                let clean_name = name.as_str().to_string();
                if !METADATA_PROPERTIES.contains(&clean_name.as_str()) {
                    let mut clean_value = value.as_str().trim().to_string();
                    collect_multiline_value(&mut clean_value, lines, i);
                    let resolved = resolve_guid_in_value(&clean_value, guid_cache);
                    entry.insert(clean_name, serde_json::json!(resolved));
                }
            }
        }

        // Parse remaining sibling keys within this entry at entry_indent
        let sibling_props = parse_map(lines, i, entry_indent, guid_cache);
        for (k, v) in sibling_props {
            entry.insert(k, v);
        }

        entries.push(serde_json::Value::Object(entry));
    }

    entries
}

/// Extract properties from a pre-extracted block body (no content scanning needed).
/// Uses recursive descent to handle nested maps and sequences.
pub(crate) fn extract_properties_from_block(block: &str, guid_cache: &HashMap<String, String>) -> serde_json::Value {
    let lines: Vec<&str> = block.lines().collect();
    let mut i = 0;

    // Skip preamble: header line (--- !u!) and type-name line (TypeName:) at indent 0
    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if trimmed.is_empty() || lines[i].starts_with("--- !u!") {
            i += 1;
            continue;
        }
        let indent = lines[i].len() - trimmed.len();
        if indent == 0 {
            i += 1;
            continue;
        }
        break;
    }

    serde_json::Value::Object(parse_map(&lines, &mut i, 2, guid_cache))
}

pub(crate) fn extract_properties(content: &str, file_id: &str, class_id: u32, guid_cache: &HashMap<String, String>) -> serde_json::Value {
    let header = format!("--- !u!{} &{}", class_id, file_id);
    let block = match extract_block(content, &header) {
        Some(b) => b,
        None => return serde_json::json!({}),
    };
    extract_properties_from_block(block, guid_cache)
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

    #[test]
    fn test_extract_properties_yaml_sequence() {
        let content = "--- !u!13 &1\nInputManager:\n  serializedVersion: 2\n  m_Axes:\n  - serializedVersion: 3\n    m_Name: Horizontal\n    sensitivity: 3\n    dead: 0.001\n  - serializedVersion: 3\n    m_Name: Vertical\n    sensitivity: 3\n    dead: 0.001\n";
        let props = extract_properties(content, "1", 13, &HashMap::new());
        let obj = props.as_object().unwrap();
        // serializedVersion should still be a top-level property
        assert!(obj.contains_key("serializedVersion"));
        // Axes should be an array of 2 entries
        let axes = obj.get("Axes").unwrap().as_array().unwrap();
        assert_eq!(axes.len(), 2);
        let entry0 = axes[0].as_object().unwrap();
        assert_eq!(entry0.get("Name").unwrap().as_str().unwrap(), "Horizontal");
        assert_eq!(entry0.get("sensitivity").unwrap().as_str().unwrap(), "3");
        assert_eq!(entry0.get("dead").unwrap().as_str().unwrap(), "0.001");
        let entry1 = axes[1].as_object().unwrap();
        assert_eq!(entry1.get("Name").unwrap().as_str().unwrap(), "Vertical");
        assert_eq!(entry1.get("sensitivity").unwrap().as_str().unwrap(), "3");
    }

    #[test]
    fn test_extract_properties_yaml_sequence_with_guid() {
        let mut cache = HashMap::new();
        cache.insert(
            "aabbccdd11223344aabbccdd11223344".to_string(),
            "Assets/Scripts/MyScript.cs".to_string(),
        );
        let content = "--- !u!114 &1\nMonoBehaviour:\n  m_Items:\n  - m_Script: {fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}\n    m_Name: First\n  - m_Script: {fileID: 0}\n    m_Name: Second\n";
        let props = extract_properties(content, "1", 114, &cache);
        let obj = props.as_object().unwrap();
        let items = obj.get("Items").unwrap().as_array().unwrap();
        assert_eq!(items.len(), 2);
        let first = items[0].as_object().unwrap();
        let script_val = first.get("Script").unwrap().as_str().unwrap();
        assert!(script_val.contains("-> Assets/Scripts/MyScript.cs"));
        assert_eq!(first.get("Name").unwrap().as_str().unwrap(), "First");
        let second = items[1].as_object().unwrap();
        assert_eq!(second.get("Name").unwrap().as_str().unwrap(), "Second");
    }

    #[test]
    fn test_extract_properties_yaml_sequence_single_entry() {
        let content = "--- !u!13 &1\nManager:\n  m_Items:\n  - m_Name: OnlyOne\n    value: 42\n  m_Other: done\n";
        let props = extract_properties(content, "1", 13, &HashMap::new());
        let obj = props.as_object().unwrap();
        let items = obj.get("Items").unwrap().as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].as_object().unwrap().get("Name").unwrap().as_str().unwrap(), "OnlyOne");
        // m_Other should still be captured as a top-level property
        assert_eq!(obj.get("Other").unwrap().as_str().unwrap(), "done");
    }

    #[test]
    fn test_extract_components_indexed_matches_original() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 200}\n  - component: {fileID: 300}\n\
--- !u!4 &200\nTransform:\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n\
--- !u!114 &300\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}\n  m_Enabled: 1\n";
        let mut cache = HashMap::new();
        cache.insert(
            "aabbccdd11223344aabbccdd11223344".to_string(),
            "Assets/Scripts/PlayerController.cs".to_string(),
        );
        let config = ComponentConfig::default();

        // Original path
        let original = extract_components_with_config(content, "100", &cache, &config);

        // Indexed path
        let index = BlockIndex::new(content);
        let indexed = extract_components_indexed(&index, "100", &cache, &config);

        assert_eq!(original.len(), indexed.len());
        for (o, i) in original.iter().zip(indexed.iter()) {
            assert_eq!(o.type_name, i.type_name);
            assert_eq!(o.class_id, i.class_id);
            assert_eq!(o.file_id, i.file_id);
            assert_eq!(o.script_name, i.script_name);
            assert_eq!(o.script_guid, i.script_guid);
            assert_eq!(o.script_path, i.script_path);
        }
    }

    #[test]
    fn test_extract_properties_nested_sequence() {
        // PPtrCurves pattern: array-within-array (sequence entry has a sub-sequence)
        let content = "\
--- !u!74 &7400000
AnimationClip:
  m_Name: TestAnim
  m_PPtrCurves:
  - curve:
    - time: 0
      value: {fileID: 21300000, guid: abcd1234abcd1234abcd1234abcd1234, type: 3}
    - time: 0.5
      value: {fileID: 21300002, guid: abcd1234abcd1234abcd1234abcd1234, type: 3}
    attribute: m_Sprite
    path:
    classID: 212
    script: {fileID: 0}
  m_SampleRate: 60
";
        let props = extract_properties(content, "7400000", 74, &HashMap::new());
        let obj = props.as_object().unwrap();
        assert_eq!(obj.get("Name").unwrap().as_str().unwrap(), "TestAnim");
        assert_eq!(obj.get("SampleRate").unwrap().as_str().unwrap(), "60");

        let pptr_curves = obj.get("PPtrCurves").unwrap().as_array().unwrap();
        assert_eq!(pptr_curves.len(), 1);

        let entry = pptr_curves[0].as_object().unwrap();
        assert_eq!(entry.get("attribute").unwrap().as_str().unwrap(), "m_Sprite");
        assert_eq!(entry.get("classID").unwrap().as_str().unwrap(), "212");
        assert_eq!(entry.get("path").unwrap().as_str().unwrap(), "");

        // The "curve" key should be a nested array
        let curve = entry.get("curve").unwrap().as_array().unwrap();
        assert_eq!(curve.len(), 2);
        assert_eq!(curve[0].as_object().unwrap().get("time").unwrap().as_str().unwrap(), "0");
        assert!(curve[0].as_object().unwrap().contains_key("value"));
        assert_eq!(curve[1].as_object().unwrap().get("time").unwrap().as_str().unwrap(), "0.5");
    }

    #[test]
    fn test_extract_properties_nested_map_in_sequence() {
        // TexEnvs pattern: block map within sequence entry
        let content = "\
--- !u!21 &2100000
Material:
  m_Name: TestMat
  m_TexEnvs:
  - _BumpMap:
      m_Texture: {fileID: 0}
      m_Scale: {x: 1, y: 1}
      m_Offset: {x: 0, y: 0}
  - _MainTex:
      m_Texture: {fileID: 2800000, guid: abcd1234abcd1234abcd1234abcd1234, type: 3}
      m_Scale: {x: 1, y: 1}
      m_Offset: {x: 0, y: 0}
  m_Floats:
  - _Cutoff: 0.5
";
        let props = extract_properties(content, "2100000", 21, &HashMap::new());
        let obj = props.as_object().unwrap();
        assert_eq!(obj.get("Name").unwrap().as_str().unwrap(), "TestMat");

        let tex_envs = obj.get("TexEnvs").unwrap().as_array().unwrap();
        assert_eq!(tex_envs.len(), 2);

        // First entry: _BumpMap with nested sub-map
        let bump_entry = tex_envs[0].as_object().unwrap();
        let bump_map = bump_entry.get("_BumpMap").unwrap().as_object().unwrap();
        assert_eq!(bump_map.get("Texture").unwrap().as_str().unwrap(), "{fileID: 0}");
        assert_eq!(bump_map.get("Scale").unwrap().as_str().unwrap(), "{x: 1, y: 1}");
        assert_eq!(bump_map.get("Offset").unwrap().as_str().unwrap(), "{x: 0, y: 0}");

        // Second entry: _MainTex
        let main_entry = tex_envs[1].as_object().unwrap();
        let main_tex = main_entry.get("_MainTex").unwrap().as_object().unwrap();
        assert!(main_tex.get("Texture").unwrap().as_str().unwrap().contains("fileID: 2800000"));

        // m_Floats should still be a sibling array
        let floats = obj.get("Floats").unwrap().as_array().unwrap();
        assert_eq!(floats.len(), 1);
    }

    #[test]
    fn test_extract_properties_deep_nested_map() {
        // GlyphPairAdjustmentRecords: 3-level deep nesting
        let content = "\
--- !u!128 &12800000
Font:
  m_Name: TestFont
  m_GlyphPairAdjustmentRecords:
    m_GlyphPairAdjustmentRecords:
    - m_FirstAdjustmentRecord:
        m_GlyphIndex: 69
        m_GlyphValueRecord:
          m_XPlacement: 0
          m_YPlacement: 0
          m_XAdvance: -4.57
          m_YAdvance: 0
      m_SecondAdjustmentRecord:
        m_GlyphIndex: 55
        m_GlyphValueRecord:
          m_XPlacement: 0
          m_YPlacement: 0
          m_XAdvance: 0
          m_YAdvance: 0
      m_FeatureLookupFlags: 0
  m_FontSize: 12
";
        let props = extract_properties(content, "12800000", 128, &HashMap::new());
        let obj = props.as_object().unwrap();
        assert_eq!(obj.get("Name").unwrap().as_str().unwrap(), "TestFont");
        assert_eq!(obj.get("FontSize").unwrap().as_str().unwrap(), "12");

        // Navigate into the 3-level structure
        let outer = obj.get("GlyphPairAdjustmentRecords").unwrap().as_object().unwrap();
        let records = outer.get("GlyphPairAdjustmentRecords").unwrap().as_array().unwrap();
        assert_eq!(records.len(), 1);

        let record = records[0].as_object().unwrap();
        let first = record.get("FirstAdjustmentRecord").unwrap().as_object().unwrap();
        assert_eq!(first.get("GlyphIndex").unwrap().as_str().unwrap(), "69");

        let value_record = first.get("GlyphValueRecord").unwrap().as_object().unwrap();
        assert_eq!(value_record.get("XPlacement").unwrap().as_str().unwrap(), "0");
        assert_eq!(value_record.get("XAdvance").unwrap().as_str().unwrap(), "-4.57");

        let second = record.get("SecondAdjustmentRecord").unwrap().as_object().unwrap();
        assert_eq!(second.get("GlyphIndex").unwrap().as_str().unwrap(), "55");

        assert_eq!(record.get("FeatureLookupFlags").unwrap().as_str().unwrap(), "0");
    }

    #[test]
    fn test_extract_properties_negative_file_id() {
        let content = "--- !u!114 &-6804560824838403692\nMonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_Enabled: 1\n  Prototype:\n    MaxHealth: 500\n    Speed: 12.5\n";
        let props = extract_properties(content, "-6804560824838403692", 114, &HashMap::new());
        let obj = props.as_object().unwrap();
        assert!(obj.contains_key("Enabled"), "Should find Enabled property");
        let proto = obj.get("Prototype").unwrap().as_object().unwrap();
        assert_eq!(proto.get("MaxHealth").unwrap().as_str().unwrap(), "500");
        assert_eq!(proto.get("Speed").unwrap().as_str().unwrap(), "12.5");
    }

    #[test]
    fn test_extract_components_negative_file_id() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: -999}\n  m_Name: TestObj\n  m_IsActive: 1\n\
--- !u!114 &-999\nMonoBehaviour:\n  m_Enabled: 1\n  m_Script: {fileID: 11500000, guid: aabbccdd11223344aabbccdd11223344, type: 3}\n  Prototype:\n    MaxHealth: 42\n";
        let cache = HashMap::new();
        let components = extract_components(content, "100", &cache);
        assert_eq!(components.len(), 1, "Should find the component with negative fileID");
        assert_eq!(components[0].file_id, "-999");
    }

    #[test]
    fn test_parse_all_blocks_negative_file_id() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Name: TestObj\n\
--- !u!114 &-6804560824838403692\nMonoBehaviour:\n  m_Enabled: 1\n";
        let blocks = crate::scanner::parser::UnityYamlParser::parse_all_blocks(content);
        assert_eq!(blocks.len(), 2);
        let neg_block = blocks.iter().find(|(_, id, _)| id == "-6804560824838403692");
        assert!(neg_block.is_some(), "Should find block with negative fileID");
        let (class_id, _, _) = neg_block.unwrap();
        assert_eq!(*class_id, 114);
    }
}
