pub mod dll_reader;

use napi_derive::napi;
use rayon::prelude::*;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use walkdir::WalkDir;

use crate::common;

/// A C# type reference extracted from source or DLL.
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CSharpTypeRef {
    /// Type name (e.g., "PlayerController")
    pub name: String,
    /// Kind: "class", "struct", "enum", or "interface"
    pub kind: String,
    /// Namespace (e.g., "UnityEngine.UI")
    pub namespace: Option<String>,
    /// Source file or DLL path (relative to project root)
    pub file_path: String,
    /// GUID from adjacent .meta file (None for DLL types)
    pub guid: Option<String>,
}

/// Extract C# type declarations from a single .cs file.
///
/// Returns all public/internal class, struct, enum, and interface declarations
/// with their namespace context and the GUID from the adjacent .meta file.
#[napi]
pub fn extract_csharp_types(path: String) -> Vec<CSharpTypeRef> {
    extract_types_from_file(Path::new(&path), None)
}

/// Build a type registry by scanning all .cs files in a Unity project.
///
/// Scans Assets/ and optionally Library/PackageCache/ for .cs files,
/// extracts type declarations, and returns them with GUID + namespace info.
/// When include_packages is true, also scans Library/PackageCache/.
/// When include_dlls is true, also extracts types from DLLs in Library/ScriptAssemblies/.
#[napi]
pub fn build_type_registry(
    project_root: String,
    include_packages: Option<bool>,
    include_dlls: Option<bool>,
) -> Vec<CSharpTypeRef> {
    let root = PathBuf::from(&project_root);
    let include_packages = include_packages.unwrap_or(false);
    let include_dlls = include_dlls.unwrap_or(false);

    let mut cs_files: Vec<PathBuf> = Vec::new();

    // Scan Assets/ for .cs files
    let assets_dir = root.join("Assets");
    if assets_dir.is_dir() {
        collect_cs_files(&assets_dir, &mut cs_files);
    }

    // Optionally scan Library/PackageCache/ for .cs files
    if include_packages {
        let package_cache = root.join("Library").join("PackageCache");
        if package_cache.is_dir() {
            collect_cs_files(&package_cache, &mut cs_files);
        }
    }

    // Parallel extraction from .cs files
    let mut types: Vec<CSharpTypeRef> = cs_files
        .par_iter()
        .flat_map(|file| extract_types_from_file(file, Some(&root)))
        .collect();

    // Optionally extract from DLLs
    if include_dlls {
        let script_assemblies = root.join("Library").join("ScriptAssemblies");
        if script_assemblies.is_dir() {
            let mut dll_files: Vec<PathBuf> = Vec::new();
            collect_dll_files(&script_assemblies, &mut dll_files);

            let dll_types: Vec<CSharpTypeRef> = dll_files
                .par_iter()
                .flat_map(|file| {
                    let rel = file
                        .strip_prefix(&root)
                        .unwrap_or(file)
                        .to_string_lossy()
                        .to_string();
                    dll_reader::extract_types_from_dll(file, &rel)
                })
                .collect();

            types.extend(dll_types);
        }
    }

    types
}

/// Collect all .cs files under a directory.
fn collect_cs_files(dir: &Path, result: &mut Vec<PathBuf>) {
    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| {
            // Skip common noise directories
            if e.file_type().is_dir() {
                if let Some(name) = e.file_name().to_str() {
                    return !matches!(name, ".git" | "node_modules" | "obj" | "bin");
                }
            }
            true
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if ext == "cs" {
                    result.push(entry.into_path());
                }
            }
        }
    }
}

/// Collect all .dll files under a directory.
fn collect_dll_files(dir: &Path, result: &mut Vec<PathBuf>) {
    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if ext == "dll" {
                    result.push(entry.into_path());
                }
            }
        }
    }
}

/// Extract type declarations from a single .cs file.
///
/// Parses namespace (traditional braced and file-scoped) and type declarations
/// (class, struct, enum, interface) using regex. Reads the adjacent .meta file
/// for GUID if available.
fn extract_types_from_file(file: &Path, project_root: Option<&Path>) -> Vec<CSharpTypeRef> {
    let content = match common::read_unity_file(file) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let rel_path = match project_root {
        Some(root) => file
            .strip_prefix(root)
            .unwrap_or(file)
            .to_string_lossy()
            .to_string(),
        None => file.to_string_lossy().to_string(),
    };

    // Read GUID from adjacent .meta file
    let guid = read_meta_guid(file);

    // Parse namespace and type declarations
    parse_csharp_types(&content, &rel_path, guid.as_deref())
}

