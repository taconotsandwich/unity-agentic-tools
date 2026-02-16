pub mod dll_reader;

use napi_derive::napi;
use rayon::prelude::*;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use walkdir::WalkDir;

use crate::common;

/// A serializable field extracted from a C# type.
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CSharpFieldRef {
    /// Field name (e.g., "health", "moveSpeed")
    pub name: String,
    /// C# type name (e.g., "int", "Vector3", "List<string>", "GameObject")
    pub type_name: String,
    /// Whether [SerializeField] attribute is present
    pub has_serialize_field: bool,
    /// Whether [SerializeReference] attribute is present
    pub has_serialize_reference: bool,
    /// Whether the field is public
    pub is_public: bool,
    /// Which type this field belongs to (e.g., "PlayerController")
    pub owner_type: String,
}

/// Extended type info with fields and base class, extracted on demand.
#[napi(object)]
#[derive(Clone, Debug)]
pub struct CSharpTypeInfo {
    /// Type name (e.g., "PlayerController")
    pub name: String,
    /// Kind: "class", "struct", "enum", or "interface"
    pub kind: String,
    /// Namespace (e.g., "UnityEngine.UI")
    pub namespace: Option<String>,
    /// Base class (e.g., "MonoBehaviour", "ScriptableObject")
    pub base_class: Option<String>,
    /// Serializable fields
    pub fields: Vec<CSharpFieldRef>,
}

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

// Type declaration that also captures base class (first item after ':')
static TYPE_DECL_WITH_BASE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)(?:^|\s)(?:public|internal|private|protected|abstract|sealed|static|partial|\s)*(class|struct|enum|interface)\s+(\w+)(?:<[^>]*>)?\s*(?::\s*([\w.]+))?",
    )
    .unwrap()
});

// Field attributes
static SERIALIZE_FIELD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[(?:\w+\s*,\s*)*SerializeField(?:\s*,\s*\w+)*\]").unwrap());
static SERIALIZE_REFERENCE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[(?:\w+\s*,\s*)*SerializeReference(?:\s*,\s*\w+)*\]").unwrap());
static NON_SERIALIZED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[(?:\w+\s*,\s*)*(?:System\.)?NonSerialized(?:\s*,\s*\w+)*\]").unwrap()
});
// Field declaration: captures (1) everything before the type, (2) type, (3) name
// Handles generics like List<int>, Dictionary<string, int>, arrays like int[], and nullable T?
// Leading attributes like [SerializeField] are stripped before matching (see strip_attributes).
static FIELD_DECL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)^\s*((?:(?:public|private|protected|internal|static|readonly|const|volatile|new)\s+)*)(\w[\w.]*(?:<[^>]+>)?(?:\[\s*\])?(?:\?)?)\s+(\w+)\s*[;=]",
    )
    .unwrap()
});

/// Strip leading `[...]` attribute annotations from a line.
///
/// Tracks bracket depth to handle nested brackets like `[Something(new[] { 1, 2, 3 })]`.
/// Also handles string literals inside attributes (e.g., `[Tooltip("some [text]")]`).
fn strip_attributes(line: &str) -> String {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    // Skip leading whitespace
    while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
        i += 1;
    }

    // Consume consecutive [...] blocks
    while i < len && bytes[i] == b'[' {
        let mut depth = 0;
        let mut in_string = false;
        loop {
            if i >= len {
                // Unterminated attribute — return original
                return line.to_string();
            }
            let ch = bytes[i];
            if in_string {
                if ch == b'\\' {
                    i += 2; // skip escaped char
                    continue;
                }
                if ch == b'"' {
                    in_string = false;
                }
            } else {
                if ch == b'"' {
                    in_string = true;
                } else if ch == b'[' {
                    depth += 1;
                } else if ch == b']' {
                    depth -= 1;
                    if depth == 0 {
                        i += 1; // skip the closing ]
                        break;
                    }
                }
            }
            i += 1;
        }

        // Skip whitespace between consecutive attributes
        while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
            i += 1;
        }
    }

    // Return the remainder (the actual code after attributes)
    line[i..].to_string()
}

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

    // Pre-process: strip string literals to avoid brace-counting corruption from multi-line strings
    let cleaned = strip_string_literals(content);
    let content = &cleaned;

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

