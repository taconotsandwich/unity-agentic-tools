use napi_derive::napi;
use rayon::prelude::*;
use regex::RegexBuilder;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::common;

/// Directories to always skip during project walks.
const SKIP_DIRS: &[&str] = &[
    "Library", "Temp", "obj", "Logs", ".git", ".unity-agentic", "node_modules",
];

/// Binary file extensions to skip during grep.
const BINARY_EXTENSIONS: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tga", ".psd", ".tif", ".tiff",
    ".fbx", ".obj", ".dae", ".blend", ".3ds", ".max",
    ".dll", ".so", ".dylib", ".exe", ".a", ".lib",
    ".mp3", ".wav", ".ogg", ".aif", ".aiff",
    ".mp4", ".mov", ".avi", ".wmv",
    ".zip", ".gz", ".tar", ".rar", ".7z",
    ".ttf", ".otf", ".woff", ".woff2",
    ".bank", ".bytes", ".db",
];

/// Truncate a string to at most `max_bytes` bytes at a valid UTF-8 char boundary.
fn truncate_line(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    // Find the last char boundary at or before max_bytes
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &s[..end])
}

/// Extension groups for file_type filtering in grep.
fn extension_map(file_type: &str) -> Vec<&'static str> {
    match file_type {
        "cs" => vec![".cs"],
        "yaml" => vec![".yaml", ".yml", ".unity", ".prefab", ".asset"],
        "unity" => vec![".unity"],
        "prefab" => vec![".prefab"],
        "asset" => vec![".asset"],
        _ => vec![
            ".cs", ".unity", ".prefab", ".asset", ".yaml", ".yml",
            ".txt", ".json", ".xml", ".shader", ".cginc", ".hlsl",
            ".compute", ".asmdef", ".asmref",
        ],
    }
}

/// Walk a Unity project and collect files matching the given extensions.
///
/// Walks `Assets/` (and `ProjectSettings/` when `.asset` is among extensions).
/// Skips standard Unity noise directories (Library, Temp, etc.).
#[napi]
pub fn walk_project_files(
    project_path: String,
    extensions: Vec<String>,
    exclude_dirs: Option<Vec<String>>,
) -> Vec<String> {
    let project = Path::new(&project_path);
    let extra_excludes = exclude_dirs.unwrap_or_default();
    let mut skip: HashSet<String> = SKIP_DIRS.iter().map(|s| s.to_string()).collect();
    for dir in &extra_excludes {
        skip.insert(dir.clone());
    }

    let ext_set: HashSet<String> = extensions
        .iter()
        .map(|e| {
            let e = e.to_lowercase();
            if e.starts_with('.') { e } else { format!(".{e}") }
        })
        .collect();

    let mut result: Vec<String> = Vec::new();

    let assets_dir = project.join("Assets");
    if assets_dir.is_dir() {
        walk_dir_filtered(&assets_dir, &skip, &ext_set, &mut result);
    }

    // Also walk ProjectSettings/ when .asset is requested
    if ext_set.contains(".asset") {
        let settings_dir = project.join("ProjectSettings");
        if settings_dir.is_dir() {
            walk_dir_filtered(&settings_dir, &skip, &ext_set, &mut result);
        }
    }

    result
}

/// Internal recursive walker using walkdir crate.
fn walk_dir_filtered(
    root: &Path,
    skip: &HashSet<String>,
    ext_set: &HashSet<String>,
    result: &mut Vec<String>,
) {
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    return !skip.contains(name);
                }
            }
            true
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        if let Some(ext) = entry.path().extension() {
            let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
            if ext_set.contains(&ext_str) {
                result.push(entry.path().to_string_lossy().to_string());
            }
        }
    }
}

// ========== Grep ==========

#[napi(object)]
pub struct NapiGrepOptions {
    pub project_path: String,
    pub pattern: String,
    pub file_type: Option<String>,
    pub max_results: Option<u32>,
    pub context_lines: Option<u32>,
}

#[napi(object)]
#[derive(Clone)]
pub struct NapiGrepMatch {
    pub file: String,
    pub line_number: u32,
    pub line: String,
    pub context_before: Option<Vec<String>>,
    pub context_after: Option<Vec<String>>,
}

