//! Lightweight .NET DLL type extractor using ECMA-335 metadata.
//!
//! Reads TypeDef table entries from compiled .NET assemblies to extract
//! public type names and namespaces. Only reads PE headers, CLI metadata,
//! and the TypeDef + #Strings streams -- no method bodies, IL, or signatures.

use napi_derive::napi;
use std::path::Path;

use super::CSharpTypeRef;

/// ECMA-335 metadata table IDs we care about.
const TYPEDEF_TABLE: usize = 0x02;

/// TypeDef visibility mask (3 bits).
const VISIBILITY_MASK: u32 = 0x07;

/// Public visibility flags.
const TD_PUBLIC: u32 = 0x01;
const TD_NESTED_PUBLIC: u32 = 0x02;

/// Type classification flags.
const TD_CLASS_SEMANTICS_MASK: u32 = 0x00000020;
const TD_INTERFACE: u32 = 0x00000020;

/// Extract type names from a single .NET DLL.
///
/// Returns public types with their name and namespace.
/// GUID is always None for DLL types (they have no .meta files).
#[napi]
pub fn extract_dll_types(path: String) -> Vec<CSharpTypeRef> {
    let p = Path::new(&path);
    extract_types_from_dll(p, &path)
}

/// Internal extraction from a DLL file.
pub(crate) fn extract_types_from_dll(path: &Path, rel_path: &str) -> Vec<CSharpTypeRef> {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    match parse_dotnet_types(&data, rel_path) {
        Ok(types) => types,
        Err(_) => vec![],
    }
}