/// Strip string literals from C# source to avoid false matches in multi-line strings.
///
/// Replaces string content (between quotes) with spaces, preserving newlines for
/// consistent line counting. Handles:
/// - Regular strings (`"..."`) — backslash escaping
/// - Verbatim strings (`@"..."`) — `""` is escaped quote, spans multiple lines
/// - Interpolated strings (`$"..."`, `$@"..."`, `@$"..."`)
/// - Char literals (`'x'`, `'\n'`)
fn strip_string_literals(content: &str) -> String {
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut result = String::with_capacity(len);
    let mut i = 0;

    while i < len {
        let ch = bytes[i];

        // Skip // line comments (they can contain quote characters)
        if ch == b'/' && i + 1 < len && bytes[i + 1] == b'/' {
            // Copy rest of line as-is (preserving newlines)
            while i < len && bytes[i] != b'\n' {
                result.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }

        // Detect prefixed string literals: @"...", $"...", $@"...", @$"..."
        if ch == b'@' || ch == b'$' {
            let mut is_verbatim = false;
            let mut j = i;
            while j < len && (bytes[j] == b'@' || bytes[j] == b'$') {
                if bytes[j] == b'@' { is_verbatim = true; }
                j += 1;
            }
            if j < len && bytes[j] == b'"' {
                // Copy prefix characters (@, $, @$, $@) and opening quote
                for k in i..=j {
                    result.push(bytes[k] as char);
                }
                i = j + 1; // past opening "
                // Replace content until closing quote
                if is_verbatim {
                    while i < len {
                        if bytes[i] == b'"' {
                            if i + 1 < len && bytes[i + 1] == b'"' {
                                result.push(' '); // replace escaped ""
                                result.push(' ');
                                i += 2;
                            } else {
                                result.push('"'); // closing quote
                                i += 1;
                                break;
                            }
                        } else if bytes[i] == b'\n' {
                            result.push('\n'); // preserve newlines
                            i += 1;
                        } else {
                            result.push(' '); // replace content
                            i += 1;
                        }
                    }
                } else {
                    while i < len {
                        if bytes[i] == b'\\' {
                            result.push(' ');
                            result.push(' ');
                            i += 2; // skip escaped char
                        } else if bytes[i] == b'"' {
                            result.push('"');
                            i += 1;
                            break;
                        } else if bytes[i] == b'\n' {
                            result.push('\n');
                            i += 1;
                        } else {
                            result.push(' ');
                            i += 1;
                        }
                    }
                }
                continue;
            }
            // Not a string literal prefix — fall through
        }

        // Regular string literal
        if ch == b'"' {
            result.push('"');
            i += 1;
            while i < len {
                if bytes[i] == b'\\' {
                    result.push(' ');
                    result.push(' ');
                    i += 2;
                } else if bytes[i] == b'"' {
                    result.push('"');
                    i += 1;
                    break;
                } else if bytes[i] == b'\n' {
                    result.push('\n');
                    i += 1;
                } else {
                    result.push(' ');
                    i += 1;
                }
            }
            continue;
        }

        // Char literal
        if ch == b'\'' {
            result.push('\'');
            i += 1;
            while i < len && bytes[i] != b'\'' {
                if bytes[i] == b'\\' {
                    result.push(' ');
                    if i + 1 < len { result.push(' '); }
                    i += 2;
                } else {
                    result.push(' ');
                    i += 1;
                }
            }
            if i < len {
                result.push('\'');
                i += 1;
            }
            continue;
        }

        result.push(ch as char);
        i += 1;
    }

    result
}

/// Strip block comments (/* ... */) from C# source to avoid false matches.
fn strip_block_comments(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            // Skip until closing */
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                // Preserve newlines so line counting stays consistent
                if bytes[i] == b'\n' {
                    result.push('\n');
                }
                i += 1;
            }
            if i + 1 < len {
                i += 2; // skip */
            }
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }

    result
}

/// Extract serialized field info from a single C# source file.
///
/// Returns extended type info with fields, base class, and serialization attributes.
/// This is called on-demand during component creation, not during registry builds.
#[napi]
pub fn extract_serialized_fields(path: String) -> Vec<CSharpTypeInfo> {
    let file = Path::new(&path);
    let content = match common::read_unity_file(file) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    extract_fields_from_source(&content)
}

