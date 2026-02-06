use regex::Regex;
use super::config::ComponentConfig;

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

fn extract_tag(block: &str) -> String {
    let re = Regex::new(r"m_TagString:\s*([^\n]+)").ok();
    re.and_then(|r| {
        r.captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
    })
    .unwrap_or_else(|| "Untagged".to_string())
}

fn extract_layer(block: &str) -> u32 {
    let re = Regex::new(r"m_Layer:\s*(\d+)").ok();
    re.and_then(|r| {
        r.captures(block)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
    })
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
    let comp_ref_re = Regex::new(r"component:\s*\{fileID:\s*(\d+)\}").unwrap();
    let comp_refs: Vec<String> = comp_ref_re
        .captures_iter(go_block)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();

    // Find hierarchy provider components (Transform-like) among the component refs
    for ref_id in &comp_refs {
        for &class_id in &config.hierarchy_providers {
            let header = format!("--- !u!{} &{}", class_id, ref_id);
            if let Some(block) = extract_block(content, &header) {
                // Extract parent and children from this hierarchy component
                let parent_id = extract_parent_from_transform(block);
                let children = extract_children_from_transform(block);
                return (parent_id, children);
            }
        }
    }

    (None, Vec::new())
}

fn extract_parent_from_transform(block: &str) -> Option<String> {
    let re = Regex::new(r"m_Father:\s*\{fileID:\s*(\d+)\}").ok()?;
    re.captures(block)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|s| s != "0")
}

fn extract_children_from_transform(block: &str) -> Vec<String> {
    let re = Regex::new(r"m_Children:[\s\S]*?\[[\s\S]*?\]").ok();

    if let Some(re) = re {
        if let Some(m) = re.find(block) {
            let children_section = m.as_str();
            let child_re = Regex::new(r"\{fileID:\s*(\d+)\}").unwrap();
            return child_re
                .captures_iter(children_section)
                .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
                .filter(|s| s != "0")
                .collect();
        }
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
}
