pub mod parser;
pub mod gameobject;
pub mod component;
pub mod config;
pub mod prefab;

use napi_derive::napi;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::common::{self, Component, FindResult, GameObject, GameObjectDetail, InspectOptions, PrefabInstanceInfo, SceneInspection, ScanOptions, PaginationOptions, PaginatedInspection};
use parser::UnityYamlParser;
use config::ComponentConfig;

/// High-performance Unity scene/prefab scanner
#[napi]
pub struct Scanner {
    guid_cache: HashMap<String, String>,
    project_root: Option<String>,
    config: ComponentConfig,
}

#[napi]
impl Scanner {
    #[napi(constructor)]
    pub fn new() -> Self {
        Scanner {
            guid_cache: HashMap::new(),
            project_root: None,
            config: ComponentConfig::default(),
        }
    }

    /// Add a hierarchy provider class ID (Transform-like components).
    #[napi]
    pub fn add_hierarchy_provider(&mut self, class_id: u32) {
        self.config.add_hierarchy_provider(class_id);
    }

    /// Add a script container class ID (MonoBehaviour-like components).
    #[napi]
    pub fn add_script_container(&mut self, class_id: u32) {
        self.config.add_script_container(class_id);
    }

    /// Get the current component configuration.
    pub fn get_config(&self) -> &ComponentConfig {
        &self.config
    }

    /// Set project root for GUID resolution
    #[napi]
    pub fn set_project_root(&mut self, path: String) {
        self.project_root = Some(path.clone());
        self.build_guid_cache(&path);
    }

