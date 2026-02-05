use std::collections::HashSet;

/// Configuration for Unity component parsing.
/// Allows customization of which class IDs represent hierarchy providers,
/// script containers, and other Unity-specific types.
#[derive(Clone)]
pub struct ComponentConfig {
    /// Class IDs that provide hierarchy information (Transform-like components).
    /// Default: [4 (Transform), 224 (RectTransform)]
    pub hierarchy_providers: HashSet<u32>,

    /// Class IDs that contain script references (MonoBehaviour-like).
    /// Default: [114 (MonoBehaviour)]
    pub script_containers: HashSet<u32>,

    /// Class ID for GameObject objects.
    /// Default: 1
    pub gameobject_class_id: u32,

    /// Field name for parent reference in hierarchy components.
    /// Default: "m_Father"
    pub parent_field: String,

    /// Field name for children array in hierarchy components.
    /// Default: "m_Children"
    pub children_field: String,

    /// Field name for script reference in script containers.
    /// Default: "m_Script"
    pub script_field: String,
}

impl Default for ComponentConfig {
    fn default() -> Self {
        let mut hierarchy_providers = HashSet::new();
        hierarchy_providers.insert(4);   // Transform
        hierarchy_providers.insert(224); // RectTransform

        let mut script_containers = HashSet::new();
        script_containers.insert(114);   // MonoBehaviour

        ComponentConfig {
            hierarchy_providers,
            script_containers,
            gameobject_class_id: 1,
            parent_field: "m_Father".to_string(),
            children_field: "m_Children".to_string(),
            script_field: "m_Script".to_string(),
        }
    }
}

impl ComponentConfig {
    /// Create a new config with default values.
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if a class ID is a hierarchy provider (Transform-like).
    pub fn is_hierarchy_provider(&self, class_id: u32) -> bool {
        self.hierarchy_providers.contains(&class_id)
    }

    /// Check if a class ID is a script container (MonoBehaviour-like).
    pub fn is_script_container(&self, class_id: u32) -> bool {
        self.script_containers.contains(&class_id)
    }

    /// Add a hierarchy provider class ID.
    pub fn add_hierarchy_provider(&mut self, class_id: u32) {
        self.hierarchy_providers.insert(class_id);
    }

    /// Add a script container class ID.
    pub fn add_script_container(&mut self, class_id: u32) {
        self.script_containers.insert(class_id);
    }

    /// Remove a hierarchy provider class ID.
    pub fn remove_hierarchy_provider(&mut self, class_id: u32) {
        self.hierarchy_providers.remove(&class_id);
    }

    /// Remove a script container class ID.
    pub fn remove_script_container(&mut self, class_id: u32) {
        self.script_containers.remove(&class_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ComponentConfig::default();
        assert!(config.is_hierarchy_provider(4));
        assert!(config.is_hierarchy_provider(224));
        assert!(!config.is_hierarchy_provider(114));
        assert!(config.is_script_container(114));
        assert!(!config.is_script_container(4));
        assert_eq!(config.gameobject_class_id, 1);
    }

    #[test]
    fn test_add_hierarchy_provider() {
        let mut config = ComponentConfig::default();
        assert!(!config.is_hierarchy_provider(999));
        config.add_hierarchy_provider(999);
        assert!(config.is_hierarchy_provider(999));
    }

    #[test]
    fn test_add_script_container() {
        let mut config = ComponentConfig::default();
        assert!(!config.is_script_container(999));
        config.add_script_container(999);
        assert!(config.is_script_container(999));
    }
}