// Compiled-once regexes for C# parsing (shared across rayon threads)
static GUID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^guid:\s*([a-f0-9]{32})").unwrap());
static FILE_SCOPED_NS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*namespace\s+([\w.]+)\s*;").unwrap());
static BRACED_NS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*namespace\s+([\w.]+)\s*\{").unwrap());
static TYPE_DECL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)(?:^|\s)(?:public|internal|private|protected|abstract|sealed|static|partial|\s)*(class|struct|enum|interface)\s+(\w+)",
    )
    .unwrap()
});

/// Read the GUID from an adjacent .meta file.
fn read_meta_guid(cs_file: &Path) -> Option<String> {
    let meta_path = PathBuf::from(format!("{}.meta", cs_file.display()));
    if !meta_path.exists() {
        return None;
    }

    let content = common::read_unity_file(&meta_path).ok()?;
    GUID_RE.captures(&content).map(|caps| caps[1].to_string())
}

/// Parse C# source code for type declarations and namespace context.
///
/// Strategy:
/// 1. Detect file-scoped namespace (C# 10): `namespace X.Y;`
/// 2. Track braced namespaces via brace depth counting
/// 3. Extract type declarations (class/struct/enum/interface) with their current namespace
///
/// This is intentionally lightweight -- no full C# parser, just enough
/// to get type names and namespaces from declaration lines.
fn parse_csharp_types(content: &str, file_path: &str, guid: Option<&str>) -> Vec<CSharpTypeRef> {
    let mut types = Vec::new();

    // Determine if file uses file-scoped namespace (C# 10+)
    let file_scoped_ns = FILE_SCOPED_NS_RE.captures(content).map(|c| c[1].to_string());

    if let Some(ref ns) = file_scoped_ns {
        // File-scoped namespace applies to all types in the file
        for caps in TYPE_DECL_RE.captures_iter(content) {
            let kind = caps[1].to_string();
            let name = caps[2].to_string();

            // Skip common false positives
            if is_keyword(&name) {
                continue;
            }

            types.push(CSharpTypeRef {
                name,
                kind,
                namespace: Some(ns.clone()),
                file_path: file_path.to_string(),
                guid: guid.map(String::from),
            });
        }
    } else {
        // Track braced namespaces via line-by-line brace counting
        let lines: Vec<&str> = content.lines().collect();
        let mut current_namespace: Option<String> = None;
        let mut ns_brace_depth: i32 = 0;
        let mut ns_start_depth: i32 = 0;
        let mut in_namespace = false;

        for line in &lines {
            let trimmed = line.trim();

            // Skip comments and preprocessor directives
            if trimmed.starts_with("//") || trimmed.starts_with('#') || trimmed.starts_with("/*") {
                continue;
            }

            // Check for namespace declaration
            if let Some(caps) = BRACED_NS_RE.captures(trimmed) {
                current_namespace = Some(caps[1].to_string());
                ns_start_depth = ns_brace_depth;
                in_namespace = true;
            }

            // Count braces for namespace tracking
            for ch in trimmed.chars() {
                if ch == '{' {
                    ns_brace_depth += 1;
                } else if ch == '}' {
                    ns_brace_depth -= 1;
                    // If we drop back to or below the namespace's start depth, exit it
                    if in_namespace && ns_brace_depth <= ns_start_depth {
                        current_namespace = None;
                        in_namespace = false;
                    }
                }
            }

            // Check for type declarations on this line
            if let Some(caps) = TYPE_DECL_RE.captures(trimmed) {
                let kind = caps[1].to_string();
                let name = caps[2].to_string();

                if is_keyword(&name) {
                    continue;
                }

                types.push(CSharpTypeRef {
                    name,
                    kind,
                    namespace: current_namespace.clone(),
                    file_path: file_path.to_string(),
                    guid: guid.map(String::from),
                });
            }
        }
    }

    types
}