    /// Scan scene for basic GameObject information
    #[napi]
    pub fn scan_scene_minimal(&self, file: String) -> Vec<GameObject> {
        let path = Path::new(&file);
        if !path.exists() {
            return Vec::new();
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        UnityYamlParser::extract_gameobjects(&content)
    }

    /// Scan scene with component information
    #[napi]
    pub fn scan_scene_with_components(&mut self, file: String, options: Option<ScanOptions>) -> Vec<serde_json::Value> {
        let path = Path::new(&file);
        if !path.exists() {
            return Vec::new();
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        let verbose = options.as_ref().and_then(|o| o.verbose).unwrap_or(false);
        let gameobjects = UnityYamlParser::extract_gameobjects(&content);

        self.ensure_guid_resolver(&file);

        let mut results: Vec<serde_json::Value> = gameobjects
            .into_iter()
            .map(|obj| {
                let components = self.get_components_for_gameobject(&content, &obj.file_id, &file);
                self.build_gameobject_output(&obj, &components, verbose, false)
            })
            .collect();

        // Append PrefabInstances
        let prefab_instances = prefab::extract_prefab_instances(&content, &self.guid_cache);
        for pi in &prefab_instances {
            let mut entry = serde_json::json!({
                "type": "PrefabInstance",
                "name": pi.name,
                "source_guid": pi.source_guid,
                "modifications_count": pi.modifications_count,
            });
            if let Some(ref src) = pi.source_prefab {
                entry["source_prefab"] = serde_json::json!(src);
            }
            if verbose {
                entry["file_id"] = serde_json::json!(pi.file_id);
            }
            results.push(entry);
        }

        results
    }

    /// Find GameObjects and PrefabInstances by name pattern
    #[napi]
    pub fn find_by_name(&mut self, file: String, pattern: String, fuzzy: bool) -> Vec<FindResult> {
        let path = Path::new(&file);
        if !path.exists() {
            return Vec::new();
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        let gameobjects = UnityYamlParser::extract_gameobjects(&content);

        self.ensure_guid_resolver(&file);
        let prefab_instances = prefab::extract_prefab_instances(&content, &self.guid_cache);

        if fuzzy {
            let glob_re = glob_to_regex(&pattern);
            let lower_pattern = pattern.to_lowercase();

            let mut matches: Vec<FindResult> = Vec::new();

            for go in &gameobjects {
                if let Some(ref re) = glob_re {
                    if re.is_match(&go.name) {
                        let score = 80.0; // glob match score
                        matches.push(FindResult::from_game_object(go, Some(score)));
                    }
                } else {
                    let lower_name = go.name.to_lowercase();
                    if lower_name.contains(&lower_pattern) {
                        let score = calculate_fuzzy_score(&lower_pattern, &lower_name);
                        matches.push(FindResult::from_game_object(go, Some(score)));
                    }
                }
            }

            for pi in &prefab_instances {
                if let Some(ref re) = glob_re {
                    if re.is_match(&pi.name) {
                        let score = 80.0;
                        matches.push(FindResult::from_prefab_instance(pi, Some(score)));
                    }
                } else {
                    let lower_name = pi.name.to_lowercase();
                    if lower_name.contains(&lower_pattern) {
                        let score = calculate_fuzzy_score(&lower_pattern, &lower_name);
                        matches.push(FindResult::from_prefab_instance(pi, Some(score)));
                    }
                }
            }

            matches.sort_by(|a, b| {
                b.match_score
                    .unwrap_or(0.0)
                    .partial_cmp(&a.match_score.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            matches
        } else {
            let glob_re = glob_to_regex(&pattern);
            let mut matches: Vec<FindResult> = Vec::new();

            for go in &gameobjects {
                let matched = if let Some(ref re) = glob_re {
                    re.is_match(&go.name)
                } else {
                    go.name == pattern
                };
                if matched {
                    matches.push(FindResult::from_game_object(go, None));
                }
            }

            for pi in &prefab_instances {
                let matched = if let Some(ref re) = glob_re {
                    re.is_match(&pi.name)
                } else {
                    pi.name == pattern
                };
                if matched {
                    matches.push(FindResult::from_prefab_instance(pi, None));
                }
            }

            matches
        }
    }

    /// Inspect a specific GameObject
    #[napi]
    pub fn inspect(&mut self, options: InspectOptions) -> Option<serde_json::Value> {
        let path = Path::new(&options.file);
        if !path.exists() {
            return None;
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => return None,
        };

        let identifier = options.identifier.as_ref()?;

        self.ensure_guid_resolver(&options.file);

        // Find target file_id
        let target_file_id = if identifier.chars().all(|c| c.is_ascii_digit()) {
            identifier.clone()
        } else {
            let matches = self.find_by_name(options.file.clone(), identifier.clone(), true);
            matches.first()?.file_id.clone()
        };

        let include_properties = options.include_properties.unwrap_or(false);

        // Check if target_file_id matches a PrefabInstance
        let prefabs = prefab::extract_prefab_instances(&content, &self.guid_cache);
        if let Some(pi) = prefabs.iter().find(|p| p.file_id == target_file_id) {
            return Some(self.build_prefab_instance_output(pi, Some(&content), include_properties));
        }

        let gameobjects = UnityYamlParser::extract_gameobjects(&content);
        let target_obj = match gameobjects.iter().find(|o| o.file_id == target_file_id) {
            Some(obj) => obj,
            None => {
                // Check if the ID matches any block (could be a non-GO or stripped GO)
                let block_pattern = format!("--- !u!(\\d+) &{}(?: stripped)?", target_file_id);
                if let Ok(re) = regex::Regex::new(&block_pattern) {
                    if let Some(caps) = re.captures(&content) {
                        let class_id: u32 = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
                        let full_match = caps.get(0).map_or("", |m| m.as_str());
                        let is_stripped = full_match.contains("stripped");

                        if class_id == 1 && is_stripped {
                            return Some(serde_json::json!({
                                "error": format!("ID {} is a stripped PrefabInstance GameObject — it has no inspectable data. Use the PrefabInstance ID instead, or unpack the prefab first.", target_file_id),
                                "is_error": true
                            }));
                        }

                        let type_name = class_id_to_name(class_id);
                        return Some(serde_json::json!({
                            "error": format!("ID {} is a {} (class_id {}), not a GameObject. Use the parent GameObject's ID or name instead.", target_file_id, type_name, class_id),
                            "is_error": true
                        }));
                    }
                }
                return None;
            }
        };

        let components = self.get_components_for_gameobject(&content, &target_file_id, &options.file);
        let verbose = options.verbose.unwrap_or(false);

        let detail = self.extract_gameobject_details(&content, target_obj, &components);

        Some(self.build_detail_output(&detail, verbose, include_properties))
    }

    /// Inspect entire file
    #[napi]
    pub fn inspect_all(&mut self, file: String, include_properties: bool, verbose: bool) -> SceneInspection {
        let path = Path::new(&file);
        if !path.exists() {
            return SceneInspection {
                file,
                count: 0,
                gameobjects: Vec::new(),
                prefab_instances: None,
            };
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => {
                return SceneInspection {
                    file,
                    count: 0,
                    gameobjects: Vec::new(),
                    prefab_instances: None,
                }
            }
        };

        self.ensure_guid_resolver(&file);

        let gameobjects = UnityYamlParser::extract_gameobjects(&content);
        let detailed: Vec<GameObjectDetail> = gameobjects
            .iter()
            .map(|obj| {
                let components = self.get_components_for_gameobject(&content, &obj.file_id, &file);
                let mut detail = self.extract_gameobject_details(&content, obj, &components);

                // Strip properties from components when not requested (token savings)
                if !include_properties {
                    for comp in &mut detail.components {
                        comp.properties = None;
                    }
                }

                // Strip verbose fields when not requested
                if !verbose {
                    for comp in &mut detail.components {
                        comp.script_guid = None;
                    }
                }

                detail
            })
            .collect();

        let prefab_instances = prefab::extract_prefab_instances(&content, &self.guid_cache);
        let prefab_opt = if prefab_instances.is_empty() {
            None
        } else {
            Some(prefab_instances)
        };

        SceneInspection {
            file,
            count: detailed.len() as u32,
            gameobjects: detailed,
            prefab_instances: prefab_opt,
        }
    }

    /// Inspect entire file with pagination support
    #[napi]
    pub fn inspect_all_paginated(&mut self, options: PaginationOptions) -> PaginatedInspection {
        let file = options.file;
        let include_properties = options.include_properties.unwrap_or(false);
        let verbose = options.verbose.unwrap_or(false);
        let page_size = options.page_size.unwrap_or(200).min(1000);
        let cursor = options.cursor.unwrap_or(0);
        let max_depth = options.max_depth.unwrap_or(10).min(50);

        let path = Path::new(&file);
        if !path.exists() {
            return PaginatedInspection {
                file: file.clone(),
                total: 0,
                cursor,
                next_cursor: None,
                truncated: false,
                page_size,
                gameobjects: Vec::new(),
                prefab_instances: None,
                error: Some(format!("File not found: {}", file)),
            };
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => {
                return PaginatedInspection {
                    file: file.clone(),
                    total: 0,
                    cursor,
                    next_cursor: None,
                    truncated: false,
                    page_size,
                    gameobjects: Vec::new(),
                    prefab_instances: None,
                    error: Some(format!("Cannot read file: {}", file)),
                }
            }
        };

        self.ensure_guid_resolver(&file);

        let gameobjects = UnityYamlParser::extract_gameobjects(&content);
        let mut detailed: Vec<GameObjectDetail> = gameobjects
            .iter()
            .map(|obj| {
                let components = self.get_components_for_gameobject(&content, &obj.file_id, &file);
                let mut detail = self.extract_gameobject_details(&content, obj, &components);

                if !include_properties {
                    for comp in &mut detail.components {
                        comp.properties = None;
                    }
                }

                if !verbose {
                    for comp in &mut detail.components {
                        comp.script_guid = None;
                    }
                }

                detail
            })
            .collect();

        // Apply max_depth filter: compute depth from parent_transform_id chains
        if max_depth < 50 {
            // Build a map of transform_id → parent_transform_id
            let mut parent_map: HashMap<String, String> = HashMap::new();
            for detail in &detailed {
                if let Some(ref parent_id) = detail.parent_transform_id {
                    // Find this object's transform file_id from its components
                    for comp in &detail.components {
                        if comp.class_id == 4 || comp.class_id == 224 {
                            parent_map.insert(comp.file_id.clone(), parent_id.clone());
                            break;
                        }
                    }
                }
            }

            // Truncate hierarchy display: clear children for objects at depth >= max_depth
            // (keeps all objects in the list so total count stays accurate)
            for detail in detailed.iter_mut() {
                let transform_id = detail.components.iter()
                    .find(|c| c.class_id == 4 || c.class_id == 224)
                    .map(|c| c.file_id.clone());

                if let Some(tid) = transform_id {
                    let mut depth = 0u32;
                    let mut current = tid;
                    loop {
                        match parent_map.get(&current) {
                            Some(parent) if parent != "0" && !parent.is_empty() => {
                                depth += 1;
                                if depth > max_depth {
                                    detail.children = None;
                                    break;
                                }
                                current = parent.clone();
                            }
                            _ => break,
                        }
                    }
                }
            }
        }

        let total = detailed.len() as u32;

        // Extract prefab instances (only on first page)
        let prefab_instances = if cursor == 0 {
            let pis = prefab::extract_prefab_instances(&content, &self.guid_cache);
            if pis.is_empty() { None } else { Some(pis) }
        } else {
            None
        };

        // Apply pagination
        let start = cursor as usize;
        let end = (start + page_size as usize).min(detailed.len());
        let truncated = end < detailed.len();
        let next_cursor = if truncated { Some(end as u32) } else { None };

        let page = if start < detailed.len() {
            detailed[start..end].to_vec()
        } else {
            Vec::new()
        };

        PaginatedInspection {
            file,
            total,
            cursor,
            next_cursor,
            truncated,
            page_size,
            gameobjects: page,
            prefab_instances,
            error: None,
        }
    }

    /// Read a .asset file and return its root objects with properties
    #[napi]
    pub fn read_asset(&mut self, file: String) -> serde_json::Value {
        let path = Path::new(&file);
        if !path.exists() {
            return serde_json::json!([]);
        }

        let content = match common::read_unity_file(path) {
            Ok(c) => c,
            Err(_) => return serde_json::json!([]),
        };

        self.ensure_guid_resolver(&file);

        let blocks = UnityYamlParser::extract_asset_objects(&content);
        let mut objects = Vec::new();

        for (class_id, file_id, block_content) in &blocks {
            // Extract m_Name from block
            let name = regex::Regex::new(r"m_Name:\s*(.+)")
                .ok()
                .and_then(|re| re.captures(block_content))
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();

            // Determine type name from block (first line after header like "MonoBehaviour:")
            let type_name = regex::Regex::new(r"^([A-Za-z][A-Za-z0-9_]*):")
                .ok()
                .and_then(|re| re.captures(block_content))
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| format!("ClassID_{}", class_id));

            // Extract script GUID for MonoBehaviour (class_id 114)
            let mut script_guid: Option<String> = None;
            let mut script_path: Option<String> = None;

            if *class_id == 114 {
                let guid_re = regex::Regex::new(r"m_Script:\s*\{[^}]*guid:\s*([a-f0-9]{32})").ok();
                if let Some(re) = guid_re {
                    if let Some(caps) = re.captures(block_content) {
                        if let Some(guid_match) = caps.get(1) {
                            let guid = guid_match.as_str().to_string();
                            script_guid = Some(guid.clone());
                            script_path = self.guid_cache.get(&guid).cloned();
                        }
                    }
                }
            }

            // Extract properties using existing infrastructure
            // We need the full content with header for extract_properties
            let full_block = format!("--- !u!{} &{}\n{}", class_id, file_id, block_content);
            let properties = component::extract_properties(&full_block, file_id, *class_id, &self.guid_cache);

            let mut obj = serde_json::json!({
                "class_id": class_id,
                "file_id": file_id,
                "type_name": type_name,
                "name": name,
                "properties": properties,
            });

            if let Some(ref guid) = script_guid {
                obj["script_guid"] = serde_json::json!(guid);
            }
            if let Some(ref path) = script_path {
                obj["script_path"] = serde_json::json!(path);
            }

            objects.push(obj);
        }

        serde_json::json!(objects)
    }

    fn ensure_guid_resolver(&mut self, file: &str) {
        if self.project_root.is_none() {
            if let Some(root) = find_project_root(file) {
                self.project_root = Some(root.clone());
                self.build_guid_cache(&root);
            }
        }
    }

    fn build_guid_cache(&mut self, project_root: &str) {
        let assets_dir = Path::new(project_root).join("Assets");
        if assets_dir.exists() {
            self.scan_meta_files(&assets_dir, project_root);
        }
    }

    fn scan_meta_files(&mut self, dir: &Path, project_root: &str) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    self.scan_meta_files(&path, project_root);
                } else if path.extension().map_or(false, |e| e == "meta") {
                    if let Ok(content) = common::read_unity_file(&path) {
                        if let Some(guid) = extract_guid_from_meta(&content) {
                            // Remove .meta extension
                            let asset_path = path.with_extension("");
                            if let Ok(relative) = asset_path.strip_prefix(project_root) {
                                // Normalize to forward slashes (Unity convention)
                                let normalized = relative.to_string_lossy().replace('\\', "/");
                                self.guid_cache.insert(guid, normalized);
                            }
                        }
                    }
                }
            }
        }
    }

    fn get_components_for_gameobject(&self, content: &str, file_id: &str, _file: &str) -> Vec<Component> {
        component::extract_components(content, file_id, &self.guid_cache)
    }

    fn build_gameobject_output(&self, obj: &GameObject, components: &[Component], verbose: bool, include_properties: bool) -> serde_json::Value {
        let mut output = serde_json::json!({
            "name": obj.name,
            "active": obj.active,
        });

        if verbose {
            output["file_id"] = serde_json::json!(obj.file_id);
            output["component_count"] = serde_json::json!(components.len());
        }

        let comp_output: Vec<serde_json::Value> = components
            .iter()
            .map(|c| {
                if verbose {
                    self.verbose_component(c, include_properties)
                } else {
                    self.clean_component(c, include_properties)
                }
            })
            .collect();

        output["components"] = serde_json::json!(comp_output);
        output
    }

    fn extract_gameobject_details(&self, content: &str, obj: &GameObject, components: &[Component]) -> GameObjectDetail {
        let (tag, layer, parent_id, children) = gameobject::extract_metadata(content, &obj.file_id);

        GameObjectDetail {
            name: obj.name.clone(),
            file_id: obj.file_id.clone(),
            active: obj.active,
            tag,
            layer,
            components: components.to_vec(),
            children: if children.is_empty() { None } else { Some(children) },
            parent_transform_id: parent_id,
        }
    }

    fn build_detail_output(&self, detail: &GameObjectDetail, verbose: bool, include_properties: bool) -> serde_json::Value {
        let mut output = serde_json::json!({
            "name": detail.name,
            "file_id": detail.file_id,
            "active": detail.active,
        });

        if verbose {
            output["tag"] = serde_json::json!(detail.tag);
            output["layer"] = serde_json::json!(detail.layer);
        }

        let comp_output: Vec<serde_json::Value> = detail.components
            .iter()
            .map(|c| {
                if verbose {
                    self.verbose_component(c, include_properties)
                } else {
                    self.clean_component(c, include_properties)
                }
            })
            .collect();

        output["components"] = serde_json::json!(comp_output);

        if verbose {
            if let Some(ref children) = detail.children {
                output["children"] = serde_json::json!(children);
            }
            if let Some(ref parent) = detail.parent_transform_id {
                output["parent_transform_id"] = serde_json::json!(parent);
            }
        }

        output
    }

    fn build_prefab_instance_output(&self, pi: &PrefabInstanceInfo, content: Option<&str>, include_properties: bool) -> serde_json::Value {
        let mut output = serde_json::json!({
            "type": "PrefabInstance",
            "name": pi.name,
            "file_id": pi.file_id,
            "source_guid": pi.source_guid,
            "modifications_count": pi.modifications_count,
        });
        if let Some(ref src) = pi.source_prefab {
            output["source_prefab"] = serde_json::json!(src);
        }
        if include_properties {
            if let Some(content) = content {
                if let Some(block) = prefab::extract_prefab_block(content, &pi.file_id) {
                    let mods = prefab::extract_modifications(&block);
                    // Group by target_file_id
                    let mut grouped: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();
                    for m in &mods {
                        let entry = grouped.entry(m.target_file_id.clone()).or_default();
                        entry.push(serde_json::json!({
                            "propertyPath": m.property_path,
                            "value": m.value,
                        }));
                    }
                    output["modifications"] = serde_json::json!(grouped);
                }
            }
        }
        output
    }

    fn clean_component(&self, comp: &Component, include_properties: bool) -> serde_json::Value {
        let mut cleaned = serde_json::json!({
            "type": comp.type_name,
        });

        if let Some(ref path) = comp.script_path {
            cleaned["script"] = serde_json::json!(path);
        }

        if include_properties {
            if let Some(ref props) = comp.properties {
                cleaned["properties"] = props.clone();
            }
        }

        cleaned
    }

    fn verbose_component(&self, comp: &Component, include_properties: bool) -> serde_json::Value {
        let mut verbose = serde_json::json!({
            "type": comp.type_name,
            "class_id": comp.class_id,
            "file_id": comp.file_id,
        });

        if let Some(ref path) = comp.script_path {
            verbose["script_path"] = serde_json::json!(path);
        }

        if let Some(ref guid) = comp.script_guid {
            verbose["script_guid"] = serde_json::json!(guid);
        }

        if let Some(ref name) = comp.script_name {
            verbose["script_name"] = serde_json::json!(name);
        }

        if include_properties {
            if let Some(ref props) = comp.properties {
                verbose["properties"] = props.clone();
            }
        }

        verbose
    }
}

/// Convert a glob pattern (with `*` and `?`) to a case-insensitive regex.
/// Returns None if the pattern contains no glob characters.
fn glob_to_regex(pattern: &str) -> Option<regex::Regex> {
    if !pattern.contains('*') && !pattern.contains('?') {
        return None;
    }
    let mut regex_str = String::from("(?i)^");
    for ch in pattern.chars() {
        match ch {
            '*' => regex_str.push_str(".*"),
            '?' => regex_str.push('.'),
            '.' | '+' | '(' | ')' | '[' | ']' | '{' | '}' | '^' | '$' | '|' | '\\' => {
                regex_str.push('\\');
                regex_str.push(ch);
            }
            _ => regex_str.push(ch),
        }
    }
    regex_str.push('$');
    regex::Regex::new(&regex_str).ok()
}

fn calculate_fuzzy_score(pattern: &str, text: &str) -> f64 {
    if pattern == text {
        return 100.0;
    }
    if text.starts_with(pattern) {
        return 85.0;
    }
    if text.contains(pattern) {
        return 70.0;
    }

    let common_chars: usize = pattern.chars().filter(|c| text.contains(*c)).count();
    if pattern.is_empty() {
        0.0
    } else {
        (common_chars as f64 / pattern.len() as f64) * 50.0
    }
}

fn find_project_root(file_path: &str) -> Option<String> {
    let mut current = Path::new(file_path).parent()?;

    loop {
        let assets_path = current.join("Assets");
        if assets_path.exists() && assets_path.is_dir() {
            return Some(current.to_string_lossy().into_owned());
        }

        match current.parent() {
            Some(parent) if parent != current => current = parent,
            _ => return None,
        }
    }
}

/// Map common Unity class IDs to human-readable names.
fn class_id_to_name(class_id: u32) -> &'static str {
    match class_id {
        1 => "GameObject",
        2 => "Component",
        4 => "Transform",
        8 => "Behaviour",
        12 => "ParticleAnimator",
        20 => "Camera",
        23 => "MeshRenderer",
        25 => "Renderer",
        33 => "MeshFilter",
        54 => "Rigidbody",
        64 => "MeshCollider",
        65 => "BoxCollider",
        82 => "AudioSource",
        108 => "Light",
        111 => "Animation",
        114 => "MonoBehaviour",
        115 => "MonoScript",
        120 => "LineRenderer",
        124 => "Behaviour",
        135 => "SphereCollider",
        136 => "CapsuleCollider",
        137 => "SkinnedMeshRenderer",
        198 => "ParticleSystem",
        205 => "LODGroup",
        212 => "SpriteRenderer",
        222 => "CanvasRenderer",
        223 => "Canvas",
        224 => "RectTransform",
        225 => "CanvasGroup",
        1001 => "PrefabInstance",
        _ => "Unknown",
    }
}