/// Internal: parse C# source for type declarations with fields.
fn extract_fields_from_source(content: &str) -> Vec<CSharpTypeInfo> {
    let cleaned = strip_string_literals(&strip_block_comments(content));
    let lines: Vec<&str> = cleaned.lines().collect();

    // File-scoped namespace (C# 10+)
    let file_scoped_ns = FILE_SCOPED_NS_RE.captures(&cleaned).map(|c| c[1].to_string());

    // State tracking
    let mut namespace_stack: Vec<(String, i32)> = Vec::new(); // (namespace, brace_depth when entered)
    let mut type_stack: Vec<TypeStackEntry> = Vec::new();
    let mut brace_depth: i32 = 0;
    let mut types: Vec<CSharpTypeInfo> = Vec::new();

    // Pending attribute flags (accumulated across lines)
    let mut pending_serialize_field = false;
    let mut pending_serialize_reference = false;
    let mut pending_non_serialized = false;

    // Track whether we're inside a string literal on the current line
    // (simple heuristic — skip lines that look like they're inside multi-line strings)

    for line in &lines {
        let trimmed = line.trim();

        // Skip empty lines, single-line comments, preprocessor
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
            continue;
        }

        // Check for attributes (can span multiple lines before a field/type)
        if SERIALIZE_FIELD_RE.is_match(trimmed) {
            pending_serialize_field = true;
        }
        if SERIALIZE_REFERENCE_RE.is_match(trimmed) {
            pending_serialize_reference = true;
        }
        if NON_SERIALIZED_RE.is_match(trimmed) {
            pending_non_serialized = true;
        }
        // HideInInspector doesn't affect serialization — field is still serialized

        // Check for namespace declaration (only if not file-scoped)
        if file_scoped_ns.is_none() {
            if let Some(caps) = BRACED_NS_RE.captures(trimmed) {
                namespace_stack.push((caps[1].to_string(), brace_depth));
            }
        }

        // Check for type declaration
        if let Some(caps) = TYPE_DECL_WITH_BASE_RE.captures(trimmed) {
            let kind = caps[1].to_string();
            let name = caps[2].to_string();
            let base_class = caps.get(3).map(|m| m.as_str().to_string());

            if !is_keyword(&name) {
                let namespace = if let Some(ref ns) = file_scoped_ns {
                    Some(ns.clone())
                } else {
                    namespace_stack.last().map(|(ns, _)| ns.clone())
                };

                type_stack.push(TypeStackEntry {
                    name: name.clone(),
                    kind: kind.clone(),
                    namespace,
                    base_class,
                    entry_depth: brace_depth,
                    entered_body: false,
                    fields: Vec::new(),
                });

                // Reset pending attributes (consumed by type declaration)
                pending_serialize_field = false;
                pending_serialize_reference = false;
                pending_non_serialized = false;
            }
        }
        // Check for field declaration (only inside a type body)
        else if !type_stack.is_empty() {
            // Strip leading [...] attributes so FIELD_DECL_RE can match
            let stripped = strip_attributes(trimmed);
            if let Some(caps) = FIELD_DECL_RE.captures(&stripped) {
                let modifiers_str = caps[1].to_string();
                let type_name = caps[2].to_string();
                let field_name = caps[3].to_string();

                // Skip if field name is a keyword false positive
                // (don't check type_name — int/float/string etc. are valid field types)
                if !is_keyword(&field_name) {
                    let is_static = modifiers_str.contains("static");
                    let is_const = modifiers_str.contains("const");
                    let is_readonly = modifiers_str.contains("readonly");
                    let is_public = modifiers_str.contains("public");

                    // Apply Unity serialization rules:
                    // Skip static, const, readonly
                    if !is_static && !is_const && !is_readonly {
                        // Serialized if: (public && !NonSerialized) || [SerializeField]
                        let serialized = (is_public && !pending_non_serialized)
                            || pending_serialize_field;

                        if serialized {
                            let owner_name = type_stack.last().unwrap().name.clone();
                            let field = CSharpFieldRef {
                                name: field_name,
                                type_name,
                                has_serialize_field: pending_serialize_field,
                                has_serialize_reference: pending_serialize_reference,
                                is_public,
                                owner_type: owner_name,
                            };
                            type_stack.last_mut().unwrap().fields.push(field);
                        }
                    }

                    // Reset pending attributes (consumed by field)
                    pending_serialize_field = false;
                    pending_serialize_reference = false;
                    pending_non_serialized = false;
                }
            }
        }

        // Count braces for depth tracking
        // Simple approach: count { and } on the line (skip strings/chars for correctness)
        let brace_delta = count_braces_simple(trimmed);
        brace_depth += brace_delta;

        // Mark types whose body has been entered (brace_depth went above entry_depth).
        // This prevents premature popping of Allman-style declarations where the
        // opening { is on a separate line from the type declaration.
        for entry in type_stack.iter_mut() {
            if !entry.entered_body && brace_depth > entry.entry_depth {
                entry.entered_body = true;
            }
        }

        // Pop types that have closed (only after their body was entered)
        while let Some(entry) = type_stack.last() {
            if entry.entered_body && brace_depth <= entry.entry_depth {
                let entry = type_stack.pop().unwrap();
                types.push(CSharpTypeInfo {
                    name: entry.name,
                    kind: entry.kind,
                    namespace: entry.namespace,
                    base_class: entry.base_class,
                    fields: entry.fields,
                });
            } else {
                break;
            }
        }

        // Pop namespaces that have closed
        while let Some(&(_, ns_depth)) = namespace_stack.last() {
            if brace_depth <= ns_depth {
                namespace_stack.pop();
            } else {
                break;
            }
        }

    }

    // Handle any types still on the stack (e.g., EOF without closing brace)
    while let Some(entry) = type_stack.pop() {
        types.push(CSharpTypeInfo {
            name: entry.name,
            kind: entry.kind,
            namespace: entry.namespace,
            base_class: entry.base_class,
            fields: entry.fields,
        });
    }

    // Post-process: resolve same-file enum types to "int"
    // Unity serializes enums as int (default 0), so replace field type_name
    // with "int" when the type is a known enum from this same source file.
    let enum_names: std::collections::HashSet<String> = types
        .iter()
        .filter(|t| t.kind == "enum")
        .map(|t| t.name.clone())
        .collect();

    if !enum_names.is_empty() {
        for t in &mut types {
            for field in &mut t.fields {
                if enum_names.contains(&field.type_name) {
                    field.type_name = "int".to_string();
                }
            }
        }
    }

    types
}

