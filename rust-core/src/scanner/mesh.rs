/// Mesh binary data decoder for Unity Mesh assets (class_id 43).
///
/// Unity stores vertex data as hex-encoded binary blobs (`_typelessdata`) and
/// index buffers as hex strings. This module decodes them into structured
/// vertex/index arrays for human-readable output.

/// Channel attribute names indexed by slot position (0-7).
const CHANNEL_NAMES: [&str; 8] = [
    "position", "normal", "tangent", "uv0", "uv1", "uv2", "uv3", "color",
];

/// Extract a usize from a JSON value that could be a string or a number.
fn value_as_usize(v: &serde_json::Value) -> Option<usize> {
    if let Some(s) = v.as_str() {
        s.parse::<usize>().ok()
    } else if let Some(n) = v.as_u64() {
        Some(n as usize)
    } else if let Some(n) = v.as_f64() {
        Some(n as usize)
    } else {
        None
    }
}

/// Extract a u64 from a JSON value that could be a string or a number.
fn value_as_u64(v: &serde_json::Value) -> Option<u64> {
    if let Some(s) = v.as_str() {
        s.parse::<u64>().ok()
    } else if let Some(n) = v.as_u64() {
        Some(n)
    } else if let Some(n) = v.as_f64() {
        Some(n as u64)
    } else {
        None
    }
}

/// Extract a u32 from a JSON value that could be a string or a number.
fn value_as_u32(v: &serde_json::Value) -> Option<u32> {
    if let Some(s) = v.as_str() {
        s.parse::<u32>().ok()
    } else if let Some(n) = v.as_u64() {
        Some(n as u32)
    } else if let Some(n) = v.as_f64() {
        Some(n as u32)
    } else {
        None
    }
}

/// Byte size per element for each vertex format code.
fn format_byte_size(format: u64) -> Option<usize> {
    match format {
        0 => Some(4),  // float32
        1 => Some(2),  // float16
        2 => Some(1),  // UNorm8
        3 => Some(1),  // SNorm8
        4 => Some(2),  // UNorm16
        5 => Some(2),  // SNorm16
        11 => Some(1), // UInt8
        12 => Some(1), // SInt8
        _ => None,
    }
}

/// Decode a single element from raw bytes according to the vertex format.
fn decode_element(bytes: &[u8], format: u64) -> Option<f64> {
    match format {
        0 => {
            // float32 (4 bytes, little-endian)
            if bytes.len() < 4 { return None; }
            let bits = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
            Some(f32::from_bits(bits) as f64)
        }
        1 => {
            // float16 (2 bytes, little-endian)
            if bytes.len() < 2 { return None; }
            let bits = u16::from_le_bytes([bytes[0], bytes[1]]);
            Some(f16_to_f32(bits) as f64)
        }
        2 => {
            // UNorm8 (1 byte) -> [0, 1]
            if bytes.is_empty() { return None; }
            Some(bytes[0] as f64 / 255.0)
        }
        3 => {
            // SNorm8 (1 byte) -> [-1, 1]
            if bytes.is_empty() { return None; }
            Some(bytes[0] as i8 as f64 / 127.0)
        }
        4 => {
            // UNorm16 (2 bytes) -> [0, 1]
            if bytes.len() < 2 { return None; }
            let val = u16::from_le_bytes([bytes[0], bytes[1]]);
            Some(val as f64 / 65535.0)
        }
        5 => {
            // SNorm16 (2 bytes) -> [-1, 1]
            if bytes.len() < 2 { return None; }
            let val = i16::from_le_bytes([bytes[0], bytes[1]]);
            Some(val as f64 / 32767.0)
        }
        11 => {
            // UInt8 (1 byte)
            if bytes.is_empty() { return None; }
            Some(bytes[0] as f64)
        }
        12 => {
            // SInt8 (1 byte)
            if bytes.is_empty() { return None; }
            Some(bytes[0] as i8 as f64)
        }
        _ => None,
    }
}