fn extract_guid_from_meta(content: &str) -> Option<String> {
    let re = regex::Regex::new(r"^guid:\s*([a-f0-9]{32})").ok()?;
    for line in content.lines() {
        if let Some(caps) = re.captures(line) {
            return caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_to_regex_no_glob_chars() {
        assert!(glob_to_regex("Camera").is_none());
        assert!(glob_to_regex("MainCamera").is_none());
        assert!(glob_to_regex("").is_none());
    }

    #[test]
    fn test_glob_star_both_sides() {
        let re = glob_to_regex("*Star*").unwrap();
        assert!(re.is_match("NorthStar"));
        assert!(re.is_match("StarField"));
        assert!(re.is_match("Star"));
        assert!(re.is_match("Stare")); // *Star* matches anything containing "Star"
    }

    #[test]
    fn test_glob_star_both_sides_matches() {
        let re = glob_to_regex("*Star*").unwrap();
        assert!(re.is_match("NorthStar"));
        assert!(re.is_match("StarField"));
        assert!(re.is_match("Star"));
        assert!(re.is_match("NorthStarField"));
    }

    #[test]
    fn test_glob_trailing_star() {
        let re = glob_to_regex("Star*").unwrap();
        assert!(re.is_match("StarField"));
        assert!(re.is_match("Star"));
        assert!(!re.is_match("NorthStar"));
    }

    #[test]
    fn test_glob_leading_star() {
        let re = glob_to_regex("*Camera").unwrap();
        assert!(re.is_match("MainCamera"));
        assert!(re.is_match("Camera"));
        assert!(!re.is_match("CameraRig"));
    }

    #[test]
    fn test_glob_question_mark() {
        let re = glob_to_regex("?tar").unwrap();
        assert!(re.is_match("Star"));
        assert!(!re.is_match("Sttar"));
        assert!(!re.is_match("tar"));
    }

    #[test]
    fn test_glob_case_insensitive() {
        let re = glob_to_regex("*camera*").unwrap();
        assert!(re.is_match("MainCamera"));
        assert!(re.is_match("CAMERA"));
        assert!(re.is_match("camera_rig"));
    }

    #[test]
    fn test_glob_special_chars_escaped() {
        let re = glob_to_regex("test.name*").unwrap();
        assert!(re.is_match("test.name_foo"));
        assert!(!re.is_match("testXname_foo")); // dot is escaped, not wildcard
    }

    #[test]
    fn test_calculate_fuzzy_score_exact() {
        assert_eq!(calculate_fuzzy_score("camera", "camera"), 100.0);
    }

    #[test]
    fn test_calculate_fuzzy_score_prefix() {
        assert_eq!(calculate_fuzzy_score("cam", "camera"), 85.0);
    }

    #[test]
    fn test_calculate_fuzzy_score_substring() {
        assert_eq!(calculate_fuzzy_score("amer", "camera"), 70.0);
    }

    #[test]
    fn test_extract_gameobjects_duplicate_names() {
        // Bug #1: Two GOs with the same name should both be extracted
        let content = r#"%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 200}
  m_Layer: 0
  m_Name: Cube
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!1 &101
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 201}
  m_Layer: 0
  m_Name: Cube
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
"#;
        let gos = UnityYamlParser::extract_gameobjects(content);
        assert_eq!(gos.len(), 2, "Both duplicate-named GOs should be extracted");
        assert_eq!(gos[0].name, "Cube");
        assert_eq!(gos[1].name, "Cube");
        assert_ne!(gos[0].file_id, gos[1].file_id);
    }

    #[test]
    fn test_extract_gameobjects_skips_stripped() {
        // Bug #1/#3: Stripped GO blocks should NOT be extracted
        let content = r#"%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &500 stripped
GameObject:
  m_CorrespondingSourceObject: {fileID: 100, guid: abc123, type: 3}
  m_PrefabInstance: {fileID: 600}
  m_PrefabAsset: {fileID: 0}
--- !u!1 &101
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 201}
  m_Layer: 0
  m_Name: RealObject
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
"#;
        let gos = UnityYamlParser::extract_gameobjects(content);
        assert_eq!(gos.len(), 1, "Stripped GO should not be extracted");
        assert_eq!(gos[0].name, "RealObject");
        assert_eq!(gos[0].file_id, "101");
    }
}