/// Parse .NET metadata from raw PE file bytes.
fn parse_dotnet_types(data: &[u8], file_path: &str) -> Result<Vec<CSharpTypeRef>, DllError> {
    // Step 1: Parse PE to find CLI header
    let pe = goblin::pe::PE::parse(data).map_err(|_| DllError::NotPe)?;

    // The CLR data directory is index 14 (IMAGE_DIRECTORY_ENTRY_COM_DESCRIPTOR)
    let optional_header = pe.header.optional_header.ok_or(DllError::NoCli)?;
    let cli_dir = optional_header
        .data_directories
        .get_clr_runtime_header()
        .ok_or(DllError::NoCli)?;

    if cli_dir.virtual_address == 0 {
        return Err(DllError::NoCli);
    }

    let cli_rva = cli_dir.virtual_address as usize;
    let cli_offset = rva_to_offset(&pe, cli_rva).ok_or(DllError::NoCli)?;

    // Step 2: Read CLI header (cor20 header) to get metadata RVA
    if cli_offset + 16 > data.len() {
        return Err(DllError::Truncated);
    }

    // Metadata directory is at offset 8 in CLI header (RVA + Size)
    let metadata_rva = read_u32(data, cli_offset + 8) as usize;
    let metadata_offset = rva_to_offset(&pe, metadata_rva).ok_or(DllError::Truncated)?;

    // Step 3: Parse metadata root
    if metadata_offset + 16 > data.len() {
        return Err(DllError::Truncated);
    }

    // Check signature: 0x424A5342 ("BSJB")
    let sig = read_u32(data, metadata_offset);
    if sig != 0x424A5342 {
        return Err(DllError::BadSignature);
    }

    // Skip: signature(4) + major(2) + minor(2) + reserved(4) + version_length(4)
    let version_len = read_u32(data, metadata_offset + 12) as usize;
    // Align to 4 bytes
    let version_len_aligned = (version_len + 3) & !3;

    let streams_offset = metadata_offset + 16 + version_len_aligned;
    if streams_offset + 4 > data.len() {
        return Err(DllError::Truncated);
    }

    // Skip flags (2 bytes), read number of streams
    let num_streams = read_u16(data, streams_offset + 2) as usize;

    // Step 4: Find #Strings and #~ streams
    let mut strings_offset = 0usize;
    let mut strings_size = 0usize;
    let mut tables_offset = 0usize;

    let mut cursor = streams_offset + 4;
    for _ in 0..num_streams {
        if cursor + 8 > data.len() {
            return Err(DllError::Truncated);
        }

        let stream_offset = read_u32(data, cursor) as usize;
        let stream_size = read_u32(data, cursor + 4) as usize;
        let name_start = cursor + 8;

        let name = read_null_terminated_string(data, name_start);
        // Align name to 4-byte boundary
        let name_bytes = name.len() + 1; // include null terminator
        let name_aligned = (name_bytes + 3) & !3;

        match name.as_str() {
            "#Strings" => {
                strings_offset = metadata_offset + stream_offset;
                strings_size = stream_size;
            }
            "#~" | "#-" => {
                tables_offset = metadata_offset + stream_offset;
            }
            _ => {}
        }

        cursor = name_start + name_aligned;
    }

    if strings_offset == 0 || tables_offset == 0 {
        return Err(DllError::MissingStream);
    }

    // Step 5: Parse #~ stream header
    if tables_offset + 24 > data.len() {
        return Err(DllError::Truncated);
    }

    // Skip reserved(4) + major(1) + minor(1)
    let heap_sizes = data[tables_offset + 6];
    let string_index_size = if heap_sizes & 0x01 != 0 { 4 } else { 2 };
    let guid_index_size = if heap_sizes & 0x02 != 0 { 4 } else { 2 };
    let blob_index_size = if heap_sizes & 0x04 != 0 { 4 } else { 2 };

    // Skip reserved(1) after heap_sizes
    // Valid mask (8 bytes) tells us which tables exist
    let valid_mask = read_u64(data, tables_offset + 8);
    // Sorted mask (8 bytes) - we skip
    // let _sorted_mask = read_u64(data, tables_offset + 16);

    // Row counts for each present table
    let mut row_counts_offset = tables_offset + 24;
    let mut row_counts: Vec<u32> = Vec::new();
    let mut table_indices: Vec<usize> = Vec::new();

    for i in 0..64 {
        if valid_mask & (1u64 << i) != 0 {
            if row_counts_offset + 4 > data.len() {
                return Err(DllError::Truncated);
            }
            row_counts.push(read_u32(data, row_counts_offset));
            table_indices.push(i);
            row_counts_offset += 4;
        }
    }

    // Find TypeDef table info
    let typedef_pos = table_indices.iter().position(|&i| i == TYPEDEF_TABLE);
    let typedef_row_count = match typedef_pos {
        Some(pos) => row_counts[pos] as usize,
        None => return Ok(vec![]), // No TypeDef table
    };

    // Calculate row sizes for tables before TypeDef to find its offset
    let tables_data_offset = row_counts_offset;

    // We need to calculate the byte offset to the TypeDef table rows
    // by summing row sizes of all tables that come before it
    let typedef_data_offset = calculate_table_offset(
        &table_indices,
        &row_counts,
        TYPEDEF_TABLE,
        tables_data_offset,
        string_index_size,
        guid_index_size,
        blob_index_size,
    );

    // TypeDef row layout:
    // Flags(4) + TypeName(string_idx) + TypeNamespace(string_idx) + Extends(coded_idx) + FieldList(idx) + MethodList(idx)
    //
    // Extends uses TypeDefOrRef coded index (2 bits tag)
    let typedef_or_ref_size = coded_index_size(&[0x02, 0x01, 0x1B], &table_indices, &row_counts, 2);

    // FieldList points to Field table (0x04)
    let field_table_pos = table_indices.iter().position(|&i| i == 0x04);
    let field_rows = field_table_pos.map(|p| row_counts[p]).unwrap_or(0);
    let field_index_size = if field_rows > 0xFFFF { 4 } else { 2 };

    // MethodList points to MethodDef table (0x06)
    let method_table_pos = table_indices.iter().position(|&i| i == 0x06);
    let method_rows = method_table_pos.map(|p| row_counts[p]).unwrap_or(0);
    let method_index_size = if method_rows > 0xFFFF { 4 } else { 2 };

    let typedef_row_size = 4 + string_index_size + string_index_size + typedef_or_ref_size + field_index_size + method_index_size;

    // Step 6: Read TypeDef rows
    let mut types = Vec::new();
    let strings_end = strings_offset + strings_size;

    for i in 0..typedef_row_count {
        let row_offset = typedef_data_offset + i * typedef_row_size;
        if row_offset + typedef_row_size > data.len() {
            break;
        }

        let flags = read_u32(data, row_offset);
        let name_idx = read_index(data, row_offset + 4, string_index_size);
        let namespace_idx = read_index(data, row_offset + 4 + string_index_size, string_index_size);

        // Filter: only public types
        let visibility = flags & VISIBILITY_MASK;
        if visibility != TD_PUBLIC && visibility != TD_NESTED_PUBLIC {
            continue;
        }

        // Read name and namespace from #Strings heap
        let name = read_string_from_heap(data, strings_offset, strings_end, name_idx);
        let namespace = read_string_from_heap(data, strings_offset, strings_end, namespace_idx);

        // Skip the module pseudo-type (<Module>)
        if name == "<Module>" {
            continue;
        }

        // Determine kind from flags
        let kind = if flags & TD_CLASS_SEMANTICS_MASK == TD_INTERFACE {
            "interface".to_string()
        } else {
            // We can't reliably distinguish class/struct/enum from flags alone
            // without reading the Extends column. Default to "class".
            "class".to_string()
        };

        let ns = if namespace.is_empty() {
            None
        } else {
            Some(namespace)
        };

        types.push(CSharpTypeRef {
            name,
            kind,
            namespace: ns,
            file_path: file_path.to_string(),
            guid: None,
        });
    }

    Ok(types)
}