/// Convert IEEE 754 half-precision (float16) to single-precision (float32).
fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) & 1) as u32;
    let exp = ((h >> 10) & 0x1f) as u32;
    let mant = (h & 0x3ff) as u32;

    if exp == 0 {
        if mant == 0 {
            // Zero
            f32::from_bits(sign << 31)
        } else {
            // Denormalized -> normalize
            let mut e = 0i32;
            let mut m = mant;
            while (m & 0x400) == 0 {
                m <<= 1;
                e += 1;
            }
            m &= 0x3ff;
            let new_exp = (127 - 15 - e) as u32;
            f32::from_bits((sign << 31) | (new_exp << 23) | (m << 13))
        }
    } else if exp == 31 {
        // Inf / NaN
        f32::from_bits((sign << 31) | (0xff << 23) | (mant << 13))
    } else {
        // Normalized
        let new_exp = (exp as i32 - 15 + 127) as u32;
        f32::from_bits((sign << 31) | (new_exp << 23) | (mant << 13))
    }
}

/// Decode hex string to byte vector. Returns None if invalid hex.
fn hex_to_bytes(hex: &str) -> Option<Vec<u8>> {
    let hex = hex.trim();
    if hex.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16).ok()?;
        bytes.push(byte);
    }
    Some(bytes)
}

/// Channel descriptor extracted from the Channels array.
struct ChannelInfo {
    stream: usize,
    offset: usize,
    format: u64,
    dimension: u64,
}

/// Per-stream layout info.
struct StreamLayout {
    stride: usize,
    data_offset: usize,
}

