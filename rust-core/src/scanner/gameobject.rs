use regex::Regex;
use std::sync::LazyLock;
use super::config::ComponentConfig;
use super::parser::BlockIndex;

// Cached regexes — compiled once, reused across all calls
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"m_TagString:\s*([^\n]+)").unwrap()
});
static LAYER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"m_Layer:\s*(\d+)").unwrap()
});
static FATHER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"m_Father:\s*\{fileID:\s*(\d+)\}").unwrap()
});
static CHILDREN_SECTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"m_Children:[\s\S]*?\[[\s\S]*?\]").unwrap()
});
static CHILD_REF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{fileID:\s*(\d+)\}").unwrap()
});
static COMP_REF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"component:\s*\{fileID:\s*(\d+)\}").unwrap()
});

/// Extract a block from content by header
fn extract_block<'a>(content: &'a str, header: &str) -> Option<&'a str> {
    let start_pos = content.find(header)?;
    let after_header = &content[start_pos..];

    // Find the end of this block (start of next block or end of content)
    let end_offset = after_header[header.len()..]
        .find("--- !u!")
        .map(|pos| header.len() + pos)
        .unwrap_or(after_header.len());

    Some(&after_header[..end_offset])
}

/// Extract metadata from a GameObject block
pub fn extract_metadata(content: &str, file_id: &str) -> (String, u32, Option<String>, Vec<String>) {
    extract_metadata_with_config(content, file_id, &ComponentConfig::default())
}

/// Extract metadata from a GameObject block with custom config
pub fn extract_metadata_with_config(content: &str, file_id: &str, config: &ComponentConfig) -> (String, u32, Option<String>, Vec<String>) {
    let header = format!("--- !u!{} &{}", config.gameobject_class_id, file_id);
    let go_block = match extract_block(content, &header) {
        Some(block) => block,
        None => return ("Untagged".to_string(), 0, None, Vec::new()),
    };

    let tag = extract_tag(go_block);
    let layer = extract_layer(go_block);
    let (parent_id, children) = extract_hierarchy_with_config(content, file_id, config);

    (tag, layer, parent_id, children)
}

pub fn extract_tag(block: &str) -> String {
    TAG_RE.captures(block)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_else(|| "Untagged".to_string())
}

pub fn extract_layer(block: &str) -> u32 {
    LAYER_RE.captures(block)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0)
}

#[allow(dead_code)]
fn extract_hierarchy(content: &str, file_id: &str) -> (Option<String>, Vec<String>) {
    extract_hierarchy_with_config(content, file_id, &ComponentConfig::default())
}

fn extract_hierarchy_with_config(content: &str, file_id: &str, config: &ComponentConfig) -> (Option<String>, Vec<String>) {
    // Find the GameObject block
    let go_header = format!("--- !u!{} &{}", config.gameobject_class_id, file_id);
    let go_block = match extract_block(content, &go_header) {
        Some(block) => block,
        None => return (None, Vec::new()),
    };

    // Get component refs
    let comp_refs: Vec<String> = COMP_REF_RE
        .captures_iter(go_block)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();

    // Find hierarchy provider components (Transform-like) among the component refs
    for ref_id in &comp_refs {
        for &class_id in &config.hierarchy_providers {
            let header = format!("--- !u!{} &{}", class_id, ref_id);
            if let Some(block) = extract_block(content, &header) {
                let parent_id = extract_parent_from_transform(block);
                let children = extract_children_from_transform(block);
                return (parent_id, children);
            }
        }
    }

    (None, Vec::new())
}

/// Extract metadata using pre-indexed block lookup (O(1) per block).
pub fn extract_metadata_indexed(
    index: &BlockIndex,
    file_id: &str,
    config: &ComponentConfig,
) -> (String, u32, Option<String>, Vec<String>) {
    let go_block = match index.get_by_class_and_id(config.gameobject_class_id, file_id) {
        Some(block) => block,
        None => return ("Untagged".to_string(), 0, None, Vec::new()),
    };

    let tag = extract_tag(go_block);
    let layer = extract_layer(go_block);
    let (parent_id, children) = extract_hierarchy_indexed(index, go_block, config);

    (tag, layer, parent_id, children)
}

fn extract_hierarchy_indexed(
    index: &BlockIndex,
    go_block: &str,
    config: &ComponentConfig,
) -> (Option<String>, Vec<String>) {
    let comp_refs: Vec<&str> = COMP_REF_RE
        .captures_iter(go_block)
        .filter_map(|c| c.get(1).map(|m| m.as_str()))
        .collect();

    for ref_id in &comp_refs {
        if let Some((class_id, block)) = index.get(ref_id) {
            if config.hierarchy_providers.contains(&class_id) {
                let parent_id = extract_parent_from_transform(block);
                let children = extract_children_from_transform(block);
                return (parent_id, children);
            }
        }
    }

    (None, Vec::new())
}

fn extract_parent_from_transform(block: &str) -> Option<String> {
    FATHER_RE.captures(block)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|s| s != "0")
}

fn extract_children_from_transform(block: &str) -> Vec<String> {
    if let Some(m) = CHILDREN_SECTION_RE.find(block) {
        let children_section = m.as_str();
        return CHILD_REF_RE
            .captures_iter(children_section)
            .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
            .filter(|s| s != "0")
            .collect();
    }

    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_tag() {
        let block = "m_TagString: MainCamera\nm_Layer: 5";
        assert_eq!(extract_tag(block), "MainCamera");
    }

    #[test]
    fn test_extract_layer() {
        let block = "m_TagString: MainCamera\nm_Layer: 5";
        assert_eq!(extract_layer(block), 5);
    }

    #[test]
    fn test_extract_metadata_indexed_matches_original() {
        let content = "\
--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {fileID: 200}\n  m_Layer: 5\n  m_Name: TestObj\n  m_TagString: Player\n  m_IsActive: 1\n\
--- !u!4 &200\nTransform:\n  m_Father: {fileID: 300}\n  m_Children:\n  - {fileID: 400}\n  - {fileID: 500}\n";
        let config = ComponentConfig::default();

        // Original path
        let original = extract_metadata_with_config(content, "100", &config);

        // Indexed path
        let index = BlockIndex::new(content);
        let indexed = extract_metadata_indexed(&index, "100", &config);

        assert_eq!(original.0, indexed.0); // tag
        assert_eq!(original.1, indexed.1); // layer
        assert_eq!(original.2, indexed.2); // parent_id
        assert_eq!(original.3, indexed.3); // children
    }
}
