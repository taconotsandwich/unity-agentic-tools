//! Lightweight .NET DLL type extractor using ECMA-335 metadata.
//!
//! Reads TypeDef table entries from compiled .NET assemblies to extract
//! public type names and namespaces. Optionally reads Field table + #Blob
//! stream to extract serialized field information for Unity YAML generation.

use napi_derive::napi;
use std::path::Path;

use super::{CSharpFieldRef, CSharpTypeInfo, CSharpTypeRef};

/// ECMA-335 metadata table IDs we care about.
const TYPEDEF_TABLE: usize = 0x02;
const TYPEREF_TABLE: usize = 0x01;
const FIELD_TABLE: usize = 0x04;

/// TypeDef visibility mask (3 bits).
const VISIBILITY_MASK: u32 = 0x07;

/// Public visibility flags.
const TD_PUBLIC: u32 = 0x01;
const TD_NESTED_PUBLIC: u32 = 0x02;

/// Type classification flags.
const TD_CLASS_SEMANTICS_MASK: u32 = 0x00000020;
const TD_INTERFACE: u32 = 0x00000020;

/// Field attribute flags.
const FIELD_ACCESS_MASK: u16 = 0x0007;
const FIELD_PUBLIC: u16 = 0x0006;
const FIELD_STATIC: u16 = 0x0010;
const FIELD_LITERAL: u16 = 0x0040;   // const
const FIELD_INIT_ONLY: u16 = 0x0020; // readonly