/// Decode mesh vertex and index data in-place on the properties object.
///
/// Replaces `VertexData._typelessdata` hex blob with `VertexData.vertices` (decoded array)
/// and replaces `IndexBuffer` hex string with integer array.
///
/// If any required field is missing or parsing fails, leaves properties unchanged.
pub fn decode_mesh_data(properties: &mut serde_json::Value) {
    // Read VertexCount from top level
    let vertex_count = match properties.get("VertexCount").and_then(|v| value_as_usize(v)) {
        Some(n) if n > 0 => n,
        _ => {
            set_decode_skip(properties, "VertexCount missing or zero");
            return;
        }
    };

    // Read VertexData sub-map
    let vertex_data = match properties.get("VertexData") {
        Some(vd) if vd.is_object() => vd,
        _ => {
            set_decode_skip(properties, "VertexData missing or not an object");
            return;
        }
    };

    // Read DataSize
    let data_size = match vertex_data.get("DataSize").and_then(|v| value_as_usize(v)) {
        Some(n) if n > 0 => n,
        _ => {
            set_decode_skip(properties, "VertexData.DataSize missing or zero (mesh data may be in external .resource file)");
            return;
        }
    };

    // Read Channels array
    let channels_val = match vertex_data.get("Channels") {
        Some(c) if c.is_array() => c.as_array().unwrap(),
        _ => {
            set_decode_skip(properties, "VertexData.Channels missing or not an array");
            return;
        }
    };

    // Parse channel descriptors
    let mut channels: Vec<Option<ChannelInfo>> = Vec::new();
    for ch in channels_val {
        let dim = ch.get("dimension").and_then(|v| value_as_u64(v)).unwrap_or(0);

        if dim == 0 {
            channels.push(None);
            continue;
        }

        let stream = ch.get("stream").and_then(|v| value_as_usize(v)).unwrap_or(0);
        let offset = ch.get("offset").and_then(|v| value_as_usize(v)).unwrap_or(0);
        let format = ch.get("format").and_then(|v| value_as_u64(v)).unwrap_or(0);

        if format_byte_size(format).is_none() {
            channels.push(None);
            continue;
        }

        channels.push(Some(ChannelInfo { stream, offset, format, dimension: dim }));
    }

    // Compute per-stream strides: for each stream, the stride is the max of
    // (offset + dimension * element_size) across all channels in that stream.
    let max_stream = channels.iter()
        .filter_map(|c| c.as_ref().map(|ci| ci.stream))
        .max()
        .unwrap_or(0);

    let mut stream_strides: Vec<usize> = vec![0; max_stream + 1];
    for ch_opt in &channels {
        if let Some(ch) = ch_opt {
            if let Some(elem_size) = format_byte_size(ch.format) {
                let end = ch.offset + ch.dimension as usize * elem_size;
                if end > stream_strides[ch.stream] {
                    stream_strides[ch.stream] = end;
                }
            }
        }
    }

    // Compute stream data offsets within _typelessdata.
    // Each stream's data block = stride * vertex_count, laid out sequentially.
    let mut stream_layouts: Vec<StreamLayout> = Vec::with_capacity(stream_strides.len());
    let mut offset_acc: usize = 0;
    for stride in &stream_strides {
        stream_layouts.push(StreamLayout {
            stride: *stride,
            data_offset: offset_acc,
        });
        offset_acc += stride * vertex_count;
    }

    // Verify total data fits
    if offset_acc > data_size {
        set_decode_skip(properties, &format!(
            "Computed stream data size ({}) exceeds DataSize ({})", offset_acc, data_size
        ));
        return;
    }

    // Read and decode _typelessdata hex
    let typeless_hex = match vertex_data.get("_typelessdata").and_then(|v| v.as_str()) {
        Some(h) if !h.trim().is_empty() => h,
        _ => {
            set_decode_skip(properties, "VertexData._typelessdata missing or empty");
            return;
        }
    };

    let raw_bytes = match hex_to_bytes(typeless_hex) {
        Some(b) => b,
        None => {
            set_decode_skip(properties, "VertexData._typelessdata contains invalid hex");
            return;
        }
    };

    if raw_bytes.len() < data_size {
        set_decode_skip(properties, &format!(
            "_typelessdata byte length ({}) < DataSize ({})", raw_bytes.len(), data_size
        ));
        return;
    }

    // Decode vertices using per-stream layouts
    let mut vertices = Vec::with_capacity(vertex_count);
    for vi in 0..vertex_count {
        let mut vertex = serde_json::Map::new();

        for (ci, ch_opt) in channels.iter().enumerate() {
            if let Some(ch) = ch_opt {
                if ci >= CHANNEL_NAMES.len() || ch.stream >= stream_layouts.len() {
                    continue;
                }
                let layout = &stream_layouts[ch.stream];
                let elem_size = match format_byte_size(ch.format) {
                    Some(s) => s,
                    None => continue,
                };
                let base = layout.data_offset + vi * layout.stride;
                let mut components = Vec::with_capacity(ch.dimension as usize);
                for di in 0..ch.dimension as usize {
                    let byte_offset = base + ch.offset + di * elem_size;
                    if byte_offset + elem_size > raw_bytes.len() {
                        break;
                    }
                    if let Some(val) = decode_element(&raw_bytes[byte_offset..], ch.format) {
                        components.push(serde_json::json!(val));
                    }
                }
                if !components.is_empty() {
                    vertex.insert(
                        CHANNEL_NAMES[ci].to_string(),
                        serde_json::Value::Array(components),
                    );
                }
            }
        }

        vertices.push(serde_json::Value::Object(vertex));
    }

    // Decode IndexBuffer
    let index_format = properties.get("IndexFormat")
        .and_then(|v| value_as_u32(v))
        .unwrap_or(0);

    if let Some(idx_hex) = properties.get("IndexBuffer").and_then(|v| v.as_str()) {
        if let Some(idx_bytes) = hex_to_bytes(idx_hex) {
            let indices: Vec<serde_json::Value> = if index_format == 1 {
                idx_bytes.chunks_exact(4)
                    .map(|chunk| {
                        let val = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                        serde_json::json!(val)
                    })
                    .collect()
            } else {
                idx_bytes.chunks_exact(2)
                    .map(|chunk| {
                        let val = u16::from_le_bytes([chunk[0], chunk[1]]);
                        serde_json::json!(val)
                    })
                    .collect()
            };
            properties["IndexBuffer"] = serde_json::Value::Array(indices);
        }
    }

    // Replace _typelessdata with vertices in VertexData
    if let Some(vd) = properties.get_mut("VertexData") {
        if let Some(obj) = vd.as_object_mut() {
            obj.remove("_typelessdata");
            obj.insert("vertices".to_string(), serde_json::Value::Array(vertices));
        }
    }
}