#[napi(object)]
pub struct NapiGrepResult {
    pub success: bool,
    pub project_path: String,
    pub pattern: String,
    pub total_files_scanned: u32,
    pub total_matches: u32,
    pub truncated: bool,
    pub matches: Vec<NapiGrepMatch>,
    pub error: Option<String>,
}

/// Grep across Unity project files in parallel using Rayon.
#[napi]
pub fn grep_project(options: NapiGrepOptions) -> NapiGrepResult {
    let project_path = options.project_path.clone();
    let pattern_str = options.pattern.clone();
    let file_type = options.file_type.as_deref().unwrap_or("all");
    let max_results = options.max_results.unwrap_or(100) as usize;
    let context_lines = options.context_lines.unwrap_or(0) as usize;

    // Validate project path
    if !Path::new(&project_path).exists() {
        let err_msg = format!("Project path not found: {project_path}");
        return NapiGrepResult {
            success: false,
            project_path,
            pattern: pattern_str,
            total_files_scanned: 0,
            total_matches: 0,
            truncated: false,
            matches: vec![],
            error: Some(err_msg),
        };
    }

    // Compile regex (case-insensitive, matching JS behavior)
    let regex = match RegexBuilder::new(&pattern_str).case_insensitive(true).build() {
        Ok(r) => r,
        Err(e) => {
            return NapiGrepResult {
                success: false,
                project_path,
                pattern: pattern_str,
                total_files_scanned: 0,
                total_matches: 0,
                truncated: false,
                matches: vec![],
                error: Some(format!("Invalid regex pattern: {e}")),
            };
        }
    };

    let extensions: Vec<String> = extension_map(file_type)
        .iter()
        .map(|s| s.to_string())
        .collect();
    let files = walk_project_files(project_path.clone(), extensions, None);

    let binary_set: HashSet<&str> = BINARY_EXTENSIONS.iter().copied().collect();
    let project = PathBuf::from(&project_path);

    // Filter out binary files
    let text_files: Vec<&String> = files
        .iter()
        .filter(|f| {
            let p = Path::new(f);
            if let Some(ext) = p.extension() {
                let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                !binary_set.contains(ext_str.as_str())
            } else {
                true
            }
        })
        .collect();

    let total_files_scanned = text_files.len() as u32;

    // Parallel grep with rayon
    let all_matches: Vec<NapiGrepMatch> = text_files
        .par_iter()
        .flat_map(|file_path| {
            let content = match common::read_unity_file(file_path) {
                Ok(c) => c,
                Err(_) => return vec![],
            };

            let lines: Vec<&str> = content.split('\n').collect();
            let rel_path = Path::new(file_path)
                .strip_prefix(&project)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| file_path.to_string());

            let mut file_matches: Vec<NapiGrepMatch> = Vec::new();

            for (i, line) in lines.iter().enumerate() {
                if regex.is_match(line) {
                    let truncated_line = truncate_line(line, 200);

                    let context_before = if context_lines > 0 {
                        let start = i.saturating_sub(context_lines);
                        Some(
                            lines[start..i]
                                .iter()
                                .map(|l| truncate_line(l, 200))
                                .collect(),
                        )
                    } else {
                        None
                    };

                    let context_after = if context_lines > 0 {
                        let end = (i + 1 + context_lines).min(lines.len());
                        Some(
                            lines[(i + 1)..end]
                                .iter()
                                .map(|l| truncate_line(l, 200))
                                .collect(),
                        )
                    } else {
                        None
                    };

                    file_matches.push(NapiGrepMatch {
                        file: rel_path.clone(),
                        line_number: (i + 1) as u32,
                        line: truncated_line,
                        context_before,
                        context_after,
                    });
                }
            }

            file_matches
        })
        .collect();

    let truncated = all_matches.len() > max_results;
    let matches: Vec<NapiGrepMatch> = all_matches.into_iter().take(max_results).collect();

    NapiGrepResult {
        success: true,
        project_path,
        pattern: pattern_str,
        total_files_scanned,
        total_matches: matches.len() as u32,
        truncated,
        matches,
        error: None,
    }
}