/// Temporary state for a type being parsed.
struct TypeStackEntry {
    name: String,
    kind: String,
    namespace: Option<String>,
    base_class: Option<String>,
    entry_depth: i32,
    entered_body: bool,
    fields: Vec<CSharpFieldRef>,
}

/// Count net brace changes on a line, skipping string literals, char literals, and comments.
///
/// Handles C# string variants:
/// - Regular strings (`"..."`) — backslash escaping
/// - Verbatim strings (`@"..."`) — `""` is escaped quote, no backslash escaping
/// - Interpolated strings (`$"..."`) — skip brace counting inside
/// - Interpolated verbatim (`$@"..."` / `@$"..."`) — combine both rules
fn count_braces_simple(line: &str) -> i32 {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut count: i32 = 0;
    let mut i = 0;

    while i < len {
        let ch = bytes[i];

        // Check for // line comment
        if ch == b'/' && i + 1 < len && bytes[i + 1] == b'/' {
            break; // rest of line is comment
        }

        // Check for string literal starts
        if ch == b'@' || ch == b'$' {
            // Detect prefix combination: $@, @$, $, @
            let mut is_verbatim = false;
            let mut is_interpolated = false;
            let mut j = i;
            while j < len && (bytes[j] == b'@' || bytes[j] == b'$') {
                if bytes[j] == b'@' { is_verbatim = true; }
                if bytes[j] == b'$' { is_interpolated = true; }
                j += 1;
            }
            if j < len && bytes[j] == b'"' {
                // This is a prefixed string literal — skip it
                i = skip_string_literal(bytes, j, is_verbatim, is_interpolated);
                continue;
            }
            // Not followed by quote — fall through to normal processing
        }

        if ch == b'"' {
            // Regular string literal
            i = skip_string_literal(bytes, i, false, false);
            continue;
        }

        if ch == b'\'' {
            // Char literal: skip 'x' or '\x' or '\xx'
            i = skip_char_literal(bytes, i);
            continue;
        }

        if ch == b'{' {
            count += 1;
        } else if ch == b'}' {
            count -= 1;
        }

        i += 1;
    }

    count
}

/// Skip past a string literal starting at position `start` (which points to the opening `"`).
/// Returns the index of the byte immediately after the closing `"`.
fn skip_string_literal(bytes: &[u8], start: usize, verbatim: bool, _interpolated: bool) -> usize {
    let len = bytes.len();
    let mut i = start + 1; // skip opening "

    if verbatim {
        // Verbatim string: "" is escaped quote, no backslash escaping
        while i < len {
            if bytes[i] == b'"' {
                if i + 1 < len && bytes[i + 1] == b'"' {
                    i += 2; // skip escaped ""
                } else {
                    return i + 1; // closing "
                }
            } else {
                i += 1;
            }
        }
    } else {
        // Regular string: backslash escaping
        while i < len {
            if bytes[i] == b'\\' {
                i += 2; // skip escaped char
            } else if bytes[i] == b'"' {
                return i + 1; // closing "
            } else {
                i += 1;
            }
        }
    }

    // Unterminated string — return past end
    len
}

