pub mod parser;
pub mod gameobject;
pub mod component;
pub mod config;
pub mod prefab;

use napi_derive::napi;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::common::{Component, GameObject, GameObjectDetail, InspectOptions, PrefabInstanceInfo, SceneInspection, ScanOptions, PaginationOptions, PaginatedInspection};
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

        let content = match fs::read_to_string(path) {
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

        let content = match fs::read_to_string(path) {
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

    /// Find GameObjects by name pattern
    #[napi]
    pub fn find_by_name(&self, file: String, pattern: String, fuzzy: bool) -> Vec<GameObject> {
        let gameobjects = self.scan_scene_minimal(file);

        if fuzzy {
            let lower_pattern = pattern.to_lowercase();
            let mut matches: Vec<GameObject> = gameobjects
                .into_iter()
                .filter_map(|mut obj| {
                    let lower_name = obj.name.to_lowercase();
                    if lower_name.contains(&lower_pattern) {
                        obj.match_score = Some(calculate_fuzzy_score(&lower_pattern, &lower_name));
                        Some(obj)
                    } else {
                        None
                    }
                })
                .collect();

            matches.sort_by(|a, b| {
                b.match_score
                    .unwrap_or(0.0)
                    .partial_cmp(&a.match_score.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            matches
        } else {
            gameobjects
                .into_iter()
                .filter(|obj| obj.name == pattern)
                .collect()
        }
    }

    /// Inspect a specific GameObject
    #[napi]
    pub fn inspect(&mut self, options: InspectOptions) -> Option<serde_json::Value> {
        let path = Path::new(&options.file);
        if !path.exists() {
            return None;
        }

        let content = match fs::read_to_string(path) {
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
            match matches.first() {
                Some(m) => m.file_id.clone(),
                None => {
                    // Fallback: search PrefabInstances by name
                    let prefabs = prefab::extract_prefab_instances(&content, &self.guid_cache);
                    let lower = identifier.to_lowercase();
                    let pi = prefabs.iter().find(|p| p.name.to_lowercase().contains(&lower))?;
                    return Some(self.build_prefab_instance_output(pi));
                }
            }
        };

        // Check if target_file_id matches a PrefabInstance
        let prefabs = prefab::extract_prefab_instances(&content, &self.guid_cache);
        if let Some(pi) = prefabs.iter().find(|p| p.file_id == target_file_id) {
            return Some(self.build_prefab_instance_output(pi));
        }

        let gameobjects = UnityYamlParser::extract_gameobjects(&content);
        let target_obj = gameobjects.iter().find(|o| o.file_id == target_file_id)?;

        let components = self.get_components_for_gameobject(&content, &target_file_id, &options.file);
        let verbose = options.verbose.unwrap_or(false);
        let include_properties = options.include_properties.unwrap_or(false);

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

        let content = match fs::read_to_string(path) {
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
                file,
                total: 0,
                cursor,
                next_cursor: None,
                truncated: false,
                page_size,
                gameobjects: Vec::new(),
                prefab_instances: None,
            };
        }

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => {
                return PaginatedInspection {
                    file,
                    total: 0,
                    cursor,
                    next_cursor: None,
                    truncated: false,
                    page_size,
                    gameobjects: Vec::new(),
                    prefab_instances: None,
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

            // Compute depth for each object
            detailed.retain(|detail| {
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
                                    return false;
                                }
                                current = parent.clone();
                            }
                            _ => break,
                        }
                    }
                }
                true
            });
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
        }
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
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Some(guid) = extract_guid_from_meta(&content) {
                            // Remove .meta extension
                            let asset_path = path.with_extension("");
                            if let Ok(relative) = asset_path.strip_prefix(project_root) {
                                self.guid_cache.insert(guid, relative.to_string_lossy().into_owned());
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

    fn build_prefab_instance_output(&self, pi: &PrefabInstanceInfo) -> serde_json::Value {
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

fn extract_guid_from_meta(content: &str) -> Option<String> {
    let re = regex::Regex::new(r"^guid:\s*([a-f0-9]{32})").ok()?;
    for line in content.lines() {
        if let Some(caps) = re.captures(line) {
            return caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    None
}