// ========== Helper functions ==========

#[derive(Debug)]
enum DllError {
    NotPe,
    NoCli,
    Truncated,
    BadSignature,
    MissingStream,
}

fn rva_to_offset(pe: &goblin::pe::PE, rva: usize) -> Option<usize> {
    for section in &pe.sections {
        let section_rva = section.virtual_address as usize;
        let section_size = section.virtual_size as usize;
        if rva >= section_rva && rva < section_rva + section_size {
            let offset = section.pointer_to_raw_data as usize + (rva - section_rva);
            return Some(offset);
        }
    }
    None
}

fn read_u16(data: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([data[offset], data[offset + 1]])
}

fn read_u32(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
        data[offset + 4],
        data[offset + 5],
        data[offset + 6],
        data[offset + 7],
    ])
}

fn read_index(data: &[u8], offset: usize, size: usize) -> usize {
    if size == 4 {
        read_u32(data, offset) as usize
    } else {
        read_u16(data, offset) as usize
    }
}

fn read_null_terminated_string(data: &[u8], offset: usize) -> String {
    let mut end = offset;
    while end < data.len() && data[end] != 0 {
        end += 1;
    }
    String::from_utf8_lossy(&data[offset..end]).to_string()
}

fn read_string_from_heap(data: &[u8], heap_start: usize, heap_end: usize, index: usize) -> String {
    let start = heap_start + index;
    if start >= heap_end || start >= data.len() {
        return String::new();
    }
    let mut end = start;
    while end < heap_end && end < data.len() && data[end] != 0 {
        end += 1;
    }
    String::from_utf8_lossy(&data[start..end]).to_string()
}

/// Calculate the coded index size for a given set of tables.
fn coded_index_size(
    table_ids: &[usize],
    present_tables: &[usize],
    row_counts: &[u32],
    tag_bits: usize,
) -> usize {
    let max_rows = table_ids
        .iter()
        .map(|&id| {
            present_tables
                .iter()
                .position(|&t| t == id)
                .map(|pos| row_counts[pos])
                .unwrap_or(0)
        })
        .max()
        .unwrap_or(0);

    if max_rows < (1u32 << (16 - tag_bits)) {
        2
    } else {
        4
    }
}