/// ECMA-335 element type bytes for signature decoding.
const ELEMENT_TYPE_BOOLEAN: u8 = 0x02;
const ELEMENT_TYPE_CHAR: u8 = 0x03;
const ELEMENT_TYPE_I1: u8 = 0x04;
const ELEMENT_TYPE_U1: u8 = 0x05;
const ELEMENT_TYPE_I2: u8 = 0x06;
const ELEMENT_TYPE_U2: u8 = 0x07;
const ELEMENT_TYPE_I4: u8 = 0x08;
const ELEMENT_TYPE_U4: u8 = 0x09;
const ELEMENT_TYPE_I8: u8 = 0x0A;
const ELEMENT_TYPE_U8: u8 = 0x0B;
const ELEMENT_TYPE_R4: u8 = 0x0C;
const ELEMENT_TYPE_R8: u8 = 0x0D;
const ELEMENT_TYPE_STRING: u8 = 0x0E;
const ELEMENT_TYPE_OBJECT: u8 = 0x1C;
const ELEMENT_TYPE_VALUETYPE: u8 = 0x11;
const ELEMENT_TYPE_CLASS: u8 = 0x12;
const ELEMENT_TYPE_GENERICINST: u8 = 0x15;
const ELEMENT_TYPE_SZARRAY: u8 = 0x1D;

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

    // Step 4: Find #Strings, #Blob, and #~ streams
    let mut strings_offset = 0usize;
    let mut strings_size = 0usize;
    let mut tables_offset = 0usize;

    let mut cursor = streams_offset + 4;
    for _ in 0..num_streams {
        if cursor + 8 > data.len() {
            return Err(DllError::Truncated);
        }

        let stream_offset = read_u32(data, cursor) as usize;
        let _stream_size = read_u32(data, cursor + 4) as usize;
        let name_start = cursor + 8;

        let name = read_null_terminated_string(data, name_start);
        // Align name to 4-byte boundary
        let name_bytes = name.len() + 1; // include null terminator
        let name_aligned = (name_bytes + 3) & !3;

        match name.as_str() {
            "#Strings" => {
                strings_offset = metadata_offset + stream_offset;
                strings_size = _stream_size;
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

/// Extract type info with fields from a single .NET DLL.
///
/// Returns extended type info including serializable fields, base class,
/// and struct/enum distinction via the Extends column.
#[napi]
pub fn extract_dll_fields(path: String) -> Vec<CSharpTypeInfo> {
    let p = Path::new(&path);
    let data = match std::fs::read(p) {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    match parse_dotnet_fields(&data) {
        Ok(types) => types,
        Err(_) => vec![],
    }
}

/// Parse .NET metadata to extract fields for each type.
fn parse_dotnet_fields(data: &[u8]) -> Result<Vec<CSharpTypeInfo>, DllError> {
    // Reuse the same PE + metadata parsing as parse_dotnet_types
    let pe = goblin::pe::PE::parse(data).map_err(|_| DllError::NotPe)?;
    let optional_header = pe.header.optional_header.ok_or(DllError::NoCli)?;
    let cli_dir = optional_header
        .data_directories
        .get_clr_runtime_header()
        .ok_or(DllError::NoCli)?;
    if cli_dir.virtual_address == 0 {
        return Err(DllError::NoCli);
    }
    let cli_offset = rva_to_offset(&pe, cli_dir.virtual_address as usize).ok_or(DllError::NoCli)?;
    if cli_offset + 16 > data.len() {
        return Err(DllError::Truncated);
    }
    let metadata_rva = read_u32(data, cli_offset + 8) as usize;
    let metadata_offset = rva_to_offset(&pe, metadata_rva).ok_or(DllError::Truncated)?;
    if metadata_offset + 16 > data.len() {
        return Err(DllError::Truncated);
    }
    let sig = read_u32(data, metadata_offset);
    if sig != 0x424A5342 {
        return Err(DllError::BadSignature);
    }
    let version_len = read_u32(data, metadata_offset + 12) as usize;
    let version_len_aligned = (version_len + 3) & !3;
    let streams_offset = metadata_offset + 16 + version_len_aligned;
    if streams_offset + 4 > data.len() {
        return Err(DllError::Truncated);
    }
    let num_streams = read_u16(data, streams_offset + 2) as usize;

    let mut strings_offset = 0usize;
    let mut strings_size = 0usize;
    let mut blob_offset = 0usize;
    let mut blob_size = 0usize;
    let mut tables_offset = 0usize;

    let mut cursor = streams_offset + 4;
    for _ in 0..num_streams {
        if cursor + 8 > data.len() {
            return Err(DllError::Truncated);
        }
        let stream_off = read_u32(data, cursor) as usize;
        let stream_sz = read_u32(data, cursor + 4) as usize;
        let name_start = cursor + 8;
        let name = read_null_terminated_string(data, name_start);
        let name_aligned = (name.len() + 1 + 3) & !3;
        match name.as_str() {
            "#Strings" => { strings_offset = metadata_offset + stream_off; strings_size = stream_sz; }
            "#Blob" => { blob_offset = metadata_offset + stream_off; blob_size = stream_sz; }
            "#~" | "#-" => { tables_offset = metadata_offset + stream_off; }
            _ => {}
        }
        cursor = name_start + name_aligned;
    }
    if strings_offset == 0 || tables_offset == 0 {
        return Err(DllError::MissingStream);
    }
    let strings_end = strings_offset + strings_size;
    let blob_end = blob_offset + blob_size;

    // Parse table header
    if tables_offset + 24 > data.len() {
        return Err(DllError::Truncated);
    }
    let heap_sizes = data[tables_offset + 6];
    let string_index_size = if heap_sizes & 0x01 != 0 { 4 } else { 2 };
    let guid_index_size = if heap_sizes & 0x02 != 0 { 4 } else { 2 };
    let blob_index_size = if heap_sizes & 0x04 != 0 { 4 } else { 2 };
    let valid_mask = read_u64(data, tables_offset + 8);

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
    let tables_data_offset = row_counts_offset;

    // --- Read TypeRef table for name resolution ---
    let typeref_pos = table_indices.iter().position(|&i| i == TYPEREF_TABLE);
    let typeref_row_count = typeref_pos.map(|p| row_counts[p] as usize).unwrap_or(0);
    let typeref_data_offset = calculate_table_offset(
        &table_indices, &row_counts, TYPEREF_TABLE, tables_data_offset,
        string_index_size, guid_index_size, blob_index_size,
    );
    let resolution_scope_size = coded_index_size(&[0x00, 0x01, 0x1A, 0x23], &table_indices, &row_counts, 2);
    let typeref_row_size = resolution_scope_size + string_index_size * 2;

    // Build TypeRef lookup: index -> (name, namespace)
    let mut typeref_names: Vec<(String, String)> = Vec::new();
    for i in 0..typeref_row_count {
        let row_off = typeref_data_offset + i * typeref_row_size;
        if row_off + typeref_row_size > data.len() { break; }
        // Skip ResolutionScope
        let name_idx = read_index(data, row_off + resolution_scope_size, string_index_size);
        let ns_idx = read_index(data, row_off + resolution_scope_size + string_index_size, string_index_size);
        let name = read_string_from_heap(data, strings_offset, strings_end, name_idx);
        let ns = read_string_from_heap(data, strings_offset, strings_end, ns_idx);
        typeref_names.push((name, ns));
    }

    // --- TypeDef table info ---
    let typedef_pos = table_indices.iter().position(|&i| i == TYPEDEF_TABLE);
    let typedef_row_count = match typedef_pos {
        Some(pos) => row_counts[pos] as usize,
        None => return Ok(vec![]),
    };
    let typedef_data_offset = calculate_table_offset(
        &table_indices, &row_counts, TYPEDEF_TABLE, tables_data_offset,
        string_index_size, guid_index_size, blob_index_size,
    );
    let typedef_or_ref_size = coded_index_size(&[0x02, 0x01, 0x1B], &table_indices, &row_counts, 2);
    let field_table_pos = table_indices.iter().position(|&i| i == FIELD_TABLE);
    let field_rows = field_table_pos.map(|p| row_counts[p]).unwrap_or(0);
    let field_index_size = if field_rows > 0xFFFF { 4 } else { 2 };
    let method_table_pos = table_indices.iter().position(|&i| i == 0x06);
    let method_rows = method_table_pos.map(|p| row_counts[p]).unwrap_or(0);
    let method_index_size = if method_rows > 0xFFFF { 4 } else { 2 };
    let typedef_row_size = 4 + string_index_size + string_index_size + typedef_or_ref_size + field_index_size + method_index_size;

    // --- Field table info ---
    let field_data_offset = calculate_table_offset(
        &table_indices, &row_counts, FIELD_TABLE, tables_data_offset,
        string_index_size, guid_index_size, blob_index_size,
    );
    // Field row: Flags(2) + Name(string_idx) + Signature(blob_idx)
    let field_row_size = 2 + string_index_size + blob_index_size;

    // --- Build TypeDef lookup for name resolution (self-references) ---
    let mut typedef_names: Vec<(String, String)> = Vec::new(); // (name, namespace)
    for i in 0..typedef_row_count {
        let row_off = typedef_data_offset + i * typedef_row_size;
        if row_off + typedef_row_size > data.len() { break; }
        let name_idx = read_index(data, row_off + 4, string_index_size);
        let ns_idx = read_index(data, row_off + 4 + string_index_size, string_index_size);
        let name = read_string_from_heap(data, strings_offset, strings_end, name_idx);
        let ns = read_string_from_heap(data, strings_offset, strings_end, ns_idx);
        typedef_names.push((name, ns));
    }

    // --- Read each TypeDef with fields ---
    let mut types = Vec::new();

    for i in 0..typedef_row_count {
        let row_off = typedef_data_offset + i * typedef_row_size;
        if row_off + typedef_row_size > data.len() { break; }

        let flags = read_u32(data, row_off);
        let name_idx = read_index(data, row_off + 4, string_index_size);
        let ns_idx = read_index(data, row_off + 4 + string_index_size, string_index_size);
        let extends_raw = read_index(
            data,
            row_off + 4 + string_index_size * 2,
            typedef_or_ref_size,
        );
        let field_list = read_index(
            data,
            row_off + 4 + string_index_size * 2 + typedef_or_ref_size,
            field_index_size,
        );

        // Only process public types
        let visibility = flags & VISIBILITY_MASK;
        if visibility != TD_PUBLIC && visibility != TD_NESTED_PUBLIC {
            continue;
        }

        let name = read_string_from_heap(data, strings_offset, strings_end, name_idx);
        let namespace = read_string_from_heap(data, strings_offset, strings_end, ns_idx);

        if name == "<Module>" { continue; }

        // Resolve base class from Extends coded index (TypeDefOrRef: 2-bit tag)
        let extends_tag = extends_raw & 0x03;
        let extends_idx = extends_raw >> 2;
        let base_class = resolve_type_name(extends_tag, extends_idx, &typedef_names, &typeref_names);

        // Determine kind from base class and flags
        let kind = if flags & TD_CLASS_SEMANTICS_MASK == TD_INTERFACE {
            "interface"
        } else if base_class.as_deref() == Some("ValueType") || base_class.as_deref() == Some("System.ValueType") {
            "struct"
        } else if base_class.as_deref() == Some("Enum") || base_class.as_deref() == Some("System.Enum") {
            "enum"
        } else {
            "class"
        };

        // Clean up base class name: strip "System." prefix for well-known types,
        // but keep it for actual base classes we care about
        let clean_base = base_class.as_ref().and_then(|bc| {
            let short = bc.rsplit('.').next().unwrap_or(bc);
            match short {
                "Object" | "ValueType" | "Enum" | "Attribute" | "Exception" | "MulticastDelegate" => None,
                _ => Some(short.to_string()),
            }
        });

        // Determine field range for this TypeDef
        let next_field_list = if i + 1 < typedef_row_count {
            let next_off = typedef_data_offset + (i + 1) * typedef_row_size;
            if next_off + typedef_row_size <= data.len() {
                read_index(
                    data,
                    next_off + 4 + string_index_size * 2 + typedef_or_ref_size,
                    field_index_size,
                )
            } else {
                field_rows as usize + 1
            }
        } else {
            field_rows as usize + 1
        };

        // Read fields for this type
        let mut fields = Vec::new();
        if blob_offset > 0 && field_list > 0 && field_list <= field_rows as usize + 1 {
            for fi in field_list..next_field_list {
                let f_idx = fi - 1; // Field table is 1-indexed
                let f_off = field_data_offset + f_idx * field_row_size;
                if f_off + field_row_size > data.len() { break; }

                let f_flags = read_u16(data, f_off);
                let f_name_idx = read_index(data, f_off + 2, string_index_size);
                let f_sig_idx = read_index(data, f_off + 2 + string_index_size, blob_index_size);

                // Filter: public, non-static, non-const, non-readonly
                let access = f_flags & FIELD_ACCESS_MASK;
                if access != FIELD_PUBLIC { continue; }
                if f_flags & FIELD_STATIC != 0 { continue; }
                if f_flags & FIELD_LITERAL != 0 { continue; }
                if f_flags & FIELD_INIT_ONLY != 0 { continue; }

                let f_name = read_string_from_heap(data, strings_offset, strings_end, f_name_idx);

                // Decode field type from #Blob signature
                let type_name = decode_field_signature(
                    data, blob_offset, blob_end, f_sig_idx,
                    &typedef_names, &typeref_names,
                );

                fields.push(CSharpFieldRef {
                    name: f_name,
                    type_name,
                    has_serialize_field: false, // Can't detect from DLL metadata
                    has_serialize_reference: false,
                    is_public: true,
                    owner_type: name.clone(),
                });
            }
        }

        let ns = if namespace.is_empty() { None } else { Some(namespace) };

        types.push(CSharpTypeInfo {
            name,
            kind: kind.to_string(),
            namespace: ns,
            base_class: clean_base,
            fields,
        });
    }

    Ok(types)
}

/// Resolve a TypeDefOrRef coded index to a type name.
fn resolve_type_name(
    tag: usize,
    index: usize,
    typedef_names: &[(String, String)],
    typeref_names: &[(String, String)],
) -> Option<String> {
    if index == 0 { return None; }
    let idx = index - 1; // 1-based to 0-based

    match tag {
        0 => { // TypeDef
            typedef_names.get(idx).map(|(name, ns)| {
                if ns.is_empty() { name.clone() } else { format!("{}.{}", ns, name) }
            })
        }
        1 => { // TypeRef
            typeref_names.get(idx).map(|(name, ns)| {
                if ns.is_empty() { name.clone() } else { format!("{}.{}", ns, name) }
            })
        }
        _ => None, // TypeSpec (0x1B) — too complex for v1
    }
}

/// Decode a field signature from the #Blob stream.
///
/// Field signatures start with 0x06 (FIELD calling convention), followed by the type.
fn decode_field_signature(
    data: &[u8],
    blob_offset: usize,
    blob_end: usize,
    blob_idx: usize,
    typedef_names: &[(String, String)],
    typeref_names: &[(String, String)],
) -> String {
    let start = blob_offset + blob_idx;
    if start >= blob_end || start >= data.len() {
        return "unknown".to_string();
    }

    // Read compressed blob length
    let (blob_len, header_size) = read_compressed_unsigned(data, start);
    let sig_start = start + header_size;
    let sig_end = sig_start + blob_len;

    if sig_start >= data.len() || sig_end > data.len() {
        return "unknown".to_string();
    }

    // First byte should be 0x06 (FIELD)
    if data[sig_start] != 0x06 {
        return "unknown".to_string();
    }

    let mut pos = sig_start + 1;
    decode_type_from_signature(data, &mut pos, sig_end, typedef_names, typeref_names)
}

/// Decode a type from a signature blob at the current position.
fn decode_type_from_signature(
    data: &[u8],
    pos: &mut usize,
    end: usize,
    typedef_names: &[(String, String)],
    typeref_names: &[(String, String)],
) -> String {
    if *pos >= end || *pos >= data.len() {
        return "unknown".to_string();
    }

    let element_type = data[*pos];
    *pos += 1;

    match element_type {
        ELEMENT_TYPE_BOOLEAN => "bool".to_string(),
        ELEMENT_TYPE_CHAR => "char".to_string(),
        ELEMENT_TYPE_I1 => "sbyte".to_string(),
        ELEMENT_TYPE_U1 => "byte".to_string(),
        ELEMENT_TYPE_I2 => "short".to_string(),
        ELEMENT_TYPE_U2 => "ushort".to_string(),
        ELEMENT_TYPE_I4 => "int".to_string(),
        ELEMENT_TYPE_U4 => "uint".to_string(),
        ELEMENT_TYPE_I8 => "long".to_string(),
        ELEMENT_TYPE_U8 => "ulong".to_string(),
        ELEMENT_TYPE_R4 => "float".to_string(),
        ELEMENT_TYPE_R8 => "double".to_string(),
        ELEMENT_TYPE_STRING => "string".to_string(),
        ELEMENT_TYPE_OBJECT => "object".to_string(),

        ELEMENT_TYPE_VALUETYPE | ELEMENT_TYPE_CLASS => {
            // Followed by a TypeDefOrRef coded index (compressed)
            let (token, _) = read_compressed_unsigned(data, *pos);
            *pos += compressed_size(data, *pos);
            let tag = token & 0x03;
            let idx = token >> 2;
            resolve_type_name(tag, idx, typedef_names, typeref_names)
                .map(|full| {
                    // Return short name for common Unity types
                    full.rsplit('.').next().unwrap_or(&full).to_string()
                })
                .unwrap_or_else(|| "unknown".to_string())
        }

        ELEMENT_TYPE_SZARRAY => {
            // Single-dimension array, followed by element type
            let inner = decode_type_from_signature(data, pos, end, typedef_names, typeref_names);
            format!("{}[]", inner)
        }

        ELEMENT_TYPE_GENERICINST => {
            // Generic instantiation: base_type + arg_count + arg_types
            let base = decode_type_from_signature(data, pos, end, typedef_names, typeref_names);
            if *pos >= end { return base; }
            let (arg_count, _) = read_compressed_unsigned(data, *pos);
            *pos += compressed_size(data, *pos);

            let mut args = Vec::new();
            for _ in 0..arg_count {
                if *pos >= end { break; }
                args.push(decode_type_from_signature(data, pos, end, typedef_names, typeref_names));
            }
            format!("{}<{}>", base, args.join(", "))
        }

        _ => "unknown".to_string(),
    }
}

/// Read a compressed unsigned integer from ECMA-335 blob format.
/// Returns (value, bytes_consumed).
fn read_compressed_unsigned(data: &[u8], offset: usize) -> (usize, usize) {
    if offset >= data.len() {
        return (0, 1);
    }
    let first = data[offset];
    if first & 0x80 == 0 {
        // 1-byte: 0xxxxxxx
        (first as usize, 1)
    } else if first & 0xC0 == 0x80 {
        // 2-byte: 10xxxxxx xxxxxxxx
        if offset + 1 >= data.len() { return (0, 2); }
        let val = ((first as usize & 0x3F) << 8) | data[offset + 1] as usize;
        (val, 2)
    } else if first & 0xE0 == 0xC0 {
        // 4-byte: 110xxxxx xxxxxxxx xxxxxxxx xxxxxxxx
        if offset + 3 >= data.len() { return (0, 4); }
        let val = ((first as usize & 0x1F) << 24)
            | ((data[offset + 1] as usize) << 16)
            | ((data[offset + 2] as usize) << 8)
            | data[offset + 3] as usize;
        (val, 4)
    } else {
        (0, 1)
    }
}

/// Get the byte size of a compressed unsigned integer at the given offset.
fn compressed_size(data: &[u8], offset: usize) -> usize {
    if offset >= data.len() { return 1; }
    let first = data[offset];
    if first & 0x80 == 0 { 1 }
    else if first & 0xC0 == 0x80 { 2 }
    else if first & 0xE0 == 0xC0 { 4 }
    else { 1 }
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
/// Handles all tables that can appear before the Field table (0x04) in the
/// ECMA-335 table ordering: Module(0x00), TypeRef(0x01), TypeDef(0x02),
/// FieldPtr(0x03), Field(0x04). Returns 0 for unknown tables.
fn table_row_size(
    table_id: usize,
    string_idx_size: usize,
    guid_idx_size: usize,
    blob_idx_size: usize,
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

        // TypeDef (0x02): Flags(4) + TypeName(str) + TypeNamespace(str) + Extends(coded) + FieldList(idx) + MethodList(idx)
        0x02 => {
            let typedef_or_ref_size = coded_index_size(&[0x02, 0x01, 0x1B], table_indices, row_counts, 2);
            let field_rows = table_indices.iter().position(|&t| t == 0x04).map(|p| row_counts[p]).unwrap_or(0);
            let field_idx_size = if field_rows > 0xFFFF { 4 } else { 2 };
            let method_rows = table_indices.iter().position(|&t| t == 0x06).map(|p| row_counts[p]).unwrap_or(0);
            let method_idx_size = if method_rows > 0xFFFF { 4 } else { 2 };
            4 + string_idx_size * 2 + typedef_or_ref_size + field_idx_size + method_idx_size
        }

        // FieldPtr (0x03): Field(idx) — rare, only in EnC metadata
        0x03 => {
            let field_rows = table_indices.iter().position(|&t| t == 0x04).map(|p| row_counts[p]).unwrap_or(0);
            if field_rows > 0xFFFF { 4 } else { 2 }
        }

        // Field (0x04): Flags(2) + Name(str) + Signature(blob)
        0x04 => 2 + string_idx_size + blob_idx_size,

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