// ========== GUID Cache ==========

/// Build the GUID cache by scanning all .meta files under Assets/ in parallel.
///
/// Returns a JSON object mapping `{ guid: relative_asset_path }`.
#[napi]
pub fn build_guid_cache(project_root: String) -> serde_json::Value {
    let root = PathBuf::from(&project_root);
    let assets_dir = root.join("Assets");

    if !assets_dir.is_dir() {
        return serde_json::Value::Object(serde_json::Map::new());
    }

    // Collect all .meta file paths
    let meta_files: Vec<PathBuf> = WalkDir::new(&assets_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext == "meta")
                    .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    let guid_regex = regex::Regex::new(r"(?m)^guid:\s*([a-f0-9]{32})").unwrap();

    // Parallel read + extract
    let pairs: Vec<(String, String)> = meta_files
        .par_iter()
        .filter_map(|meta_path| {
            let content = common::read_unity_file(meta_path).ok()?;
            let caps = guid_regex.captures(&content)?;
            let guid = caps.get(1)?.as_str().to_string();

            // Strip ".meta" suffix to get asset path, then make relative to project root
            let asset_str = meta_path.to_string_lossy();
            let asset_no_meta = &asset_str[..asset_str.len() - 5];
            let rel = Path::new(asset_no_meta)
                .strip_prefix(&root)
                .ok()?
                .to_string_lossy()
                .to_string();

            Some((guid, rel))
        })
        .collect();

    let mut map = serde_json::Map::new();
    for (guid, path) in pairs {
        map.insert(guid, serde_json::Value::String(path));
    }

    serde_json::Value::Object(map)
}

// ========== Package GUID Cache ==========