/// Calculate byte offset to a specific table's data within the #~ stream.
///
/// Walks through tables in order, summing their sizes until we reach the target.
/// Only tables before the target affect the offset.
fn calculate_table_offset(
    table_indices: &[usize],
    row_counts: &[u32],
    target_table: usize,
    data_start: usize,
    string_idx_size: usize,
    guid_idx_size: usize,
    blob_idx_size: usize,
) -> usize {
    let mut offset = data_start;

    for (i, &table_id) in table_indices.iter().enumerate() {
        if table_id == target_table {
            return offset;
        }

        let row_size = table_row_size(
            table_id,
            string_idx_size,
            guid_idx_size,
            blob_idx_size,
            row_counts,
            table_indices,
        );
        offset += row_size * row_counts[i] as usize;
    }

    offset
}

/// Get the row size for a given ECMA-335 metadata table.
///
/// Only tables 0x00 (Module) and 0x01 (TypeRef) can appear before
/// TypeDef (0x02) in the metadata table ordering. We handle these
/// precisely. For any unexpected table before TypeDef, we return 0
/// (which would cause incorrect offsets, but this never happens
/// with valid .NET assemblies).
fn table_row_size(
    table_id: usize,
    string_idx_size: usize,
    guid_idx_size: usize,
    _blob_idx_size: usize,
    row_counts: &[u32],
    table_indices: &[usize],
) -> usize {
    match table_id {
        // Module (0x00): Generation(2) + Name(str) + Mvid(guid) + EncId(guid) + EncBaseId(guid)
        0x00 => 2 + string_idx_size + guid_idx_size * 3,

        // TypeRef (0x01): ResolutionScope(coded) + TypeName(str) + TypeNamespace(str)
        0x01 => {
            let resolution_scope_size = coded_index_size(
                &[0x00, 0x01, 0x1A, 0x23],
                table_indices,
                row_counts,
                2,
            );
            resolution_scope_size + string_idx_size * 2
        }

        // No other tables can precede TypeDef (0x02) in the ECMA-335 table ordering.
        _ => 0,
    }
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixtures_path() -> PathBuf {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest
            .join("..")
            .join("test")
            .join("fixtures")
            .join("external")
    }

    #[test]
    fn test_extract_from_nonexistent_dll() {
        let types = extract_types_from_dll(Path::new("/nonexistent/test.dll"), "test.dll");
        assert!(types.is_empty());
    }

    #[test]
    fn test_extract_from_non_pe_file() {
        let tmp = tempfile::tempdir().unwrap();
        let fake_dll = tmp.path().join("fake.dll");
        std::fs::write(&fake_dll, b"not a PE file at all").unwrap();

        let types = extract_types_from_dll(&fake_dll, "fake.dll");
        assert!(types.is_empty());
    }

    #[test]
    fn test_extract_from_external_fixtures_dlls() {
        let fixtures = fixtures_path();
        let dll_dir = fixtures.join("Library").join("ScriptAssemblies");
        if !dll_dir.exists() {
            return; // Skip if submodule not checked out
        }

        // Find any .dll files
        let mut found_dlls = false;
        for entry in walkdir::WalkDir::new(&dll_dir).into_iter().filter_map(|e| e.ok()) {
            if entry.path().extension().map(|e| e == "dll").unwrap_or(false) {
                found_dlls = true;
                let types = extract_types_from_dll(entry.path(), &entry.path().display().to_string());
                // Just verify it doesn't crash; DLLs may or may not be .NET
                let _ = types;
            }
        }

        if !found_dlls {
            // No DLLs in fixtures, that's OK
        }
    }
}
