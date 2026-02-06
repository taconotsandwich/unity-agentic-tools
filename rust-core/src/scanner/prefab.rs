use regex::Regex;
use std::collections::HashMap;

use crate::common::PrefabInstanceInfo;

/// Extract all PrefabInstance blocks (!u!1001) from Unity YAML content
pub fn extract_prefab_instances(
    content: &str,
    guid_cache: &HashMap<String, String>,
) -> Vec<PrefabInstanceInfo> {
    let header_re = Regex::new(r"--- !u!1001 &(\d+)\s*\n").expect("Invalid regex");

    header_re
        .captures_iter(content)
        .filter_map(|cap| {
            let file_id = cap.get(1)?.as_str().to_string();
            let block = extract_prefab_block(content, &file_id)?;

            let name = extract_name_from_modifications(&block)
                .unwrap_or_else(|| "<unnamed>".to_string());
            let source_guid = extract_source_guid(&block).unwrap_or_default();
            let source_prefab = guid_cache.get(&source_guid).cloned();
            let modifications_count = count_modifications(&block);

            Some(PrefabInstanceInfo {
                name,
                file_id,
                source_guid,
                source_prefab,
                modifications_count,
            })
        })
        .collect()
}

/// Extract the block content for a PrefabInstance by file ID
fn extract_prefab_block(content: &str, file_id: &str) -> Option<String> {
    let header = format!("--- !u!1001 &{}", file_id);
    let start_pos = content.find(&header)?;
    let after_header = &content[start_pos..];

    let end_offset = after_header[header.len()..]
        .find("--- !u!")
        .map(|pos| header.len() + pos)
        .unwrap_or(after_header.len());

    Some(after_header[..end_offset].to_string())
}

/// Extract the display name from m_Modifications (looks for propertyPath: m_Name)
pub fn extract_name_from_modifications(block: &str) -> Option<String> {
    let lines: Vec<&str> = block.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if line.contains("propertyPath: m_Name") {
            // The value is on the next line
            if let Some(next_line) = lines.get(i + 1) {
                let value_re = Regex::new(r"value:\s*(.+)").ok()?;
                if let Some(caps) = value_re.captures(next_line) {
                    let name = caps.get(1)?.as_str().trim().to_string();
                    if !name.is_empty() {
                        return Some(name);
                    }
                }
            }
        }
    }
    None
}

/// Extract the source prefab GUID from m_SourcePrefab line
pub fn extract_source_guid(block: &str) -> Option<String> {
    let re = Regex::new(r"m_SourcePrefab:\s*\{[^}]*guid:\s*([a-f0-9]{32})").ok()?;
    re.captures(block)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}

/// Count the number of modifications (- target: entries)
pub fn count_modifications(block: &str) -> u32 {
    block.lines()
        .filter(|line| line.trim_start().starts_with("- target:"))
        .count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    const PREFAB_BLOCK: &str = r#"--- !u!1001 &700000
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: 100000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}
      propertyPath: m_Name
      value: MyEnemy
      objectReference: {fileID: 0}
    - target: {fileID: 400000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}
      propertyPath: m_LocalPosition.x
      value: 5
      objectReference: {fileID: 0}
    - target: {fileID: 400000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}
      propertyPath: m_LocalPosition.y
      value: 0
      objectReference: {fileID: 0}
    m_RemovedComponents: []
  m_SourcePrefab: {fileID: 100100000, guid: a1b2c3d4e5f6789012345678abcdef12, type: 3}
"#;

    #[test]
    fn test_extract_name_from_modifications() {
        let name = extract_name_from_modifications(PREFAB_BLOCK);
        assert_eq!(name, Some("MyEnemy".to_string()));
    }

    #[test]
    fn test_extract_name_missing() {
        let block = "--- !u!1001 &123\nPrefabInstance:\n  m_Modification:\n    m_Modifications: []\n";
        let name = extract_name_from_modifications(block);
        assert_eq!(name, None);
    }

    #[test]
    fn test_extract_source_guid() {
        let guid = extract_source_guid(PREFAB_BLOCK);
        assert_eq!(guid, Some("a1b2c3d4e5f6789012345678abcdef12".to_string()));
    }

    #[test]
    fn test_count_modifications() {
        let count = count_modifications(PREFAB_BLOCK);
        assert_eq!(count, 3);
    }

    #[test]
    fn test_extract_prefab_instances() {
        let content = format!(
            "%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &500000\nGameObject:\n  m_Name: Camera\n  m_IsActive: 1\n{}",
            PREFAB_BLOCK
        );
        let instances = extract_prefab_instances(&content, &HashMap::new());
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].name, "MyEnemy");
        assert_eq!(instances[0].file_id, "700000");
        assert_eq!(instances[0].source_guid, "a1b2c3d4e5f6789012345678abcdef12");
        assert_eq!(instances[0].source_prefab, None);
        assert_eq!(instances[0].modifications_count, 3);
    }

    #[test]
    fn test_extract_prefab_instances_with_guid_cache() {
        let content = format!(
            "%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n{}",
            PREFAB_BLOCK
        );
        let mut cache = HashMap::new();
        cache.insert(
            "a1b2c3d4e5f6789012345678abcdef12".to_string(),
            "Assets/Prefabs/Enemy.prefab".to_string(),
        );
        let instances = extract_prefab_instances(&content, &cache);
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].source_prefab, Some("Assets/Prefabs/Enemy.prefab".to_string()));
    }

    #[test]
    fn test_no_prefab_instances() {
        let content = "%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &100\nGameObject:\n  m_Name: Cube\n  m_IsActive: 1\n";
        let instances = extract_prefab_instances(content, &HashMap::new());
        assert!(instances.is_empty());
    }

    #[test]
    fn test_multiple_prefab_instances() {
        let second_block = r#"--- !u!1001 &800000
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: 200000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}
      propertyPath: m_Name
      value: MyAlly
      objectReference: {fileID: 0}
    m_RemovedComponents: []
  m_SourcePrefab: {fileID: 100100000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}
"#;
        let content = format!(
            "%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n{}{}",
            PREFAB_BLOCK, second_block
        );
        let instances = extract_prefab_instances(&content, &HashMap::new());
        assert_eq!(instances.len(), 2);
        assert_eq!(instances[0].name, "MyEnemy");
        assert_eq!(instances[0].file_id, "700000");
        assert_eq!(instances[1].name, "MyAlly");
        assert_eq!(instances[1].file_id, "800000");
    }

    #[test]
    fn test_unnamed_prefab_instance() {
        let block = "--- !u!1001 &900000\nPrefabInstance:\n  m_Modification:\n    m_Modifications:\n    - target: {fileID: 100, guid: cccccccccccccccccccccccccccccccc, type: 3}\n      propertyPath: m_LocalPosition.x\n      value: 0\n      objectReference: {fileID: 0}\n    m_RemovedComponents: []\n  m_SourcePrefab: {fileID: 100100000, guid: cccccccccccccccccccccccccccccccc, type: 3}\n";
        let instances = extract_prefab_instances(block, &HashMap::new());
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].name, "<unnamed>");
    }
}