/// Skip past a char literal starting at position `start` (which points to the opening `'`).
/// Returns the index of the byte immediately after the closing `'`.
fn skip_char_literal(bytes: &[u8], start: usize) -> usize {
    let len = bytes.len();
    let mut i = start + 1; // skip opening '

    if i < len && bytes[i] == b'\\' {
        // Escaped char: '\n', '\x41', '\u0041', etc. — skip up to 6 chars then find closing '
        i += 1;
        while i < len && bytes[i] != b'\'' {
            i += 1;
        }
        if i < len { i + 1 } else { len }
    } else {
        // Simple char: 'x'
        if i < len { i += 1; } // skip the char
        if i < len && bytes[i] == b'\'' { i + 1 } else { len }
    }
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

    // ===== Field extraction tests =====

    #[test]
    fn test_extract_simple_public_fields() {
        let source = r#"
public class PlayerController : MonoBehaviour {
    public int health = 100;
    public float moveSpeed;
    public string playerName;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        let t = &types[0];
        assert_eq!(t.name, "PlayerController");
        assert_eq!(t.base_class.as_deref(), Some("MonoBehaviour"));
        assert_eq!(t.fields.len(), 3);

        assert_eq!(t.fields[0].name, "health");
        assert_eq!(t.fields[0].type_name, "int");
        assert!(t.fields[0].is_public);

        assert_eq!(t.fields[1].name, "moveSpeed");
        assert_eq!(t.fields[1].type_name, "float");

        assert_eq!(t.fields[2].name, "playerName");
        assert_eq!(t.fields[2].type_name, "string");
    }

    #[test]
    fn test_extract_serialize_field_private() {
        let source = r#"
public class MyScript : MonoBehaviour {
    [SerializeField]
    private int _secret;
    private int _notSerialized;
    [SerializeField] private float _rate;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        let fields = &types[0].fields;

        // _secret: has [SerializeField], should be serialized
        let secret = fields.iter().find(|f| f.name == "_secret");
        assert!(secret.is_some(), "Should find _secret");
        assert!(secret.unwrap().has_serialize_field);

        // _notSerialized: private without [SerializeField], should NOT be serialized
        let not_serialized = fields.iter().find(|f| f.name == "_notSerialized");
        assert!(not_serialized.is_none(), "_notSerialized should not appear");

        // _rate: has [SerializeField], should be serialized
        let rate = fields.iter().find(|f| f.name == "_rate");
        assert!(rate.is_some(), "Should find _rate");
    }

    #[test]
    fn test_skip_static_const_readonly() {
        let source = r#"
public class SkipTest : MonoBehaviour {
    public static int StaticField;
    public const int ConstField = 42;
    public readonly int ReadonlyField;
    public int NormalField;
}
"#;
        let types = extract_fields_from_source(source);
        let fields = &types[0].fields;
        assert_eq!(fields.len(), 1, "Only NormalField should survive");
        assert_eq!(fields[0].name, "NormalField");
    }

    #[test]
    fn test_extract_base_class() {
        let source = r#"
public class MyMono : MonoBehaviour { }
public class MySO : ScriptableObject { }
public class MyNetBeh : NetworkBehaviour { }
public class Standalone { }
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 4);

        let mono = types.iter().find(|t| t.name == "MyMono").unwrap();
        assert_eq!(mono.base_class.as_deref(), Some("MonoBehaviour"));

        let so = types.iter().find(|t| t.name == "MySO").unwrap();
        assert_eq!(so.base_class.as_deref(), Some("ScriptableObject"));

        let net = types.iter().find(|t| t.name == "MyNetBeh").unwrap();
        assert_eq!(net.base_class.as_deref(), Some("NetworkBehaviour"));

        let standalone = types.iter().find(|t| t.name == "Standalone").unwrap();
        assert!(standalone.base_class.is_none());
    }

    #[test]
    fn test_unity_types() {
        let source = r#"
public class FieldTypes : MonoBehaviour {
    public Vector3 position;
    public GameObject target;
    public List<int> scores;
    public float[] weights;
}
"#;
        let types = extract_fields_from_source(source);
        let fields = &types[0].fields;
        assert_eq!(fields.len(), 4);

        assert_eq!(fields[0].type_name, "Vector3");
        assert_eq!(fields[1].type_name, "GameObject");
        assert_eq!(fields[2].type_name, "List<int>");
        assert_eq!(fields[3].type_name, "float[]");
    }

    #[test]
    fn test_non_serialized_attribute() {
        let source = r#"
public class AttrTest : MonoBehaviour {
    public int visible;
    [NonSerialized]
    public int hidden;
    [System.NonSerialized]
    public int alsoHidden;
}
"#;
        let types = extract_fields_from_source(source);
        let fields = &types[0].fields;
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].name, "visible");
    }

    #[test]
    fn test_multiple_types_fields_correct_owner() {
        let source = r#"
public class Alpha : MonoBehaviour {
    public int a;
}
public class Beta : MonoBehaviour {
    public float b;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 2);

        let alpha = types.iter().find(|t| t.name == "Alpha").unwrap();
        assert_eq!(alpha.fields.len(), 1);
        assert_eq!(alpha.fields[0].name, "a");
        assert_eq!(alpha.fields[0].owner_type, "Alpha");

        let beta = types.iter().find(|t| t.name == "Beta").unwrap();
        assert_eq!(beta.fields.len(), 1);
        assert_eq!(beta.fields[0].name, "b");
        assert_eq!(beta.fields[0].owner_type, "Beta");
    }

    #[test]
    fn test_block_comment_stripping() {
        let source = r#"
/* public class Commented : MonoBehaviour {
    public int fake;
} */
public class Real : MonoBehaviour {
    public int real;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "Real");
        assert_eq!(types[0].fields.len(), 1);
        assert_eq!(types[0].fields[0].name, "real");
    }

    #[test]
    fn test_braces_in_strings_handled() {
        let source = r#"
public class BraceTest : MonoBehaviour {
    public string text = "hello { world }";
    public int count;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].fields.len(), 2);
    }

    #[test]
    fn test_serialize_reference_attribute() {
        let source = r#"
public class RefTest : MonoBehaviour {
    [SerializeReference]
    public IAbility ability;
}
"#;
        let types = extract_fields_from_source(source);
        let fields = &types[0].fields;
        assert_eq!(fields.len(), 1);
        assert!(fields[0].has_serialize_reference);
    }

    #[test]
    fn test_file_scoped_namespace_fields() {
        let source = r#"
namespace Game.Player;

public class PlayerController : MonoBehaviour {
    public int health;
    public float speed;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].namespace.as_deref(), Some("Game.Player"));
        assert_eq!(types[0].fields.len(), 2);
    }

    // ===== Brace counting: string literal tests =====

    #[test]
    fn test_count_braces_verbatim_string() {
        // @"..." verbatim strings — braces inside should not count
        assert_eq!(count_braces_simple(r#"string s = @"some { braces }";"#), 0);
    }

    #[test]
    fn test_count_braces_interpolated_string() {
        // $"..." interpolated strings — braces inside should not count
        assert_eq!(count_braces_simple(r#"string s = $"Value: {x}";"#), 0);
    }

    #[test]
    fn test_count_braces_interpolated_verbatim() {
        // $@"..." interpolated verbatim strings
        assert_eq!(count_braces_simple(r#"string s = $@"Path: {dir}\file";"#), 0);
        // @$"..." alternate order
        assert_eq!(count_braces_simple(r#"string s = @$"Path: {dir}\file";"#), 0);
    }

    #[test]
    fn test_count_braces_normal_still_works() {
        assert_eq!(count_braces_simple("class Foo {"), 1);
        assert_eq!(count_braces_simple("}"), -1);
        assert_eq!(count_braces_simple("if (x) { y(); }"), 0);
    }

    #[test]
    fn test_count_braces_verbatim_with_escaped_quote() {
        // @"He said ""hello""" — the "" is an escaped quote in verbatim strings
        assert_eq!(count_braces_simple(r#"string s = @"He said ""hello { }""";"#), 0);
    }

    // ===== strip_attributes tests =====

    #[test]
    fn test_strip_attributes_nested_brackets() {
        // Nested brackets like [Something(new[] { 1, 2, 3 })]
        let result = strip_attributes("[Something(new[] { 1, 2, 3 })] public int value;");
        assert_eq!(result, "public int value;");
    }

    #[test]
    fn test_strip_attributes_multiple() {
        // Consecutive attributes
        let result = strip_attributes("[SerializeField] [Range(0, 10)] private float speed;");
        assert_eq!(result, "private float speed;");
    }

    #[test]
    fn test_strip_attributes_no_attributes() {
        let result = strip_attributes("public int health;");
        assert_eq!(result, "public int health;");
    }

    #[test]
    fn test_strip_attributes_with_leading_whitespace() {
        let result = strip_attributes("    [Header(\"Stats\")] public int hp;");
        assert_eq!(result, "public int hp;");
    }

    #[test]
    fn test_strip_attributes_string_with_brackets() {
        // String literal inside attribute containing brackets
        let result = strip_attributes(r#"[Tooltip("Array [0]")] public int x;"#);
        assert_eq!(result, "public int x;");
    }

    // ===== Field extraction with complex attributes =====

    #[test]
    fn test_fields_with_nested_bracket_attribute() {
        let source = r#"
public class ComplexAttrs : MonoBehaviour {
    [Something(new[] { 1, 2, 3 })]
    public int data;
    public float speed;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].fields.len(), 2);
        assert_eq!(types[0].fields[0].name, "data");
        assert_eq!(types[0].fields[1].name, "speed");
    }

    #[test]
    fn test_verbatim_string_in_class_body() {
        // Verbatim string with braces in an initializer should not corrupt brace counting
        let source = r#"
public class StringTest : MonoBehaviour {
    public string template = @"Hello { world }";
    public int count;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].fields.len(), 2);
        assert_eq!(types[0].fields[0].name, "template");
        assert_eq!(types[0].fields[1].name, "count");
    }

    // ===== Same-file enum resolution =====

    #[test]
    fn test_enum_fields_resolved_to_int() {
        let source = r#"
public enum Faction { Ally, Enemy, Neutral }

public class Unit : MonoBehaviour {
    public Faction team;
    public int health;
}
"#;
        let types = extract_fields_from_source(source);
        let unit = types.iter().find(|t| t.name == "Unit").unwrap();
        assert_eq!(unit.fields.len(), 2);

        let team = unit.fields.iter().find(|f| f.name == "team").unwrap();
        assert_eq!(team.type_name, "int", "Same-file enum should be resolved to int");

        let health = unit.fields.iter().find(|f| f.name == "health").unwrap();
        assert_eq!(health.type_name, "int");
    }

    #[test]
    fn test_enum_in_different_type_not_resolved() {
        // An enum NOT defined in the same source should stay as-is
        let source = r#"
public class Unit : MonoBehaviour {
    public ExternalEnum faction;
    public int health;
}
"#;
        let types = extract_fields_from_source(source);
        let unit = types.iter().find(|t| t.name == "Unit").unwrap();
        let faction = unit.fields.iter().find(|f| f.name == "faction").unwrap();
        assert_eq!(faction.type_name, "ExternalEnum", "External enum type should stay as-is");
    }

    // ===== Multi-line string literal tests =====

    #[test]
    fn test_multiline_verbatim_string_does_not_corrupt_braces() {
        // A multi-line verbatim string with braces should not corrupt brace counting
        let source = r#"
public class SqlHelper : MonoBehaviour {
    public string query = @"
        SELECT *
        FROM users
        WHERE name = '{name}'
        AND active = {1}
    ";
    public int timeout;
    public float retryDelay;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].name, "SqlHelper");
        assert_eq!(types[0].fields.len(), 3, "All 3 fields should be extracted despite multi-line string with braces");
        assert_eq!(types[0].fields[0].name, "query");
        assert_eq!(types[0].fields[1].name, "timeout");
        assert_eq!(types[0].fields[2].name, "retryDelay");
    }

    #[test]
    fn test_multiline_interpolated_verbatim_string() {
        let source = r#"
public class TemplateScript : MonoBehaviour {
    public string template = $@"
        <div class=""container"">
            {content}
        </div>
    ";
    public int maxLength;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].fields.len(), 2);
        assert_eq!(types[0].fields[0].name, "template");
        assert_eq!(types[0].fields[1].name, "maxLength");
    }

    #[test]
    fn test_multiple_multiline_strings_in_class() {
        let source = r#"
public class ConfigScript : MonoBehaviour {
    public int health = 100;
    private string _xml = @"
        <root>
            <item name=""test"">
                {value}
            </item>
        </root>
    ";
    public float speed = 5.0f;
    private string _json = @"
        {
            ""key"": ""value"",
            ""nested"": { ""a"": 1 }
        }
    ";
    public string label;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        // health, speed, label are public (serialized); _xml and _json are private (not serialized)
        assert_eq!(types[0].fields.len(), 3, "Should extract health, speed, label despite multi-line strings");
        let names: Vec<&str> = types[0].fields.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"health"));
        assert!(names.contains(&"speed"));
        assert!(names.contains(&"label"));
    }

    #[test]
    fn test_strip_string_literals_preserves_newlines() {
        let input = "line1\nstring s = @\"multi\nline\nstring\";\nline4";
        let result = strip_string_literals(input);
        // Should have same number of newlines
        assert_eq!(result.chars().filter(|&c| c == '\n').count(), 4);
        // The string content should be replaced but structure preserved
        assert!(result.contains("line1"));
        assert!(result.contains("line4"));
    }

    #[test]
    fn test_strip_string_literals_regular_string() {
        let input = r#"string s = "hello { world }";"#;
        let result = strip_string_literals(input);
        // Should not contain the brace-containing content
        assert!(!result.contains("hello { world }"));
        // But should preserve the overall structure
        assert!(result.contains("string s = \""));
    }

    // ===== Allman-style brace tests =====
    // Standard C# convention: opening brace on its own line

    #[test]
    fn test_allman_style_fields_extracted() {
        // Standard Allman-style C# (99% of Unity projects)
        let source = r#"
public class PlayerController : MonoBehaviour
{
    public int health = 100;
    public float moveSpeed;
    public string playerName;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        let t = &types[0];
        assert_eq!(t.name, "PlayerController");
        assert_eq!(t.base_class.as_deref(), Some("MonoBehaviour"));
        assert_eq!(t.fields.len(), 3, "All 3 fields must be extracted with Allman braces");
        assert_eq!(t.fields[0].name, "health");
        assert_eq!(t.fields[1].name, "moveSpeed");
        assert_eq!(t.fields[2].name, "playerName");
    }

    #[test]
    fn test_allman_style_nested_types() {
        let source = r#"
public class Outer : MonoBehaviour
{
    public int outerField;

    public class Inner
    {
        public float innerField;
    }

    public string afterInner;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 2, "Should find both Outer and Inner");

        let outer = types.iter().find(|t| t.name == "Outer").expect("Should find Outer");
        assert_eq!(outer.fields.len(), 2);
        assert_eq!(outer.fields[0].name, "outerField");
        assert_eq!(outer.fields[1].name, "afterInner");

        let inner = types.iter().find(|t| t.name == "Inner").expect("Should find Inner");
        assert_eq!(inner.fields.len(), 1);
        assert_eq!(inner.fields[0].name, "innerField");
    }

    #[test]
    fn test_allman_style_with_namespace() {
        let source = r#"
namespace Game.Player;

public class PlayerController : MonoBehaviour
{
    public int health;
    public Vector3 position;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].namespace.as_deref(), Some("Game.Player"));
        assert_eq!(types[0].fields.len(), 2);
    }

    #[test]
    fn test_allman_style_serialize_field() {
        let source = r#"
public class MyScript : MonoBehaviour
{
    [SerializeField]
    private int _secret;
    private int _notSerialized;
    public float speed;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 1);
        let fields = &types[0].fields;
        assert_eq!(fields.len(), 2);
        assert!(fields.iter().any(|f| f.name == "_secret"), "Should find [SerializeField] private _secret");
        assert!(fields.iter().any(|f| f.name == "speed"), "Should find public speed");
        assert!(!fields.iter().any(|f| f.name == "_notSerialized"), "Should NOT find private _notSerialized");
    }

    #[test]
    fn test_allman_style_enum_resolved_to_int() {
        let source = r#"
public enum Faction
{
    Red,
    Blue,
    Green,
}

public class Unit : MonoBehaviour
{
    public Faction team;
    public int health;
}
"#;
        let types = extract_fields_from_source(source);
        let unit = types.iter().find(|t| t.name == "Unit").expect("Should find Unit");
        assert_eq!(unit.fields.len(), 2);
        // Same-file enum should be resolved to "int"
        assert_eq!(unit.fields[0].name, "team");
        assert_eq!(unit.fields[0].type_name, "int", "Enum field should be resolved to int");
        assert_eq!(unit.fields[1].name, "health");
        assert_eq!(unit.fields[1].type_name, "int");
    }

    #[test]
    fn test_mixed_brace_styles() {
        // K&R for one class, Allman for another in the same file
        let source = r#"
public class KnR : MonoBehaviour {
    public int knrField;
}

public class Allman : MonoBehaviour
{
    public int allmanField;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 2);

        let knr = types.iter().find(|t| t.name == "KnR").expect("Should find KnR");
        assert_eq!(knr.fields.len(), 1);
        assert_eq!(knr.fields[0].name, "knrField");

        let allman = types.iter().find(|t| t.name == "Allman").expect("Should find Allman");
        assert_eq!(allman.fields.len(), 1);
        assert_eq!(allman.fields[0].name, "allmanField");
    }

    #[test]
    fn test_allman_style_multiple_classes() {
        // Multiple classes in one file, all Allman style
        let source = r#"
public class Health : MonoBehaviour
{
    public int maxHP;
    public int currentHP;
}

public class Movement : MonoBehaviour
{
    public float speed;
    public float jumpForce;
}

public class Inventory : MonoBehaviour
{
    public int capacity;
}
"#;
        let types = extract_fields_from_source(source);
        assert_eq!(types.len(), 3);

        let health = types.iter().find(|t| t.name == "Health").expect("Health");
        assert_eq!(health.fields.len(), 2);

        let movement = types.iter().find(|t| t.name == "Movement").expect("Movement");
        assert_eq!(movement.fields.len(), 2);

        let inventory = types.iter().find(|t| t.name == "Inventory").expect("Inventory");
        assert_eq!(inventory.fields.len(), 1);
    }

    // ===== parse_csharp_types with multi-line strings =====

    #[test]
    fn test_parse_types_with_multiline_string_in_body() {
        let source = r#"
namespace Game {
    public class Config {
        private string template = @"
            namespace Fake {
                class NotAClass { }
            }
        ";
    }

    public class RealClass { }
}
"#;
        let types = parse_csharp_types(source, "test.cs", None);
        // Should find Config and RealClass, but NOT NotAClass (it's inside a string)
        let names: Vec<&str> = types.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Config"), "Should find Config");
        assert!(names.contains(&"RealClass"), "Should find RealClass");
        assert!(!names.contains(&"NotAClass"), "Should NOT find NotAClass (inside string literal)");
    }
}