/// Set a diagnostic field when mesh decode is skipped.
fn set_decode_skip(properties: &mut serde_json::Value, reason: &str) {
    if let Some(obj) = properties.as_object_mut() {
        obj.insert("_mesh_decode_skipped".to_string(), serde_json::json!(reason));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_mesh_properties(
        vertex_count: usize,
        data_size: usize,
        channels_json: serde_json::Value,
        typeless_hex: &str,
        index_hex: &str,
        index_format: u32,
    ) -> serde_json::Value {
        serde_json::json!({
            "Name": "TestMesh",
            "VertexCount": vertex_count.to_string(),
            "IndexBuffer": index_hex,
            "IndexFormat": index_format.to_string(),
            "VertexData": {
                "VertexCount": vertex_count.to_string(),
                "Channels": channels_json,
                "DataSize": data_size.to_string(),
                "_typelessdata": typeless_hex,
            },
        })
    }

    #[test]
    fn test_decode_simple_triangle() {
        // 3 vertices, position-only (channel 0: dim=3, fmt=0 float32)
        // V0=(0,0,0), V1=(1,0,0), V2=(0,1,0)
        let channels = serde_json::json!([
            {"stream": "0", "offset": "0", "format": "0", "dimension": "3"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
        ]);

        // float32 LE: 0.0 = 00000000, 1.0 = 0000803f
        let typeless = "000000000000000000000000\
                         0000803f0000000000000000\
                         000000000000803f00000000";
        let index_hex = "000001000200";

        let mut props = make_mesh_properties(3, 36, channels, typeless, index_hex, 0);
        decode_mesh_data(&mut props);

        // Check vertices decoded
        let vd = props.get("VertexData").unwrap().as_object().unwrap();
        assert!(!vd.contains_key("_typelessdata"));
        let verts = vd.get("vertices").unwrap().as_array().unwrap();
        assert_eq!(verts.len(), 3);

        // V0 = (0, 0, 0)
        let v0 = verts[0].as_object().unwrap();
        let pos0: Vec<f64> = v0.get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(pos0, vec![0.0, 0.0, 0.0]);

        // V1 = (1, 0, 0)
        let v1 = verts[1].as_object().unwrap();
        let pos1: Vec<f64> = v1.get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(pos1, vec![1.0, 0.0, 0.0]);

        // V2 = (0, 1, 0)
        let v2 = verts[2].as_object().unwrap();
        let pos2: Vec<f64> = v2.get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(pos2, vec![0.0, 1.0, 0.0]);

        // Check index buffer decoded
        let indices = props.get("IndexBuffer").unwrap().as_array().unwrap();
        let idx_vals: Vec<u64> = indices.iter().map(|v| v.as_u64().unwrap()).collect();
        assert_eq!(idx_vals, vec![0, 1, 2]);
    }

    #[test]
    fn test_decode_with_uv() {
        // 2 vertices: position (dim=3, fmt=0) + uv0 (dim=2, fmt=0)
        // stride = 5 * 4 = 20 bytes per vertex, DataSize = 40
        let channels = serde_json::json!([
            {"stream": "0", "offset": "0", "format": "0", "dimension": "3"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "12", "format": "0", "dimension": "2"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
        ]);

        // V0: pos=(1,0,0) uv=(0,0)  V1: pos=(0,1,0) uv=(1,1)
        // float32 LE: 1.0 = 0000803f, 0.0 = 00000000
        // V0: pos_x=1.0 pos_y=0.0 pos_z=0.0 uv_u=0.0 uv_v=0.0
        // V1: pos_x=0.0 pos_y=1.0 pos_z=0.0 uv_u=1.0 uv_v=1.0
        let v0_hex = "0000803f00000000000000000000000000000000";
        let v1_hex = "000000000000803f000000000000803f0000803f";
        let typeless_data = format!("{}{}", v0_hex, v1_hex);
        let index_hex = "00000100";

        let mut props = make_mesh_properties(2, 40, channels, &typeless_data, index_hex, 0);
        decode_mesh_data(&mut props);

        let vd = props.get("VertexData").unwrap().as_object().unwrap();
        let verts = vd.get("vertices").unwrap().as_array().unwrap();
        assert_eq!(verts.len(), 2);

        // V0: position and uv0
        let v0 = verts[0].as_object().unwrap();
        assert!(v0.contains_key("position"));
        assert!(v0.contains_key("uv0"));
        let uv0: Vec<f64> = v0.get("uv0").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(uv0, vec![0.0, 0.0]);

        // V1: uv0 = (1.0, 1.0)
        let v1 = verts[1].as_object().unwrap();
        let uv1: Vec<f64> = v1.get("uv0").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(uv1, vec![1.0, 1.0]);
    }

    #[test]
    fn test_decode_from_yaml_pipeline() {
        // End-to-end test: parse YAML like read_asset does, then decode
        use crate::scanner::component;
        use std::collections::HashMap;

        let yaml = "\
--- !u!43 &4300000
Mesh:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: PipelineTest
  serializedVersion: 11
  m_SubMeshes:
  - serializedVersion: 2
    firstByte: 0
    indexCount: 3
    topology: 0
    baseVertex: 0
    firstVertex: 0
    vertexCount: 3
  m_IndexBuffer: 000001000200
  m_IndexFormat: 0
  m_VertexCount: 3
  m_VertexData:
    serializedVersion: 3
    m_VertexCount: 3
    m_Channels:
    - stream: 0
      offset: 0
      format: 0
      dimension: 3
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    - stream: 0
      offset: 0
      format: 0
      dimension: 0
    m_DataSize: 36
    _typelessdata: 0000000000000000000000000000803f0000000000000000000000000000803f00000000
";
        let cache = HashMap::new();
        let mut properties = component::extract_properties(yaml, "4300000", 43, &cache);

        // Debug: print the parsed properties structure
        eprintln!("Parsed properties: {}", serde_json::to_string_pretty(&properties).unwrap());

        // Verify the structure before decode
        assert!(properties.get("VertexCount").is_some(), "VertexCount missing");
        assert!(properties.get("VertexData").is_some(), "VertexData missing");
        let vd = properties.get("VertexData").unwrap();
        assert!(vd.is_object(), "VertexData not an object");
        eprintln!("VertexData keys: {:?}", vd.as_object().unwrap().keys().collect::<Vec<_>>());
        assert!(vd.get("Channels").is_some(), "Channels missing from VertexData");
        assert!(vd.get("DataSize").is_some(), "DataSize missing from VertexData");
        assert!(vd.get("_typelessdata").is_some(), "_typelessdata missing from VertexData");

        // Now decode
        decode_mesh_data(&mut properties);

        // Verify decode worked
        let vd = properties.get("VertexData").unwrap().as_object().unwrap();
        assert!(vd.contains_key("vertices"), "vertices key missing after decode");
        assert!(!vd.contains_key("_typelessdata"), "_typelessdata should be removed");
        let verts = vd.get("vertices").unwrap().as_array().unwrap();
        assert_eq!(verts.len(), 3);

        let v1_pos: Vec<f64> = verts[1].get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(v1_pos, vec![1.0, 0.0, 0.0]);

        // Verify index buffer decoded
        let idx = properties.get("IndexBuffer").unwrap().as_array().unwrap();
        assert_eq!(idx.len(), 3);
    }

    #[test]
    fn test_decode_multi_stream() {
        // 2 vertices: position on stream 0 (dim=3, fmt=0), uv0 on stream 1 (dim=2, fmt=0)
        // Stream 0 stride = 12 bytes (3 * 4), Stream 1 stride = 8 bytes (2 * 4)
        // DataSize = 12*2 + 8*2 = 40
        // _typelessdata layout:
        //   [stream 0: V0_pos V1_pos] [stream 1: V0_uv V1_uv]
        //   V0_pos = (1,0,0), V1_pos = (0,1,0)
        //   V0_uv = (0.5, 0.5), V1_uv = (1.0, 0.0)
        let channels = serde_json::json!([
            {"stream": "0", "offset": "0", "format": "0", "dimension": "3"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "1", "offset": "0", "format": "0", "dimension": "2"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
            {"stream": "0", "offset": "0", "format": "0", "dimension": "0"},
        ]);

        // float32 LE: 0.0 = 00000000, 0.5 = 0000003f, 1.0 = 0000803f
        // Stream 0 (positions): V0=(1,0,0) V1=(0,1,0)
        let stream0 = "0000803f0000000000000000000000000000803f00000000";
        // Stream 1 (uvs): V0=(0.5,0.5) V1=(1.0,0.0)
        let stream1 = "0000003f0000003f0000803f00000000";
        let typeless = format!("{}{}", stream0, stream1);
        let index_hex = "00000100";

        let mut props = make_mesh_properties(2, 40, channels, &typeless, index_hex, 0);
        decode_mesh_data(&mut props);

        assert!(props.get("_mesh_decode_skipped").is_none(),
            "Decode should not have been skipped: {:?}", props.get("_mesh_decode_skipped"));

        let vd = props.get("VertexData").unwrap().as_object().unwrap();
        let verts = vd.get("vertices").unwrap().as_array().unwrap();
        assert_eq!(verts.len(), 2);

        // V0: position=(1,0,0), uv0=(0.5,0.5)
        let v0 = verts[0].as_object().unwrap();
        let pos0: Vec<f64> = v0.get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(pos0, vec![1.0, 0.0, 0.0]);
        let uv0: Vec<f64> = v0.get("uv0").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(uv0, vec![0.5, 0.5]);

        // V1: position=(0,1,0), uv0=(1.0,0.0)
        let v1 = verts[1].as_object().unwrap();
        let pos1: Vec<f64> = v1.get("position").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(pos1, vec![0.0, 1.0, 0.0]);
        let uv1: Vec<f64> = v1.get("uv0").unwrap().as_array().unwrap()
            .iter().map(|v| v.as_f64().unwrap()).collect();
        assert_eq!(uv1, vec![1.0, 0.0]);
    }

    #[test]
    fn test_decode_graceful_fallback() {
        // VertexCount=0 -> skip with diagnostic
        let mut props = serde_json::json!({"Name": "NoMesh", "VertexCount": "0"});
        decode_mesh_data(&mut props);
        assert!(props.get("_mesh_decode_skipped").is_some());
        assert!(props.get("_mesh_decode_skipped").unwrap().as_str().unwrap().contains("VertexCount"));

        // Missing _typelessdata -> skip with diagnostic
        let mut props2 = serde_json::json!({
            "VertexCount": "3",
            "VertexData": {
                "DataSize": "36",
                "Channels": [],
            }
        });
        decode_mesh_data(&mut props2);
        assert!(props2.get("_mesh_decode_skipped").is_some());
        assert!(props2.get("_mesh_decode_skipped").unwrap().as_str().unwrap().contains("_typelessdata"));

        // Invalid hex -> skip with diagnostic
        let mut props3 = serde_json::json!({
            "VertexCount": "1",
            "VertexData": {
                "DataSize": "12",
                "Channels": [{"stream": "0", "offset": "0", "format": "0", "dimension": "3"}],
                "_typelessdata": "ZZZZ",
            }
        });
        decode_mesh_data(&mut props3);
        assert!(props3.get("_mesh_decode_skipped").is_some());
        assert!(props3.get("_mesh_decode_skipped").unwrap().as_str().unwrap().contains("invalid hex"));
    }
}