/// Build a GUID cache for Library/PackageCache/ contents.
///
/// Scans `Library/PackageCache/` for `.meta` files and returns
/// `{ guid: relative_path }` just like `build_guid_cache` does for Assets/.
/// Returns a separate cache so project assets and package assets stay distinct.
#[napi]
pub fn build_package_guid_cache(project_root: String) -> serde_json::Value {
    let root = PathBuf::from(&project_root);
    let package_cache = root.join("Library").join("PackageCache");

    if !package_cache.is_dir() {
        return serde_json::Value::Object(serde_json::Map::new());
    }

    let meta_files: Vec<PathBuf> = WalkDir::new(&package_cache)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext == "meta")
                    .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    let guid_regex = regex::Regex::new(r"(?m)^guid:\s*([a-f0-9]{32})").unwrap();

    let pairs: Vec<(String, String)> = meta_files
        .par_iter()
        .filter_map(|meta_path| {
            let content = common::read_unity_file(meta_path).ok()?;
            let caps = guid_regex.captures(&content)?;
            let guid = caps.get(1)?.as_str().to_string();

            let asset_str = meta_path.to_string_lossy();
            let asset_no_meta = &asset_str[..asset_str.len() - 5];
            let rel = Path::new(asset_no_meta)
                .strip_prefix(&root)
                .ok()?
                .to_string_lossy()
                .to_string();

            Some((guid, rel))
        })
        .collect();

    let mut map = serde_json::Map::new();
    for (guid, path) in pairs {
        map.insert(guid, serde_json::Value::String(path));
    }

    serde_json::Value::Object(map)
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper to get the external fixtures path (matches TS test convention).
    fn fixtures_path() -> PathBuf {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest.join("..").join("test").join("fixtures").join("external")
    }

    /// Create a minimal temp project structure for isolated tests.
    fn create_temp_project() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        let assets = tmp.path().join("Assets").join("Scripts");
        fs::create_dir_all(&assets).unwrap();

        fs::write(
            assets.join("Player.cs"),
            "using UnityEngine;\npublic class Player : MonoBehaviour { }\n",
        )
        .unwrap();
        fs::write(
            assets.join("Enemy.cs"),
            "using UnityEngine;\npublic class Enemy : MonoBehaviour {\n    public int health = 100;\n}\n",
        )
        .unwrap();

        // Library dir should be skipped (at project root)
        let lib = tmp.path().join("Library");
        fs::create_dir_all(&lib).unwrap();
        fs::write(lib.join("noise.cs"), "// should be skipped").unwrap();

        // ProjectSettings
        let settings = tmp.path().join("ProjectSettings");
        fs::create_dir_all(&settings).unwrap();
        fs::write(
            settings.join("TagManager.asset"),
            "%YAML 1.1\n--- !u!78 &1\nTagManager:\n  tags:\n  - killzone\n",
        )
        .unwrap();

        // A .meta file for GUID cache testing
        let meta_dir = tmp.path().join("Assets");
        fs::write(
            meta_dir.join("Scripts.meta"),
            "fileFormatVersion: 2\nguid: abcdef01234567890abcdef012345678\n",
        )
        .unwrap();
        fs::write(
            meta_dir.join("Scripts").join("Player.cs.meta"),
            "fileFormatVersion: 2\nguid: 11111111111111111111111111111111\nMonoImporter:\n",
        )
        .unwrap();

        tmp
    }

    #[test]
    fn test_walk_finds_cs_files() {
        let tmp = create_temp_project();
        let files = walk_project_files(
            tmp.path().to_string_lossy().to_string(),
            vec![".cs".to_string()],
            None,
        );
        assert!(files.len() >= 2, "Expected at least 2 .cs files, got {}", files.len());
        assert!(files.iter().any(|f| f.contains("Player.cs")));
        assert!(files.iter().any(|f| f.contains("Enemy.cs")));
    }

    #[test]
    fn test_walk_skips_library_dir() {
        let tmp = create_temp_project();
        let files = walk_project_files(
            tmp.path().to_string_lossy().to_string(),
            vec![".cs".to_string()],
            None,
        );
        assert!(
            !files.iter().any(|f| f.contains("Library")),
            "Library dir should be skipped"
        );
    }

    #[test]
    fn test_walk_asset_includes_project_settings() {
        let tmp = create_temp_project();
        let files = walk_project_files(
            tmp.path().to_string_lossy().to_string(),
            vec![".asset".to_string()],
            None,
        );
        assert!(
            files.iter().any(|f| f.contains("TagManager.asset")),
            "Should find TagManager.asset in ProjectSettings"
        );
    }

    #[test]
    fn test_walk_nonexistent_path_returns_empty() {
        let files = walk_project_files(
            "/nonexistent/path/12345".to_string(),
            vec![".cs".to_string()],
            None,
        );
        assert!(files.is_empty());
    }

    #[test]
    fn test_yaml_extension_map_includes_unity_formats() {
        let exts = extension_map("yaml");
        assert!(exts.contains(&".yaml"), "Should include .yaml");
        assert!(exts.contains(&".yml"), "Should include .yml");
        assert!(exts.contains(&".unity"), "Should include .unity");
        assert!(exts.contains(&".prefab"), "Should include .prefab");
        assert!(exts.contains(&".asset"), "Should include .asset");
    }

    #[test]
    fn test_grep_yaml_type_finds_unity_files() {
        let tmp = create_temp_project();
        // Create a .unity file with searchable content
        let assets = tmp.path().join("Assets");
        fs::write(
            assets.join("Test.unity"),
            "%YAML 1.1\n--- !u!1 &100\nGameObject:\n  m_Name: TestObject\n",
        )
        .unwrap();

        let result = grep_project(NapiGrepOptions {
            project_path: tmp.path().to_string_lossy().to_string(),
            pattern: "TestObject".to_string(),
            file_type: Some("yaml".to_string()),
            max_results: None,
            context_lines: None,
        });
        assert!(result.success);
        assert!(result.total_files_scanned > 0, "yaml type should scan .unity files");
        assert!(result.total_matches >= 1, "Should find match in .unity file");
    }

    #[test]
    fn test_grep_finds_pattern() {
        let tmp = create_temp_project();
        let result = grep_project(NapiGrepOptions {
            project_path: tmp.path().to_string_lossy().to_string(),
            pattern: "MonoBehaviour".to_string(),
            file_type: Some("cs".to_string()),
            max_results: None,
            context_lines: None,
        });
        assert!(result.success);
        assert!(result.total_matches >= 2, "Expected matches in Player.cs and Enemy.cs");
    }

    #[test]
    fn test_grep_context_lines() {
        let tmp = create_temp_project();
        let result = grep_project(NapiGrepOptions {
            project_path: tmp.path().to_string_lossy().to_string(),
            pattern: "health".to_string(),
            file_type: Some("cs".to_string()),
            max_results: None,
            context_lines: Some(1),
        });
        assert!(result.success);
        assert!(!result.matches.is_empty());
        let m = &result.matches[0];
        assert!(m.context_before.is_some());
        assert!(m.context_after.is_some());
    }

    #[test]
    fn test_grep_max_results() {
        let tmp = create_temp_project();
        let result = grep_project(NapiGrepOptions {
            project_path: tmp.path().to_string_lossy().to_string(),
            pattern: ".*".to_string(),
            file_type: Some("all".to_string()),
            max_results: Some(2),
            context_lines: None,
        });
        assert!(result.success);
        assert!(result.matches.len() <= 2);
        assert!(result.truncated);
    }

    #[test]
    fn test_grep_invalid_regex() {
        let tmp = create_temp_project();
        let result = grep_project(NapiGrepOptions {
            project_path: tmp.path().to_string_lossy().to_string(),
            pattern: "[invalid".to_string(),
            file_type: None,
            max_results: None,
            context_lines: None,
        });
        assert!(!result.success);
        assert!(result.error.as_ref().unwrap().contains("Invalid regex"));
    }

    #[test]
    fn test_build_guid_cache() {
        let tmp = create_temp_project();
        let cache = build_guid_cache(tmp.path().to_string_lossy().to_string());
        let map = cache.as_object().unwrap();
        assert!(
            map.contains_key("11111111111111111111111111111111"),
            "Should find Player.cs GUID"
        );
        let player_path = map["11111111111111111111111111111111"].as_str().unwrap();
        assert!(
            player_path.contains("Player.cs"),
            "Path should reference Player.cs, got: {player_path}"
        );
        // Path should be relative (not start with /)
        assert!(!player_path.starts_with('/'), "Path should be relative");
    }

    #[test]
    fn test_build_guid_cache_no_assets_dir() {
        let tmp = tempfile::tempdir().unwrap();
        // No Assets/ directory
        let cache = build_guid_cache(tmp.path().to_string_lossy().to_string());
        let map = cache.as_object().unwrap();
        assert!(map.is_empty());
    }

    // ===== Tests against external fixtures (if available) =====

    #[test]
    fn test_walk_external_fixtures_cs() {
        let fixtures = fixtures_path();
        if !fixtures.exists() {
            return; // Skip if submodule not checked out
        }
        let files = walk_project_files(
            fixtures.to_string_lossy().to_string(),
            vec![".cs".to_string()],
            None,
        );
        assert!(files.len() >= 5, "External fixtures should have 5+ .cs files");
        assert!(files.iter().any(|f| f.contains("GameManager.cs")));
    }

    #[test]
    fn test_grep_external_fixtures_killzone() {
        let fixtures = fixtures_path();
        if !fixtures.exists() {
            return;
        }
        let result = grep_project(NapiGrepOptions {
            project_path: fixtures.to_string_lossy().to_string(),
            pattern: "killzone".to_string(),
            file_type: Some("asset".to_string()),
            max_results: None,
            context_lines: None,
        });
        assert!(result.success);
        assert!(result.total_matches >= 1);
        assert!(result.matches.iter().any(|m| m.file.contains("TagManager.asset")));
    }

    #[test]
    fn test_guid_cache_external_fixtures() {
        let fixtures = fixtures_path();
        if !fixtures.exists() {
            return;
        }
        let cache = build_guid_cache(fixtures.to_string_lossy().to_string());
        let map = cache.as_object().unwrap();
        assert!(!map.is_empty(), "External fixtures should have .meta files");
    }
}
