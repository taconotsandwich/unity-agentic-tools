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
        // Use \n (not \s*\n) after fileID to reject stripped blocks like "--- !u!1 &123 stripped"
        // which lack m_Name/m_IsActive and cause the lazy .*? to bleed into the next block
        let pattern_str = format!(
            r"(?s)--- !u!{} &(\d+)\nGameObject:\s*\n.*?m_Name:\s*([^\n]+).*?m_IsActive:\s*(\d)",
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

    /// Extract all non-GameObject root blocks from .asset files.
    /// Returns (class_id, file_id, block_content) for each block where class_id != 1.
    pub fn extract_asset_objects(content: &str) -> Vec<(u32, String, String)> {
        let blocks = Self::parse_all_blocks(content);
        blocks.into_iter()
            .filter(|(class_id, _, _)| *class_id != 1)
            .collect()
    }

    /// Get all blocks from content, indexed by file ID
    pub fn parse_all_blocks(content: &str) -> Vec<(u32, String, String)> {
        let pattern = Regex::new(r"--- !u!(\d+) &(\d+)(?: stripped)?\s*\n")
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
    fn test_extract_asset_objects() {
        let content = r#"%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 13312, guid: 0000000000000000e000000000000000, type: 0}
  m_Name: Sign_1
  m_Sprite: {fileID: 21300000, guid: 4991c79370c017c48b0b21e681ecd400, type: 3}
"#;
        let objects = UnityYamlParser::extract_asset_objects(content);
        assert_eq!(objects.len(), 1);
        assert_eq!(objects[0].0, 114); // class_id
        assert_eq!(objects[0].1, "11400000"); // file_id
        assert!(objects[0].2.contains("m_Name: Sign_1"));
    }

    #[test]
    fn test_extract_asset_objects_filters_gameobjects() {
        let content = r#"%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100
GameObject:
  m_Name: SomeObject
  m_IsActive: 1
--- !u!114 &200
MonoBehaviour:
  m_Name: MyAsset
"#;
        let objects = UnityYamlParser::extract_asset_objects(content);
        // Should only include the MonoBehaviour, not the GameObject
        assert_eq!(objects.len(), 1);
        assert_eq!(objects[0].0, 114);
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

    /// Verify that pre-normalized content (CRLF → LF) parses correctly.
    /// This simulates what read_unity_file does before content reaches the parser.
    #[test]
    fn test_extract_gameobjects_after_crlf_normalization() {
        // Simulate a Windows-origin Unity file with CRLF line endings
        let crlf_content = "--- !u!1 &1234567890\r\nGameObject:\r\n  m_ObjectHideFlags: 0\r\n  m_Name: CRLFObject\r\n  m_IsActive: 1\r\n  m_Layer: 0\r\n";
        // This would fail without normalization
        let normalized = crlf_content.replace("\r\n", "\n");
        let objects = UnityYamlParser::extract_gameobjects(&normalized);
        assert_eq!(objects.len(), 1);
        assert_eq!(objects[0].name, "CRLFObject");
        assert!(objects[0].active);
    }

    #[test]
    fn test_parse_all_blocks_after_crlf_normalization() {
        let crlf_content = "--- !u!1 &100\r\nGameObject:\r\n  m_Name: Obj1\r\n--- !u!114 &200\r\nMonoBehaviour:\r\n  m_Name: Script1\r\n";
        let normalized = crlf_content.replace("\r\n", "\n");
        let blocks = UnityYamlParser::parse_all_blocks(&normalized);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].0, 1);   // class_id
        assert_eq!(blocks[1].0, 114); // class_id
    }

    /// Confirm that raw CRLF content FAILS without normalization (documents the bug).
    #[test]
    fn test_extract_gameobjects_fails_on_raw_crlf() {
        let crlf_content = "--- !u!1 &1234567890\r\nGameObject:\r\n  m_ObjectHideFlags: 0\r\n  m_Name: CRLFObject\r\n  m_IsActive: 1\r\n";
        let objects = UnityYamlParser::extract_gameobjects(crlf_content);
        assert_eq!(objects.len(), 0, "Raw CRLF should fail to parse — regex uses literal \\n");
    }
}