/// Returns true if the name is a C# keyword that could be falsely matched.
fn is_keyword(name: &str) -> bool {
    matches!(
        name,
        "var" | "new" | "this" | "base" | "null" | "true" | "false"
            | "void" | "int" | "string" | "bool" | "float" | "double"
            | "byte" | "char" | "long" | "short" | "uint" | "ulong"
            | "object" | "decimal" | "dynamic" | "where"
    )
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_simple_class() {
        let types = parse_csharp_types(
            "public class PlayerController : MonoBehaviour { }",
            "Assets/Scripts/PlayerController.cs",
            Some("abc123"),
        );
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "PlayerController");
        assert_eq!(types[0].kind, "class");
        assert!(types[0].namespace.is_none());
        assert_eq!(types[0].guid.as_deref(), Some("abc123"));
    }

    #[test]
    fn test_namespaced_class() {
        let source = r#"
namespace Game.Player {
    public class PlayerController : MonoBehaviour {
        public int health = 100;
    }
}
"#;
        let types = parse_csharp_types(source, "Assets/Scripts/PlayerController.cs", None);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "PlayerController");
        assert_eq!(types[0].namespace.as_deref(), Some("Game.Player"));
    }

    #[test]
    fn test_file_scoped_namespace() {
        let source = r#"
namespace Game.Player;

public class PlayerController : MonoBehaviour {
    public int health = 100;
}

public struct PlayerStats {
    public int level;
}
"#;
        let types = parse_csharp_types(source, "Assets/Scripts/Player.cs", None);
        assert_eq!(types.len(), 2);
        assert_eq!(types[0].name, "PlayerController");
        assert_eq!(types[0].kind, "class");
        assert_eq!(types[0].namespace.as_deref(), Some("Game.Player"));
        assert_eq!(types[1].name, "PlayerStats");
        assert_eq!(types[1].kind, "struct");
        assert_eq!(types[1].namespace.as_deref(), Some("Game.Player"));
    }

    #[test]
    fn test_multiple_types_one_file() {
        let source = r#"
public enum Controls { Keyboard, Gamepad }
public class PlayerController : MonoBehaviour { }
internal struct InternalData { }
"#;
        let types = parse_csharp_types(source, "Assets/Scripts/PlayerController.cs", Some("7d4a31ff"));
        assert_eq!(types.len(), 3);

        let names: Vec<&str> = types.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Controls"));
        assert!(names.contains(&"PlayerController"));
        assert!(names.contains(&"InternalData"));

        // All share the same GUID since they're in the same file
        for t in &types {
            assert_eq!(t.guid.as_deref(), Some("7d4a31ff"));
        }
    }

    #[test]
    fn test_interface_and_abstract() {
        let source = r#"
namespace Core {
    public interface IInteractable {
        void Interact();
    }

    public abstract class InteractableBase : MonoBehaviour, IInteractable {
        public abstract void Interact();
    }
}
"#;
        let types = parse_csharp_types(source, "Assets/Scripts/Interactable.cs", None);
        assert_eq!(types.len(), 2);
        assert_eq!(types[0].name, "IInteractable");
        assert_eq!(types[0].kind, "interface");
        assert_eq!(types[1].name, "InteractableBase");
        assert_eq!(types[1].kind, "class");
    }

    #[test]
    fn test_no_namespace() {
        let source = "public class GlobalHelper { }";
        let types = parse_csharp_types(source, "Assets/Scripts/GlobalHelper.cs", None);
        assert_eq!(types.len(), 1);
        assert!(types[0].namespace.is_none());
    }

    #[test]
    fn test_nested_namespaces() {
        let source = r#"
namespace Outer {
    public class OuterClass { }

    namespace Inner {
        public class InnerClass { }
    }
}
"#;
        let types = parse_csharp_types(source, "test.cs", None);
        // Should find both classes; inner gets the inner namespace
        assert!(types.len() >= 2);
        let outer = types.iter().find(|t| t.name == "OuterClass");
        let inner = types.iter().find(|t| t.name == "InnerClass");
        assert!(outer.is_some());
        assert!(inner.is_some());
        assert_eq!(outer.unwrap().namespace.as_deref(), Some("Outer"));
        assert_eq!(inner.unwrap().namespace.as_deref(), Some("Inner"));
    }

    #[test]
    fn test_static_partial_sealed_modifiers() {
        let source = r#"
public static class Extensions { }
public sealed class SingletonManager { }
public partial class LargeClass { }
"#;
        let types = parse_csharp_types(source, "test.cs", None);
        assert_eq!(types.len(), 3);
        let names: Vec<&str> = types.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Extensions"));
        assert!(names.contains(&"SingletonManager"));
        assert!(names.contains(&"LargeClass"));
    }

    #[test]
    fn test_keywords_not_matched() {
        let source = r#"
var x = new int();
public class RealClass { }
"#;
        let types = parse_csharp_types(source, "test.cs", None);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "RealClass");
    }

    #[test]
    fn test_generic_class() {
        // Our regex only captures the base name before '<'
        let source = "public class Container<T> where T : Component { }";
        let types = parse_csharp_types(source, "test.cs", None);
        assert!(!types.is_empty());
        // The regex should match "Container" (the \w+ stops before <)
        assert!(types.iter().any(|t| t.name == "Container"));
    }

    #[test]
    fn test_read_meta_guid_with_tempfile() {
        let tmp = tempfile::tempdir().unwrap();
        let cs_path = tmp.path().join("Test.cs");
        let meta_path = tmp.path().join("Test.cs.meta");

        fs::write(&cs_path, "public class Test { }").unwrap();
        fs::write(&meta_path, "fileFormatVersion: 2\nguid: aabbccdd00112233aabbccdd00112233\nMonoImporter:\n").unwrap();

        let guid = read_meta_guid(&cs_path);
        assert_eq!(guid.as_deref(), Some("aabbccdd00112233aabbccdd00112233"));
    }

    #[test]
    fn test_read_meta_guid_missing_meta() {
        let tmp = tempfile::tempdir().unwrap();
        let cs_path = tmp.path().join("NoMeta.cs");
        fs::write(&cs_path, "public class NoMeta { }").unwrap();

        let guid = read_meta_guid(&cs_path);
        assert!(guid.is_none());
    }

    #[test]
    fn test_extract_types_from_file() {
        let tmp = tempfile::tempdir().unwrap();
        let cs_path = tmp.path().join("Assets").join("Scripts").join("Player.cs");
        let meta_path = tmp.path().join("Assets").join("Scripts").join("Player.cs.meta");

        fs::create_dir_all(cs_path.parent().unwrap()).unwrap();
        fs::write(&cs_path, r#"
namespace Game {
    public class Player : MonoBehaviour { }
    public enum PlayerState { Idle, Running }
}
"#).unwrap();
        fs::write(&meta_path, "fileFormatVersion: 2\nguid: 11111111111111111111111111111111\n").unwrap();

        let types = extract_types_from_file(&cs_path, Some(tmp.path()));
        assert_eq!(types.len(), 2);

        let player = types.iter().find(|t| t.name == "Player").unwrap();
        assert_eq!(player.kind, "class");
        assert_eq!(player.namespace.as_deref(), Some("Game"));
        assert_eq!(player.guid.as_deref(), Some("11111111111111111111111111111111"));
        assert!(player.file_path.contains("Player.cs"));
    }

    #[test]
    fn test_build_type_registry_temp_project() {
        let tmp = tempfile::tempdir().unwrap();
        let scripts = tmp.path().join("Assets").join("Scripts");
        fs::create_dir_all(&scripts).unwrap();

        fs::write(scripts.join("Foo.cs"), "public class Foo { }").unwrap();
        fs::write(scripts.join("Foo.cs.meta"), "fileFormatVersion: 2\nguid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n").unwrap();

        fs::write(scripts.join("Bar.cs"), "namespace MyGame {\n    public struct Bar { }\n}").unwrap();
        fs::write(scripts.join("Bar.cs.meta"), "fileFormatVersion: 2\nguid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n").unwrap();

        let types = build_type_registry(
            tmp.path().to_string_lossy().to_string(),
            None,
            None,
        );

        assert_eq!(types.len(), 2);
        let foo = types.iter().find(|t| t.name == "Foo").unwrap();
        assert_eq!(foo.guid.as_deref(), Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));

        let bar = types.iter().find(|t| t.name == "Bar").unwrap();
        assert_eq!(bar.namespace.as_deref(), Some("MyGame"));
    }

    // ===== External fixtures tests =====

    fn fixtures_path() -> PathBuf {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest.join("..").join("test").join("fixtures").join("external")
    }

    #[test]
    fn test_extract_types_external_fixtures() {
        let fixtures = fixtures_path();
        if !fixtures.exists() {
            return;
        }

        let types = build_type_registry(
            fixtures.to_string_lossy().to_string(),
            None,
            None,
        );

        assert!(!types.is_empty(), "External fixtures should have C# types");

        // Should find GameManager
        let gm = types.iter().find(|t| t.name == "GameManager");
        assert!(gm.is_some(), "Should find GameManager class");
    }
}
