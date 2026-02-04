use regex::Regex;
use crate::common::GameObject;
use super::config::ComponentConfig;

/// Unity YAML parser for extracting blocks and data
pub struct UnityYamlParser;

impl UnityYamlParser {
    /// Extract all GameObjects from Unity YAML content
    pub fn extract_gameobjects(content: &str) -> Vec<GameObject> {
        Self::extract_gameobjects_with_config(content, &ComponentConfig::default())
    }

    /// Extract all GameObjects from Unity YAML content with custom config
    pub fn extract_gameobjects_with_config(content: &str, config: &ComponentConfig) -> Vec<GameObject> {
        // Use (?s) for DOTALL mode to match across newlines
        let pattern_str = format!(
            r"(?s)--- !u!{} &(\d+)\s*\nGameObject:\s*\n.*?m_Name:\s*([^\n]+).*?m_IsActive:\s*(\d)",
            config.gameobject_class_id
        );
        let pattern = Regex::new(&pattern_str).expect("Invalid regex pattern");

        pattern
            .captures_iter(content)
            .map(|cap| {
                GameObject {
                    file_id: cap.get(1).map_or("", |m| m.as_str()).to_string(),
                    name: cap.get(2).map_or("", |m| m.as_str()).trim().to_string(),
                    active: cap.get(3).map_or("0", |m| m.as_str()) == "1",
                    match_score: None,
                }
            })
            .collect()
    }

    /// Extract a specific block by class type and file ID
    pub fn extract_block(content: &str, class_id: u32, file_id: &str) -> Option<String> {
        let header = format!("--- !u!{} &{}", class_id, file_id);
        let start_pos = content.find(&header)?;
        let after_header = &content[start_pos..];

        // Find the end of this block (start of next block or end of content)
        let end_offset = after_header[header.len()..].find("--- !u!")
            .map(|pos| header.len() + pos)
            .unwrap_or(after_header.len());

        Some(after_header[..end_offset].to_string())
    }

    /// Extract GameObject block by file ID
    pub fn extract_gameobject_block(content: &str, file_id: &str) -> Option<String> {
        Self::extract_block(content, 1, file_id)
    }

    /// Parse component references from a GameObject block
    pub fn parse_component_refs(go_block: &str) -> Vec<String> {
        let pattern = Regex::new(r"component:\s*\{fileID:\s*(\d+)\}")
            .expect("Invalid regex");

        pattern
            .captures_iter(go_block)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
            .collect()
    }

    /// Get all blocks from content, indexed by file ID
    pub fn parse_all_blocks(content: &str) -> Vec<(u32, String, String)> {
        let pattern = Regex::new(r"--- !u!(\d+) &(\d+)\s*\n")
            .expect("Invalid regex");

        let mut blocks = Vec::new();
        let mut pending: Option<(u32, String, usize)> = None;

        for cap in pattern.captures_iter(content) {
            let full_match = cap.get(0).unwrap();
            let start = full_match.start();

            // Close previous block
            if let Some((class_id, file_id, block_start)) = pending.take() {
                let block_content = &content[block_start..start];
                blocks.push((class_id, file_id, block_content.to_string()));
            }

            let class_id: u32 = cap.get(1)
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            let file_id = cap.get(2).map_or("", |m| m.as_str()).to_string();

            pending = Some((class_id, file_id, full_match.end()));
        }

        // Close last block
        if let Some((class_id, file_id, block_start)) = pending {
            let block_content = &content[block_start..];
            blocks.push((class_id, file_id, block_content.to_string()));
        }

        blocks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_gameobjects() {
        let content = r#"
--- !u!1 &1234567890
GameObject:
  m_ObjectHideFlags: 0
  m_Name: TestObject
  m_IsActive: 1
  m_Layer: 0
"#;
        let objects = UnityYamlParser::extract_gameobjects(content);
        assert_eq!(objects.len(), 1);
        assert_eq!(objects[0].name, "TestObject");
        assert_eq!(objects[0].file_id, "1234567890");
        assert!(objects[0].active);
    }

    #[test]
    fn test_parse_component_refs() {
        let block = r#"
  m_Component:
  - component: {fileID: 111}
  - component: {fileID: 222}
  - component: {fileID: 333}
"#;
        let refs = UnityYamlParser::parse_component_refs(block);
        assert_eq!(refs, vec!["111", "222", "333"]);
    }
}
