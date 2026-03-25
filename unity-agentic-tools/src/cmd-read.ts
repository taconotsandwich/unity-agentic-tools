import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, extname, join, basename, relative } from 'path';
import { homedir, platform } from 'os';
import type { UnityScanner } from './scanner';
import { getNativeExtractCsharpTypes, getNativeExtractDllTypes, getNativeBuildTypeRegistry } from './scanner';
import { read_settings } from './settings';
import { get_build_settings } from './build-settings';
import { UnityDocument } from './editor';
import { extractGuidFromMeta, resolve_source_prefab } from './editor/shared';
import { get_class_id } from './class-ids';
import { load_guid_cache, load_guid_cache_for_file } from './guid-cache';
import { path_glob_to_regex, find_unity_project_root } from './utils';
import { list_packages } from './packages';
import { load_input_actions } from './input-actions';
import type { InputActionsFile } from './input-actions';

// ========== Material Parsing ==========

interface MaterialShader {
    guid: string | null;
    fileID: string | null;
}

interface MaterialTexture {
    name: string;
    texture_guid: string | null;
    texture_fileID: string | null;
    scale: { x: number; y: number } | null;
    offset: { x: number; y: number } | null;
}

interface MaterialFloat {
    name: string;
    value: number;
}

interface MaterialColor {
    name: string;
    r: number;
    g: number;
    b: number;
    a: number;
}

interface ParsedMaterial {
    name: string;
    shader: MaterialShader;
    render_queue: number | null;
    keywords: string[];
    textures: MaterialTexture[];
    floats: MaterialFloat[];
    colors: MaterialColor[];
}

/** Parse a Unity .mat file from raw YAML content. */
function parse_material_yaml(content: string): ParsedMaterial {
    // Strip all \r characters before splitting on \n. This handles \r\n (Windows),
    // \r\r\n (double-converted), and any stray \r. Safe for Unity YAML where \r
    // never appears as meaningful content — only as line-ending artifacts.
    const lines = content.replace(/\r/g, '').split('\n');
    const result: ParsedMaterial = {
        name: '',
        shader: { guid: null, fileID: null },
        render_queue: null,
        keywords: [],
        textures: [],
        floats: [],
        colors: [],
    };

    // Inline reference pattern: {fileID: 123, guid: abc...(32 hex chars), type: 3}
    const inline_ref_re = /\{[^}]*fileID:\s*(-?\d+)[^}]*guid:\s*([a-f0-9]{32})[^}]*\}/;
    const color_re = /\{[^}]*r:\s*([\d.e+-]+)[^}]*g:\s*([\d.e+-]+)[^}]*b:\s*([\d.e+-]+)[^}]*a:\s*([\d.e+-]+)[^}]*\}/;
    const scale_offset_re = /\{[^}]*x:\s*([\d.e+-]+)[^}]*y:\s*([\d.e+-]+)[^}]*\}/;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // m_Name
        if (trimmed.startsWith('m_Name:')) {
            result.name = trimmed.slice('m_Name:'.length).trim();
            i++;
            continue;
        }

        // m_Shader
        if (trimmed.startsWith('m_Shader:')) {
            const ref_match = inline_ref_re.exec(trimmed);
            if (ref_match) {
                result.shader = { fileID: ref_match[1], guid: ref_match[2] };
            }
            i++;
            continue;
        }

        // m_CustomRenderQueue
        if (trimmed.startsWith('m_CustomRenderQueue:')) {
            const val = parseInt(trimmed.slice('m_CustomRenderQueue:'.length).trim(), 10);
            result.render_queue = isNaN(val) ? null : val;
            i++;
            continue;
        }

        // m_ShaderKeywords (older format: space-separated string)
        if (trimmed.startsWith('m_ShaderKeywords:')) {
            const kw_str = trimmed.slice('m_ShaderKeywords:'.length).trim();
            if (kw_str.length > 0) {
                result.keywords = kw_str.split(' ').filter(k => k.length > 0);
            }
            i++;
            continue;
        }

        // m_ValidKeywords (newer format: YAML list — inline or multi-line)
        if (trimmed.startsWith('m_ValidKeywords:')) {
            const inline = trimmed.slice('m_ValidKeywords:'.length).trim();
            if (inline.startsWith('[') && inline.endsWith(']')) {
                // Inline array: m_ValidKeywords: [_KW1, _KW2]
                const inner = inline.slice(1, -1).trim();
                if (inner.length > 0) {
                    result.keywords = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
                i++;
            } else if (!inline || inline === '') {
                // Multi-line YAML list:
                //   m_ValidKeywords:
                //   - _KEYWORD1
                //   - _KEYWORD2:
                //       nested: data
                i++;
                while (i < lines.length) {
                    const kwline = lines[i].trimStart();
                    if (kwline.length === 0) { i++; continue; }
                    // Each keyword entry starts with "- "
                    const kw_match = kwline.match(/^-\s+(\S+?)(?::.*)?$/);
                    if (!kw_match) break;
                    const kw_indent = lines[i].length - lines[i].trimStart().length;
                    result.keywords.push(kw_match[1]);
                    i++;
                    // Skip any nested lines (deeper indentation than the keyword entry)
                    while (i < lines.length) {
                        const nested = lines[i];
                        if (nested.trimStart().length === 0) { i++; continue; }
                        const nested_indent = nested.length - nested.trimStart().length;
                        if (nested_indent <= kw_indent) break;
                        i++;
                    }
                }
            } else {
                i++;
            }
            continue;
        }

        // m_TexEnvs section
        if (trimmed.startsWith('m_TexEnvs:')) {
            const section_val = trimmed.slice('m_TexEnvs:'.length).trim();
            if (section_val === '{}' || section_val === '[]') { i++; continue; }
            i++;
            while (i < lines.length) {
                const tline = lines[i];
                const ttrimmed = tline.trimStart();
                if (ttrimmed.length === 0) { i++; continue; } // skip blank lines
                // Each texture entry starts with "- _TexName:"
                const tex_name_match = ttrimmed.match(/^-\s+(\S+):\s*$/);
                if (!tex_name_match) break;
                const tex_name = tex_name_match[1];
                const tex: MaterialTexture = {
                    name: tex_name,
                    texture_guid: null, texture_fileID: null,
                    scale: null, offset: null,
                };
                i++;
                // Read indented sub-properties (m_Texture, m_Scale, m_Offset)
                while (i < lines.length) {
                    const sub = lines[i].trimStart();
                    if (sub.length === 0) { i++; continue; } // skip blank lines
                    if (sub.startsWith('m_Texture:')) {
                        const m = inline_ref_re.exec(sub);
                        if (m) { tex.texture_fileID = m[1]; tex.texture_guid = m[2]; }
                        i++;
                    } else if (sub.startsWith('m_Scale:')) {
                        const m = scale_offset_re.exec(sub);
                        if (m) tex.scale = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
                        i++;
                    } else if (sub.startsWith('m_Offset:')) {
                        const m = scale_offset_re.exec(sub);
                        if (m) tex.offset = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
                        i++;
                    } else {
                        break;
                    }
                }
                result.textures.push(tex);
            }
            continue;
        }

        // m_Floats section
        if (trimmed.startsWith('m_Floats:')) {
            const section_val = trimmed.slice('m_Floats:'.length).trim();
            if (section_val === '{}' || section_val === '[]') { i++; continue; }
            i++;
            while (i < lines.length) {
                const fline = lines[i].trimStart();
                if (fline.length === 0) { i++; continue; } // skip blank lines
                // "- _FloatName: 0.5"
                const float_match = fline.match(/^-\s+(\S+):\s+([\d.e+-]+)\s*$/);
                if (!float_match) break;
                result.floats.push({ name: float_match[1], value: parseFloat(float_match[2]) });
                i++;
            }
            continue;
        }

        // m_Colors section
        if (trimmed.startsWith('m_Colors:')) {
            const section_val = trimmed.slice('m_Colors:'.length).trim();
            if (section_val === '{}' || section_val === '[]') { i++; continue; }
            i++;
            while (i < lines.length) {
                const cline = lines[i].trimStart();
                if (cline.length === 0) { i++; continue; } // skip blank lines
                // "- _Color: {r: 1, g: 1, b: 1, a: 1}"
                const name_match = cline.match(/^-\s+(\S+):/);
                if (!name_match) break;
                const cm = color_re.exec(cline);
                if (cm) {
                    result.colors.push({
                        name: name_match[1],
                        r: parseFloat(cm[1]), g: parseFloat(cm[2]),
                        b: parseFloat(cm[3]), a: parseFloat(cm[4]),
                    });
                }
                i++;
            }
            continue;
        }

        i++;
    }

    return result;
}

// ========== Dependency Graph Helpers ==========

/** Categorize an asset by its file extension. */
function categorize_asset(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const categories: Record<string, string> = {
        '.cs': 'script', '.mat': 'material', '.unity': 'scene', '.prefab': 'prefab',
        '.asset': 'asset', '.png': 'texture', '.jpg': 'texture', '.jpeg': 'texture',
        '.tga': 'texture', '.psd': 'texture', '.tif': 'texture', '.tiff': 'texture',
        '.bmp': 'texture', '.gif': 'texture', '.fbx': 'model', '.obj': 'model',
        '.dae': 'model', '.blend': 'model', '.anim': 'animation', '.controller': 'animator',
        '.overrideController': 'animator', '.shader': 'shader', '.cginc': 'shader',
        '.hlsl': 'shader', '.compute': 'shader', '.mp3': 'audio', '.wav': 'audio',
        '.ogg': 'audio', '.aif': 'audio', '.ttf': 'font', '.otf': 'font',
        '.mask': 'avatar_mask', '.mixer': 'audio_mixer', '.renderTexture': 'render_texture',
        '.flare': 'flare', '.guiskin': 'gui_skin', '.terrainlayer': 'terrain', '.cubemap': 'cubemap',
    };
    return categories[ext] || 'other';
}

/** Walk up from a file path to find the Unity project root (has Assets/ and ProjectSettings/). */
function find_project_root_from_file(filePath: string): string | null {
    let dir = dirname(resolve(filePath));
    for (let i = 0; i < 20; i++) {
        if (existsSync(join(dir, 'Assets')) && existsSync(join(dir, 'ProjectSettings'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

// ========== Editor Log Helpers ==========

/** Get the default Unity Editor.log path for the current platform. */
function get_editor_log_path(): string | null {
    const p = platform();
    if (p === 'darwin') return join(homedir(), 'Library', 'Logs', 'Unity', 'Editor.log');
    if (p === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        return join(localAppData, 'Unity', 'Editor', 'Editor.log');
    }
    if (p === 'linux') return join(homedir(), '.config', 'unity3d', 'Editor.log');
    return null;
}

interface LogEntry {
    line_number: number;
    level: 'error' | 'warning' | 'info' | 'import_error';
    message: string;
    stack_trace?: string[];
}

/** Try to extract a timestamp from a Unity Editor.log line.
 *  Common formats: "2024/01/15 10:30:45", "2024-01-15T10:30:45", "[HH:MM:SS]" */
function parse_log_line_timestamp(line: string): Date | null {
    // ISO-ish: 2024-01-15T10:30:45 or 2024/01/15 10:30:45 or 2024-01-15 10:30:45
    const iso_re = /(\d{4}[-/]\d{2}[-/]\d{2})[T ](\d{2}:\d{2}:\d{2})/;
    const m = iso_re.exec(line);
    if (m) {
        const dateStr = m[1].replace(/\//g, '-');
        const d = new Date(`${dateStr}T${m[2]}`);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

/** Parse Unity Editor.log lines into structured entries. */
function parse_log_entries(lines: string[]): LogEntry[] {
    const entries: LogEntry[] = [];
    const error_re = /^(error|exception|Error|Exception|ERROR)/i;
    const warning_re = /^(warning|Warning|WARNING)/i;
    const compile_re = /Assets\/.*\.cs\(\d+,\d+\):\s*error\s+CS/;
    const import_error_re = /Failed to import|Error while importing|Could not create asset|Unable to import|Shader error in|Import of asset .* failed/i;
    const stack_re = /^\s+at\s+|^\s*\(Filename:/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) continue;

        let level: LogEntry['level'] = 'info';
        if (import_error_re.test(line)) level = 'import_error';
        else if (error_re.test(line) || compile_re.test(line)) level = 'error';
        else if (warning_re.test(line)) level = 'warning';

        // Collect stack trace lines
        const stack: string[] = [];
        let j = i + 1;
        while (j < lines.length && stack_re.test(lines[j])) {
            stack.push(lines[j].trim());
            j++;
        }

        if (level !== 'info' || stack.length > 0) {
            const entry: LogEntry = { line_number: i + 1, level, message: line };
            if (stack.length > 0) entry.stack_trace = stack;
            entries.push(entry);
            i = j - 1;
        }
    }
    return entries;
}

// ========== Animation Clip Helpers ==========

interface AnimationKeyframe {
    time: number;
    value: number;
    in_slope: number;
    out_slope: number;
    tangent_mode?: number;
    weighted_mode?: number;
    in_weight?: number;
    out_weight?: number;
}

interface AnimationCurve {
    type: string;
    path: string;
    attribute: string;
    class_id: number;
    keyframes: AnimationKeyframe[];
}

interface ParsedAnimationClip {
    name: string;
    legacy: boolean;
    sample_rate: number;
    wrap_mode: number;
    loop_time: boolean;
    duration: number;
    position_curve_count: number;
    rotation_curve_count: number;
    scale_curve_count: number;
    float_curve_count: number;
    euler_curve_count: number;
    animated_paths: string[];
    events: { time: number; function_name: string; data: string; int_parameter: number; float_parameter: number }[];
    curves?: AnimationCurve[];
}

/** Parse an AnimationClip from raw YAML content. */
function parse_animation_yaml(content: string, include_curves = false): ParsedAnimationClip | null {
    const lines = content.split(/\r?\n/);
    const result: ParsedAnimationClip = {
        name: '', legacy: false, sample_rate: 60, wrap_mode: 0,
        loop_time: false, duration: 0,
        position_curve_count: 0, rotation_curve_count: 0,
        scale_curve_count: 0, float_curve_count: 0, euler_curve_count: 0,
        animated_paths: [], events: [],
    };

    // Check for AnimationClip header
    if (!content.includes('AnimationClip:')) return null;

    const paths = new Set<string>();
    let raw_length = 0;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();

        if (trimmed.startsWith('m_Name:')) {
            result.name = trimmed.slice('m_Name:'.length).trim();
        } else if (trimmed.startsWith('m_Legacy:')) {
            result.legacy = trimmed.slice('m_Legacy:'.length).trim() === '1';
        } else if (trimmed.startsWith('m_SampleRate:')) {
            result.sample_rate = parseFloat(trimmed.slice('m_SampleRate:'.length).trim()) || 60;
        } else if (trimmed.startsWith('m_WrapMode:')) {
            result.wrap_mode = parseInt(trimmed.slice('m_WrapMode:'.length).trim(), 10) || 0;
        } else if (trimmed.startsWith('m_LoopTime:')) {
            result.loop_time = trimmed.slice('m_LoopTime:'.length).trim() === '1';
        } else if (trimmed.startsWith('m_StopTime:')) {
            result.duration = parseFloat(trimmed.slice('m_StopTime:'.length).trim()) || 0;
        } else if (trimmed.startsWith('m_Length:')) {
            raw_length = parseFloat(trimmed.slice('m_Length:'.length).trim()) || 0;
        } else if (trimmed.startsWith('m_PositionCurves:') && !trimmed.endsWith('[]')) {
            result.position_curve_count++;
        } else if (trimmed.startsWith('m_RotationCurves:') && !trimmed.endsWith('[]')) {
            result.rotation_curve_count++;
        } else if (trimmed.startsWith('m_ScaleCurves:') && !trimmed.endsWith('[]')) {
            result.scale_curve_count++;
        } else if (trimmed.startsWith('m_FloatCurves:') && !trimmed.endsWith('[]')) {
            result.float_curve_count++;
        } else if (trimmed.startsWith('m_EulerCurves:') && !trimmed.endsWith('[]')) {
            result.euler_curve_count++;
        } else if (trimmed.startsWith('path:')) {
            const p = trimmed.slice('path:'.length).trim();
            if (p.length > 0) paths.add(p);
        } else if (trimmed.startsWith('functionName:')) {
            const fn_name = trimmed.slice('functionName:'.length).trim();
            // Read surrounding event fields (±5 to cover all 7 event fields)
            let time = 0, data = '', int_param = 0, float_param = 0;
            for (let j = Math.max(0, i - 5); j <= Math.min(lines.length - 1, i + 5); j++) {
                let et = lines[j].trimStart();
                // Strip YAML array indicator for first field in event entry
                if (et.startsWith('- ')) et = et.slice(2);
                if (et.startsWith('time:')) time = parseFloat(et.slice('time:'.length).trim()) || 0;
                if (et.startsWith('data:')) data = et.slice('data:'.length).trim();
                if (et.startsWith('intParameter:')) int_param = parseInt(et.slice('intParameter:'.length).trim(), 10) || 0;
                if (et.startsWith('floatParameter:')) float_param = parseFloat(et.slice('floatParameter:'.length).trim()) || 0;
            }
            result.events.push({ time, function_name: fn_name, data, int_parameter: int_param, float_parameter: float_param });
        }
    }

    // Count curves more accurately by counting "- curve:" entries in each section
    // Also track max keyframe time for duration fallback (legacy clips lack m_Length)
    let in_section = '';
    let pos_count = 0, rot_count = 0, scale_count = 0, float_count = 0, euler_count = 0;
    let max_keyframe_time = 0;
    for (const line of lines) {
        const t = line.trimStart();
        if (t.startsWith('m_PositionCurves:')) in_section = 'pos';
        else if (t.startsWith('m_RotationCurves:') || t.startsWith('m_CompressedRotationCurves:')) in_section = 'rot';
        else if (t.startsWith('m_ScaleCurves:')) in_section = 'scale';
        else if (t.startsWith('m_FloatCurves:')) in_section = 'float';
        else if (t.startsWith('m_EulerCurves:')) in_section = 'euler';
        else if (/^  m_\w+:/.test(line)) in_section = '';

        if (t.startsWith('- curve:')) {
            if (in_section === 'pos') pos_count++;
            else if (in_section === 'rot') rot_count++;
            else if (in_section === 'scale') scale_count++;
            else if (in_section === 'float') float_count++;
            else if (in_section === 'euler') euler_count++;
        }

        if (in_section && t.startsWith('time:')) {
            const kt = parseFloat(t.slice('time:'.length).trim());
            if (kt > max_keyframe_time) max_keyframe_time = kt;
        }
    }
    result.position_curve_count = pos_count;
    result.rotation_curve_count = rot_count;
    result.scale_curve_count = scale_count;
    result.float_curve_count = float_count;
    result.euler_curve_count = euler_count;

    result.animated_paths = Array.from(paths);

    // Duration priority: m_Length > max keyframe time > m_StopTime
    // m_Length is actual clip duration (not present in legacy clips)
    // Max keyframe time derived from curve data (reliable for legacy clips)
    // m_StopTime is normalized (0-1) for legacy clips, only useful as last resort
    if (raw_length > 0) result.duration = raw_length;
    else if (max_keyframe_time > 0) result.duration = max_keyframe_time;

    // Parse full curve data if requested
    if (include_curves) {
        const curves: AnimationCurve[] = [];
        const CURVE_SECTIONS: Record<string, string> = {
            'm_PositionCurves:': 'position',
            'm_RotationCurves:': 'rotation',
            'm_ScaleCurves:': 'scale',
            'm_FloatCurves:': 'float',
            'm_EulerCurves:': 'euler',
            'm_PPtrCurves:': 'pptr',
        };

        let ci = 0;
        let current_section = '';
        while (ci < lines.length) {
            const ct = lines[ci].trimStart();

            // Detect section headers
            let found_section = false;
            for (const [header, type] of Object.entries(CURVE_SECTIONS)) {
                if (ct.startsWith(header)) {
                    current_section = ct.endsWith('[]') ? '' : type;
                    found_section = true;
                    break;
                }
            }
            if (found_section) { ci++; continue; }

            // Reset section on any other m_ field at root indentation
            if (current_section && ct.startsWith('m_') && ct.includes(':') && !Object.keys(CURVE_SECTIONS).some(h => ct.startsWith(h))) {
                current_section = '';
                ci++;
                continue;
            }

            // Parse curve entries within a section
            if (current_section && ct.startsWith('- curve:')) {
                const curve_entry_indent = lines[ci].length - lines[ci].trimStart().length;
                let curve_path = '';
                let attribute = '';
                let class_id = 0;
                const keyframes: AnimationKeyframe[] = [];

                // Read the curve's sub-properties
                ci++;
                let in_keyframes = false;
                while (ci < lines.length) {
                    const raw_indent = lines[ci].length - lines[ci].trimStart().length;
                    const sub = lines[ci].trimStart();
                    // Only break on `- curve:` or `m_` at the same or lesser indent (section boundary)
                    if (sub.startsWith('- curve:') && raw_indent <= curve_entry_indent) break;
                    if (sub.startsWith('m_') && sub.includes(':') && raw_indent <= curve_entry_indent) break;

                    if (sub.startsWith('path:')) {
                        curve_path = sub.slice('path:'.length).trim();
                    } else if (sub.startsWith('attribute:')) {
                        attribute = sub.slice('attribute:'.length).trim();
                    } else if (sub.startsWith('classID:')) {
                        class_id = parseInt(sub.slice('classID:'.length).trim(), 10) || 0;
                    } else if (sub.startsWith('m_Curve:')) {
                        in_keyframes = !sub.endsWith('[]');
                    } else if (in_keyframes && sub.startsWith('- serializedVersion:')) {
                        // Start of a keyframe entry -- read following lines
                        // Record indent of `- serializedVersion:` to detect when we leave the keyframe block
                        const kf_base_indent = raw_indent;
                        const kf: AnimationKeyframe = { time: 0, value: 0, in_slope: 0, out_slope: 0 };
                        ci++;
                        while (ci < lines.length) {
                            const kl_indent = lines[ci].length - lines[ci].trimStart().length;
                            // Break when we leave the keyframe block (line at same or lesser indent)
                            if (kl_indent <= kf_base_indent) break;
                            const kl = lines[ci].trimStart();
                            if (kl.startsWith('time:')) kf.time = parseFloat(kl.slice('time:'.length).trim()) || 0;
                            else if (kl.startsWith('value:')) kf.value = parseFloat(kl.slice('value:'.length).trim()) || 0;
                            else if (kl.startsWith('inSlope:')) kf.in_slope = parseFloat(kl.slice('inSlope:'.length).trim()) || 0;
                            else if (kl.startsWith('outSlope:')) kf.out_slope = parseFloat(kl.slice('outSlope:'.length).trim()) || 0;
                            else if (kl.startsWith('tangentMode:')) kf.tangent_mode = parseInt(kl.slice('tangentMode:'.length).trim(), 10) || 0;
                            else if (kl.startsWith('weightedMode:')) kf.weighted_mode = parseInt(kl.slice('weightedMode:'.length).trim(), 10) || 0;
                            else if (kl.startsWith('inWeight:')) kf.in_weight = parseFloat(kl.slice('inWeight:'.length).trim()) || 0;
                            else if (kl.startsWith('outWeight:')) kf.out_weight = parseFloat(kl.slice('outWeight:'.length).trim()) || 0;
                            ci++;
                        }
                        keyframes.push(kf);
                        continue;
                    }
                    ci++;
                }

                curves.push({ type: current_section, path: curve_path, attribute, class_id, keyframes });
                continue;
            }

            ci++;
        }

        result.curves = curves;
    }

    return result;
}

// ========== Animator Controller Helpers ==========

const ANIMATOR_PARAM_TYPES: Record<number, string> = {
    1: 'Float', 3: 'Int', 4: 'Bool', 9: 'Trigger',
};

const ANIMATOR_CONDITION_MODES: Record<number, string> = {
    1: 'If', 2: 'IfNot', 3: 'Greater', 4: 'Less', 6: 'Equals', 7: 'NotEqual',
};

interface AnimatorBlock {
    file_id: string;
    class_id: number;
    type_name: string;
    raw: string;
}

/** Split a multi-document Unity YAML into blocks. */
function split_yaml_blocks(content: string): AnimatorBlock[] {
    const blocks: AnimatorBlock[] = [];
    const doc_re = /^--- !u!(\d+) &(-?\d+)/;
    const lines = content.split(/\r?\n/);
    let current_lines: string[] = [];
    let current_class_id = 0;
    let current_file_id = '';

    for (const line of lines) {
        const m = doc_re.exec(line);
        if (m) {
            if (current_lines.length > 0) {
                const type_line = current_lines.find(l => /^\w+:/.test(l.trimStart()));
                blocks.push({
                    file_id: current_file_id,
                    class_id: current_class_id,
                    type_name: type_line ? type_line.trimStart().replace(/:.*/, '') : 'Unknown',
                    raw: current_lines.join('\n'),
                });
            }
            current_class_id = parseInt(m[1], 10);
            current_file_id = m[2];
            current_lines = [];
        } else if (!line.startsWith('%')) {
            current_lines.push(line);
        }
    }
    if (current_lines.length > 0) {
        const type_line = current_lines.find(l => /^\w+:/.test(l.trimStart()));
        blocks.push({
            file_id: current_file_id,
            class_id: current_class_id,
            type_name: type_line ? type_line.trimStart().replace(/:.*/, '') : 'Unknown',
            raw: current_lines.join('\n'),
        });
    }
    return blocks;
}

/** Extract a YAML field value from a block's raw text. */
function yaml_field(raw: string, field: string): string | null {
    const re = new RegExp(`^\\s*${field}:\\s*(.*)$`, 'm');
    const m = re.exec(raw);
    return m ? m[1].trim() : null;
}

/** Extract an inline reference {fileID: X, guid: Y} from a string. */
function parse_inline_ref(str: string): { fileID: string; guid: string } | null {
    const m = /\{[^}]*fileID:\s*(-?\d+)(?:[^}]*guid:\s*([a-f0-9]+))?/.exec(str);
    return m ? { fileID: m[1], guid: m[2] || '' } : null;
}

// ========== Dependency scan helpers ==========

/** Recursively walk a directory, yielding file paths. */
function walk_files(dir: string, extensions: Set<string>): string[] {
    const results: string[] = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop()!;
        let entries: string[];
        try { entries = readdirSync(current); } catch { continue; }
        for (const entry of entries) {
            if (entry.startsWith('.')) continue;
            const full = join(current, entry);
            try {
                const stat = statSync(full);
                if (stat.isDirectory()) {
                    stack.push(full);
                } else if (extensions.has(extname(full).toLowerCase())) {
                    results.push(full);
                }
            } catch { continue; }
        }
    }
    return results;
}

/** Check if a file is a Unity YAML file by reading its header. */
function validate_unity_yaml(file: string): string | null {
    if (!existsSync(file)) {
        return `File not found: ${file}`;
    }
    try {
        const fd = require('fs').openSync(file, 'r');
        const buf = Buffer.alloc(64);
        const bytesRead = require('fs').readSync(fd, buf, 0, 64, 0);
        require('fs').closeSync(fd);
        if (bytesRead === 0) {
            return `File is empty: ${file}`;
        }
        const header = buf.toString('utf-8', 0, bytesRead);
        if (!header.startsWith('%YAML') || !header.includes('!u!')) {
            if (buf[0] === 0x89 && header.slice(1, 4) === 'PNG') {
                return `File '${file}' is a binary file (PNG image), not a Unity YAML file`;
            }
            if (buf[0] === 0xFF && buf[1] === 0xD8) {
                return `File '${file}' is a binary file (JPEG image), not a Unity YAML file`;
            }
            const headerStr = header.slice(0, 10);
            if (headerStr.startsWith('UnityFS') || headerStr.startsWith('UnityRaw') || headerStr.startsWith('UnityWeb')) {
                const bundleType = headerStr.startsWith('UnityFS') ? 'UnityFS bundle' : headerStr.startsWith('UnityRaw') ? 'UnityRaw bundle' : 'UnityWeb bundle';
                return `File '${file}' is a binary file (${bundleType}), not a Unity YAML file`;
            }
            if (buf.subarray(0, bytesRead).some(b => b === 0)) {
                return `File '${file}' is not a Unity YAML file (binary content detected). If this is a Unity asset, re-serialize as text: Edit > Project Settings > Editor > Asset Serialization > Force Text`;
            }
            return `File "${file}" is not a Unity YAML file (missing %YAML/!u! header)`;
        }
    } catch {
        return `Cannot read file: ${file}`;
    }
    return null;
}

export function build_read_command(getScanner: () => UnityScanner): Command {
    const cmd = new Command('read')
        .description('Read Unity files, settings, and build data');

    cmd.command('scene <file>')
        .description('List GameObject hierarchy in a Unity scene or prefab file')
        .option('-j, --json', 'Output as JSON')
        .option('-p, --properties', 'Include component properties')
        .option('-v, --verbose', 'Show internal Unity IDs')
        .option('--page-size <n>', 'Max objects per page (default 200, max 1000)', '200')
        .option('--cursor <n>', 'Start offset for pagination (default 0)', '0')
        .option('--max-depth <n>', 'Max hierarchy depth (default 10, max 50)', '10')
        .option('--summary', 'Show compact summary (counts only, no object list)')
        .option('--filter-component <type>', 'Filter results to GameObjects with this component type')
        .action((file, options) => {
            const validationError = validate_unity_yaml(file);
            if (validationError) {
                console.log(JSON.stringify({ error: validationError }, null, 2));
                process.exit(1);
            }
            const rawPageSize = parseInt(options.pageSize, 10);
            if (isNaN(rawPageSize) || rawPageSize < 1) {
                console.log(JSON.stringify({ error: '--page-size must be a positive integer' }));
                process.exit(1);
            }
            const pageSize = Math.min(rawPageSize, 1000);
            const pageSizeWarning = rawPageSize > 1000 ? `--page-size capped to 1000 (requested ${rawPageSize})` : undefined;
            const rawCursor = parseInt(options.cursor, 10);
            if (isNaN(rawCursor) || rawCursor < 0) {
                console.log(JSON.stringify({ error: '--cursor must be a non-negative integer' }));
                process.exit(1);
            }
            const cursor = rawCursor;
            const rawMaxDepth = parseInt(options.maxDepth, 10);
            if (isNaN(rawMaxDepth) || rawMaxDepth < 0) {
                console.log(JSON.stringify({ error: '--max-depth must be a non-negative integer (0-50)' }));
                process.exit(1);
            }
            const maxDepth = Math.min(rawMaxDepth, 50);
            const maxDepthWarning = rawMaxDepth > 50 ? `--max-depth capped to 50 (requested ${rawMaxDepth})` : undefined;

            const result = getScanner().inspect_all_paginated({
                file,
                include_properties: options.properties === true,
                verbose: options.verbose === true,
                page_size: pageSize,
                cursor,
                max_depth: maxDepth,
                filter_component: options.filterComponent,
            });

            if (result.error) {
                console.log(JSON.stringify({ error: result.error }, null, 2));
                process.exit(1);
            }

            if (!file.endsWith('.unity') && !file.endsWith('.prefab') && result.gameobjects) {
                result.warning = `File "${file}" is not a .unity scene or prefab file`;
            }
            if (pageSizeWarning) {
                result.warning = result.warning ? `${result.warning}; ${pageSizeWarning}` : pageSizeWarning;
            }
            if (maxDepthWarning) {
                result.warning = result.warning ? `${result.warning}; ${maxDepthWarning}` : maxDepthWarning;
            }

            if (result.total === 0 && !result.error) {
                // Check if this is a PrefabVariant (has prefab_instances but no direct gameobjects)
                const prefabInstances = (result as unknown as Record<string, unknown>).prefabInstances as Array<Record<string, unknown>> | undefined;
                if (prefabInstances && prefabInstances.length > 0) {
                    // Try to resolve source prefab hierarchy
                    try {
                        const doc = UnityDocument.from_file(file);
                        const projectPath = find_unity_project_root(dirname(file));
                        const resolved = resolve_source_prefab(doc, file, projectPath ?? undefined);

                        if (resolved) {
                            // Inspect the source prefab
                            const sourceResult = getScanner().inspect_all_paginated({
                                file: resolved.source_path,
                                include_properties: options.properties === true,
                                verbose: options.verbose === true,
                                page_size: pageSize,
                                cursor: 0,
                                max_depth: maxDepth,
                                filter_component: options.filterComponent,
                            });

                            if (sourceResult.total > 0 && sourceResult.gameobjects) {
                                // Apply m_Name overrides from variant modifications
                                const piBlock = resolved.prefab_instance_block;
                                const nameOverrides = new Map<string, string>();
                                const namePattern = /- target:[ \t]*\{fileID:[ \t]*(-?\d+)[^}]*\}\s*\n\s*propertyPath:[ \t]*m_Name\s*\n\s*value:[ \t]*(.*)/g;
                                let nameMatch;
                                while ((nameMatch = namePattern.exec(piBlock.raw)) !== null) {
                                    nameOverrides.set(nameMatch[1], nameMatch[2].trim());
                                }

                                // Apply name overrides to source gameobjects
                                for (const go of sourceResult.gameobjects) {
                                    const goRecord = go as unknown as Record<string, unknown>;
                                    const override = nameOverrides.get(goRecord.fileId as string);
                                    if (override) {
                                        goRecord.name = override;
                                    }
                                }

                                // Merge into result
                                const resultRecord = result as unknown as Record<string, unknown>;
                                resultRecord.gameobjects = sourceResult.gameobjects;
                                resultRecord.total = sourceResult.total;
                                resultRecord.totalInScene = sourceResult.totalInScene;
                                resultRecord.resolvedFromSource = true;
                                resultRecord.sourcePrefab = resolved.source_path;
                                resultRecord.sourceGuid = resolved.source_guid;

                                const variantNote = `PrefabVariant resolved from source prefab: ${resolved.source_path}`;
                                result.warning = result.warning ? `${result.warning}; ${variantNote}` : variantNote;
                            }
                        }
                    } catch { /* source resolution failed, fall through to corrupt warning */ }
                }

                // If still 0 gameobjects after variant resolution, show the corrupt warning
                if (result.total === 0) {
                    try {
                        const fileSize = statSync(file).size;
                        if (fileSize > 100) {
                            const corruptWarning = 'File has valid Unity YAML header but contains no parseable GameObjects -- file may be corrupt or malformed';
                            result.warning = result.warning ? `${result.warning}; ${corruptWarning}` : corruptWarning;
                        }
                    } catch { /* ignore stat errors */ }
                }
            }

            if (options.summary) {
                const component_counts: Record<string, number> = {};
                const gos = result.gameobjects || [];
                for (const go of gos) {
                    for (const comp of (go.components || [])) {
                        const t = comp.type || 'Unknown';
                        component_counts[t] = (component_counts[t] || 0) + 1;
                    }
                }
                const prefab_instances = result.prefabInstances?.length || 0;
                console.log(JSON.stringify({
                    file: result.file,
                    total_gameobjects: result.totalInScene,
                    total_at_depth: result.total,
                    prefab_instances,
                    component_counts,
                    ...(result.truncated ? { component_counts_note: 'Counts reflect current page only. Use --page-size or --cursor to see more.' } : {}),
                    page_shown: gos.length,
                    truncated: result.truncated,
                }, null, 2));
                return;
            }

            console.log(JSON.stringify(result, null, 2));
        });

    cmd.command('gameobject <file> <object_id>')
        .description('Get GameObject details by name or file ID')
        .option('-c, --component <type>', 'Get specific component type')
        .option('-p, --properties', 'Include component properties')
        .option('-j, --json', 'Output as JSON')
        .option('-v, --verbose', 'Show internal Unity IDs')
        .action((file, object_id, options) => {
            const validationErr = validate_unity_yaml(file);
            if (validationErr) {
                console.log(JSON.stringify({ error: validationErr }, null, 2));
                process.exit(1);
            }
            // Check for duplicate names before inspect
            let resolved_id = object_id;
            if (!/^-?\d+$/.test(object_id)) {
                const matches = getScanner().find_by_name(file, object_id, false);
                if (matches.length > 1) {
                    const ids = matches.map(m => m.fileId).join(', ');
                    console.log(JSON.stringify({ error: `Multiple GameObjects named "${object_id}" found (fileIDs: ${ids}). Use numeric fileID.` }, null, 2));
                    process.exit(1);
                }
                if (matches.length === 1) {
                    resolved_id = matches[0].fileId;
                }
            }
            const result = getScanner().inspect({
                file,
                identifier: resolved_id,
                include_properties: options.properties === true,
                verbose: options.verbose,
            });

            if (!result) {
                const label = /^-?\d+$/.test(object_id) ? 'fileID' : 'name';
                console.log(JSON.stringify({ error: `GameObject with ${label} "${object_id}" not found` }, null, 2));
                process.exit(1);
            }

            if (result.is_error) {
                console.log(JSON.stringify({ error: result.error }, null, 2));
                process.exit(1);
            }

            if (options.component) {
                const comps = result.components.filter(c => c.type === options.component);
                if (comps.length > 0) {
                    console.log(JSON.stringify({
                        file,
                        name: result.name,
                        file_id: result.file_id,
                        components: comps,
                    }, null, 2));
                } else {
                    const available = result.components.map(c => c.type).join(', ');
                    console.log(JSON.stringify({
                        error: `No component of type "${options.component}" found on "${result.name}". Available: ${available}`,
                    }, null, 2));
                    process.exit(1);
                }
                return;
            }

            console.log(JSON.stringify({ file, object: result }, null, 2));
        });

    cmd.command('asset <file>')
        .description('Read any Unity YAML asset file (.asset, .mat, .anim, etc.)')
        .option('-p, --properties', 'Include object properties (omitted by default for token efficiency)')
        .option('--raw', 'Output raw hex data for mesh vertex/index buffers (skip auto-decode)')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            const soValidationError = validate_unity_yaml(file);
            if (soValidationError) {
                console.log(JSON.stringify({ error: soValidationError }, null, 2));
                process.exit(1);
            }
            const objects = getScanner().read_asset(file, !options.raw);
            const outputObjects = options.properties
                ? objects
                : objects.map(obj => {
                    const { properties: _props, ...rest } = obj;
                    return rest;
                });
            const output = {
                file,
                count: outputObjects.length,
                objects: outputObjects,
            };
            console.log(JSON.stringify(output, null, 2));
        });

    // Deprecated alias: renamed to "read asset" in 0.2.1
    cmd.command('scriptable-object')
        .description('(Deprecated: renamed to "read asset")')
        .argument('[file]')
        .allowUnknownOption()
        .action(() => {
            console.log(JSON.stringify({
                error: 'Command "read scriptable-object" has been renamed to "read asset". Use: unity-agentic-tools read asset <file>',
            }, null, 2));
            process.exit(1);
        });

    cmd.command('material <file>')
        .description('Read a Unity Material file (.mat) with structured property output')
        .option('--project <path>', 'Unity project root (for GUID resolution)')
        .option('--summary', 'Show shader name, property count, texture count only')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!file.toLowerCase().endsWith('.mat')) {
                console.log(JSON.stringify({ error: `File must be a .mat file: ${file}` }, null, 2));
                process.exit(1);
            }

            const matValidationError = validate_unity_yaml(file);
            if (matValidationError) {
                console.log(JSON.stringify({ error: matValidationError }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(file, 'utf-8');

            // Validate the file actually contains a Material block (class_id 21)
            if (!content.includes('Material:')) {
                console.log(JSON.stringify({ error: `File "${file}" does not contain a Material block. Use 'read asset' for generic Unity YAML files.` }, null, 2));
                process.exit(1);
            }

            const mat = parse_material_yaml(content);

            if (!mat.name) {
                console.log(JSON.stringify({ error: `No Material found in "${file}". Is this a .mat file?` }, null, 2));
                process.exit(1);
            }

            // Resolve GUIDs to asset paths if cache available
            const cache = load_guid_cache_for_file(file, options.project);
            const shader_path = mat.shader.guid ? cache?.resolve(mat.shader.guid) ?? null : null;
            const textures_with_paths = mat.textures.map(t => ({
                ...t,
                path: t.texture_guid ? cache?.resolve(t.texture_guid) ?? null : null,
            }));

            if (options.summary) {
                console.log(JSON.stringify({
                    file,
                    name: mat.name,
                    shader_guid: mat.shader.guid || 'unknown',
                    shader_path,
                    render_queue: mat.render_queue,
                    keyword_count: mat.keywords.length,
                    texture_count: mat.textures.length,
                    float_count: mat.floats.length,
                    color_count: mat.colors.length,
                }, null, 2));
                return;
            }

            console.log(JSON.stringify({
                file,
                name: mat.name,
                shader: { ...mat.shader, path: shader_path },
                render_queue: mat.render_queue,
                keywords: mat.keywords,
                textures: textures_with_paths,
                floats: mat.floats,
                colors: mat.colors,
            }, null, 2));
        });

    cmd.command('dependencies <file>')
        .description('List asset dependencies (GUIDs referenced by this file)')
        .option('--project <path>', 'Unity project root (for GUID resolution)')
        .option('--unresolved', 'Show only GUIDs that could not be resolved')
        .option('--recursive [depth]', 'Follow dependency chain N levels deep (default: 3)')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }

            let content: string;
            try {
                content = readFileSync(file, 'utf-8');
            } catch {
                console.log(JSON.stringify({ error: `Cannot read file: ${file}` }, null, 2));
                process.exit(1);
                return;
            }

            // Extract all GUID references
            const guidRegex = /guid:\s*([a-f0-9]{32})/g;
            const guids = new Set<string>();
            let guidMatch: RegExpExecArray | null;
            while ((guidMatch = guidRegex.exec(content)) !== null) {
                guids.add(guidMatch[1]);
            }

            // Load GUID cache for resolution
            const cache = load_guid_cache_for_file(file, options.project);
            const projectPath = cache?.project_path || options.project || find_project_root_from_file(file);

            // Build dependency list
            interface Dependency {
                guid: string;
                path: string | null;
                type: string;
            }

            const dependencies: Dependency[] = [];
            for (const guid of guids) {
                const resolvedPath = cache?.resolve(guid) ?? null;
                const assetType = resolvedPath ? categorize_asset(resolvedPath) : 'unknown';
                dependencies.push({ guid, path: resolvedPath, type: assetType });
            }

            dependencies.sort((a, b) => {
                if (a.path && !b.path) return -1;
                if (!a.path && b.path) return 1;
                return a.type.localeCompare(b.type);
            });

            const filtered = options.unresolved
                ? dependencies.filter(d => d.path === null)
                : dependencies;

            // Group by type
            const byType: Record<string, Dependency[]> = {};
            for (const dep of filtered) {
                if (!byType[dep.type]) byType[dep.type] = [];
                byType[dep.type].push(dep);
            }

            // Handle --recursive traversal
            if (options.recursive !== undefined) {
                if (!cache) {
                    console.log(JSON.stringify({ error: 'GUID cache required for --recursive. Run "setup" first or provide --project.' }, null, 2));
                    process.exit(1);
                }

                const raw_depth = typeof options.recursive === 'string' ? parseInt(options.recursive, 10) : 3;
                if (isNaN(raw_depth) || raw_depth < 1) {
                    console.log(JSON.stringify({ error: '--recursive depth must be a positive integer (default: 3)' }, null, 2));
                    process.exit(1);
                }
                const max_depth = Math.min(raw_depth, 20);
                const visited = new Set<string>();
                const depGuidRegex = /guid:\s*([a-f0-9]{32})/g;

                interface RecursiveDep {
                    guid: string;
                    path: string | null;
                    type: string;
                    depth: number;
                    sub_dependencies?: RecursiveDep[];
                }

                function traverse_file(filePath: string, depth: number): RecursiveDep[] {
                    if (depth > max_depth) return [];
                    const result: RecursiveDep[] = [];
                    let fileContent: string;
                    try {
                        fileContent = readFileSync(filePath, 'utf-8');
                    } catch {
                        return [];
                    }

                    const fileGuids = new Set<string>();
                    let fm: RegExpExecArray | null;
                    while ((fm = depGuidRegex.exec(fileContent)) !== null) {
                        fileGuids.add(fm[1]);
                    }

                    for (const g of fileGuids) {
                        if (visited.has(g)) continue;
                        visited.add(g);

                        const rPath = cache!.resolve(g);
                        const rAbsPath = cache!.resolve_absolute(g);
                        const rType = rPath ? categorize_asset(rPath) : 'unknown';

                        const dep: RecursiveDep = { guid: g, path: rPath, type: rType, depth };

                        if (rAbsPath && depth < max_depth && existsSync(rAbsPath)) {
                            const subs = traverse_file(rAbsPath, depth + 1);
                            if (subs.length > 0) dep.sub_dependencies = subs;
                        }

                        result.push(dep);
                    }
                    return result;
                }

                // Start traversal with direct dependencies at depth 1
                for (const guid of guids) {
                    visited.add(guid);
                }
                const tree: RecursiveDep[] = [];
                for (const dep of dependencies) {
                    const rDep: RecursiveDep = { guid: dep.guid, path: dep.path, type: dep.type, depth: 0 };
                    if (dep.path) {
                        const absPath = cache.resolve_absolute(dep.guid);
                        if (absPath && existsSync(absPath)) {
                            const subs = traverse_file(absPath, 1);
                            if (subs.length > 0) rDep.sub_dependencies = subs;
                        }
                    }
                    tree.push(rDep);
                }

                console.log(JSON.stringify({
                    file,
                    project_path: projectPath || null,
                    max_depth,
                    total_direct_references: guids.size,
                    total_unique_dependencies: visited.size,
                    dependencies: tree,
                }, null, 2));
                return;
            }

            const output: Record<string, unknown> = {
                file,
                project_path: projectPath || null,
                total_references: guids.size,
                resolved: dependencies.filter(d => d.path !== null).length,
                unresolved: dependencies.filter(d => d.path === null).length,
                dependencies: options.unresolved ? filtered : undefined,
                by_type: options.unresolved ? undefined : byType,
            };
            if (!cache) {
                output._hint = "Run 'setup <project>' to resolve GUID paths";
            }
            console.log(JSON.stringify(output, null, 2));
        });

    cmd.command('settings <project_path>')
        .description('Read Unity project settings (TagManager, DynamicsManager, QualitySettings, TimeManager, etc.)')
        .option('-s, --setting <name>', 'Setting name or alias (tags, physics, quality, time)', 'TagManager')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, options) => {
            const result = read_settings({
                project_path,
                setting: options.setting,
            });

            console.log(JSON.stringify(result, null, 2));
            if (!result.success) process.exit(1);
        });

    cmd.command('build <project_path>')
        .description('Read build settings (scene list, build profiles)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, _options) => {
            try {
                const result = get_build_settings(project_path);
                console.log(JSON.stringify(result, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    cmd.command('scenes <project_path>')
        .description('Read build scenes (alias for "read build")')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, _options) => {
            try {
                const result = get_build_settings(project_path);
                console.log(JSON.stringify(result, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exitCode = 1;
            }
        });

    cmd.command('overrides <file> <prefab_instance>')
        .description('Read PrefabInstance override modifications')
        .option('--flat', 'Output simplified list')
        .option('-j, --json', 'Output as JSON')
        .action((file, prefab_instance, options) => {
            try {
                const doc = UnityDocument.from_file(file);
                let block = null;

                if (/^-?\d+$/.test(prefab_instance)) {
                    block = doc.find_by_file_id(prefab_instance);
                    if (block && block.class_id !== 1001) {
                        console.log(JSON.stringify({ error: `fileID ${prefab_instance} is not a PrefabInstance (class ${block.class_id})` }, null, 2));
                        process.exit(1);
                    }
                } else {
                    const all_prefab_instances = doc.find_by_class_id(1001);
                    for (const pi of all_prefab_instances) {
                        if (pi.raw.includes(`propertyPath: m_Name`) && pi.raw.includes(`value: ${prefab_instance}`)) {
                            block = pi;
                            break;
                        }
                    }
                }

                if (!block) {
                    console.log(JSON.stringify({ error: `PrefabInstance "${prefab_instance}" not found` }, null, 2));
                    process.exit(1);
                }

                const modifications = [];
                const lines = block.raw.split('\n');
                let i = 0;
                while (i < lines.length) {
                    if (lines[i].trim().startsWith('- target:')) {
                        const target_match = lines[i].match(/\{fileID:\s*(-?\d+)/);
                        const property_match = i + 1 < lines.length ? lines[i + 1].match(/propertyPath:\s*(.+)/) : null;
                        const value_match = i + 2 < lines.length ? lines[i + 2].match(/value:\s*(.*)/) : null;
                        const obj_ref_match = i + 3 < lines.length ? lines[i + 3].match(/objectReference:[ \t]*(.+)/) : null;

                        if (target_match && property_match) {
                            const mod: Record<string, unknown> = {
                                target_file_id: target_match[1],
                                property_path: property_match[1].trim(),
                                value: value_match ? value_match[1].trim() : '',
                                object_reference: obj_ref_match ? obj_ref_match[1].trim() : null,
                            };

                            // Parse managed reference type declarations into structured fields
                            const propPath = mod.property_path as string;
                            const modValue = mod.value as string;
                            if (propPath.endsWith('.managedReferenceType') && modValue) {
                                const spaceIdx = modValue.indexOf(' ');
                                if (spaceIdx > 0) {
                                    const assembly = modValue.substring(0, spaceIdx);
                                    const full_type = modValue.substring(spaceIdx + 1);
                                    const lastDot = full_type.lastIndexOf('.');
                                    mod.managed_reference_type = {
                                        assembly,
                                        full_type,
                                        namespace: lastDot >= 0 ? full_type.substring(0, lastDot) : '',
                                        class_name: lastDot >= 0 ? full_type.substring(lastDot + 1) : full_type,
                                    };
                                }
                            }

                            modifications.push(mod);
                        }
                        i += 4;
                    } else {
                        i++;
                    }
                }

                if (options.flat) {
                    const flat = modifications.map(m => ({
                        property_path: m.property_path,
                        value: m.value,
                        target_file_id: m.target_file_id,
                    }));
                    console.log(JSON.stringify(flat, null, 2));
                } else {
                    console.log(JSON.stringify(modifications, null, 2));
                }
            } catch (err) {
                console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exit(1);
            }
        });

    cmd.command('component <file> <file_id>')
        .description('Read a single component by fileID (use -p for content)')
        .option('-p, --properties', 'Include component properties/raw text (required to see values)')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, options) => {
            try {
                const doc = UnityDocument.from_file(file);
                const block = doc.find_by_file_id(file_id);

                if (!block) {
                    console.log(JSON.stringify({ error: `Component with fileID ${file_id} not found` }, null, 2));
                    process.exit(1);
                }

                const output: Record<string, unknown> = {
                    file,
                    file_id: block.file_id,
                    class_id: block.class_id,
                    type_name: block.type_name,
                };

                if (options.properties) {
                    const lines = block.raw.split('\n');
                    const body_lines = lines.slice(1);
                    output.raw_lines = body_lines;
                }

                console.log(JSON.stringify(output, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exit(1);
            }
        });

    cmd.command('reference <file> <file_id>')
        .description('Trace fileID references')
        .option('--direction <dir>', 'Direction to trace: in, out, or both (default: both)', 'both')
        .option('--depth <n>', 'Maximum depth to trace (default: 3)', '3')
        .option('-j, --json', 'Output as JSON')
        .action((file, file_id, options) => {
            try {
                const doc = UnityDocument.from_file(file);
                const direction = options.direction as 'in' | 'out' | 'both';

                if (!['in', 'out', 'both'].includes(direction)) {
                    console.log(JSON.stringify({ error: `Invalid direction "${direction}". Must be in, out, or both.` }, null, 2));
                    process.exit(1);
                }

                const depth = parseInt(options.depth, 10);
                if (isNaN(depth) || depth < 1) {
                    console.log(JSON.stringify({ error: 'Depth must be a positive integer' }, null, 2));
                    process.exit(1);
                }

                const edges = doc.trace_references(file_id, direction, depth);
                console.log(JSON.stringify({ file, file_id, direction, depth, edges }, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exit(1);
            }
        });

    cmd.command('target <file> <gameobject_name> [component_type]')
        .description('Build a --target reference string for prefab override commands')
        .option('-p, --project <path>', 'Unity project path')
        .option('-j, --json', 'Output as JSON')
        .action((file, gameobject_name, component_type, options) => {
            try {
                if (!existsSync(file)) {
                    console.log(JSON.stringify({ error: `File not found: ${file}` }, null, 2));
                    process.exit(1);
                }

                const doc = UnityDocument.from_file(file);

                // Determine GUID: PrefabVariants use the source prefab's GUID (targets reference source objects)
                let guid: string | null;
                const piBlocks = doc.find_by_class_id(1001);
                if (piBlocks.length > 0) {
                    const sourceMatch = piBlocks[0].raw.match(/m_SourcePrefab:[ \t]*\{[^}]*guid:[ \t]*([a-f0-9]{32})/);
                    guid = sourceMatch ? sourceMatch[1] : null;
                    if (!guid) {
                        console.log(JSON.stringify({ error: 'Cannot extract source GUID from PrefabInstance m_SourcePrefab.' }, null, 2));
                        process.exit(1);
                    }
                } else {
                    const metaPath = file + '.meta';
                    guid = extractGuidFromMeta(metaPath);
                    if (!guid) {
                        console.log(JSON.stringify({ error: `Cannot read GUID from ${metaPath}. Ensure the .meta file exists.` }, null, 2));
                        process.exit(1);
                    }
                }

                // Find the GameObject
                const goResult = doc.require_unique_game_object(gameobject_name);
                let targetFileId: string;

                if ('error' in goResult) {
                    // Fallback: search PrefabInstance modifications for m_Name
                    let found = false;
                    for (const block of doc.blocks) {
                        if (block.class_id !== 1001) continue;
                        const nameMatch = block.raw.match(
                            new RegExp(`- target:[ \\t]*\\{fileID:[ \\t]*(-?\\d+)[^}]*\\}\\s*\\n\\s*propertyPath:[ \\t]*m_Name\\s*\\n\\s*value:[ \\t]*${gameobject_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
                        );
                        if (nameMatch) {
                            targetFileId = nameMatch[1];
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        console.log(JSON.stringify({ error: goResult.error }, null, 2));
                        process.exit(1);
                    }
                } else {
                    targetFileId = goResult.file_id;
                }

                // If component_type specified, find the component on the GO
                if (component_type) {
                    const classId = get_class_id(component_type);
                    const goBlock = doc.find_by_file_id(targetFileId!);

                    if (goBlock && !goBlock.is_stripped) {
                        // Normal GO: search component list
                        const compRefs = [...goBlock.raw.matchAll(/component:[ \t]*\{fileID:[ \t]*(-?\d+)\}/g)].map(m => m[1]);
                        let compFound = false;
                        for (const refId of compRefs) {
                            const compBlock = doc.find_by_file_id(refId);
                            if (!compBlock) continue;
                            if (classId !== null && compBlock.class_id === classId) {
                                targetFileId = refId;
                                compFound = true;
                                break;
                            }
                            // Script-based match: check m_Script guid for MonoBehaviours
                            if (classId === null && compBlock.class_id === 114) {
                                const scriptMatch = compBlock.raw.match(/m_Script:[ \t]*\{[^}]*guid:[ \t]*([a-f0-9]{32})/);
                                if (scriptMatch) {
                                    const project = options.project || find_unity_project_root(dirname(file));
                                    if (project) {
                                        const cache = load_guid_cache(project);
                                        if (cache) {
                                            const scriptPath = cache.resolve(scriptMatch[1]);
                                            if (scriptPath && basename(scriptPath, '.cs').toLowerCase() === component_type.toLowerCase().replace(/\.cs$/, '')) {
                                                targetFileId = refId;
                                                compFound = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (!compFound) {
                            console.log(JSON.stringify({ error: `Component "${component_type}" not found on GameObject "${gameobject_name}"` }, null, 2));
                            process.exit(1);
                        }
                    } else {
                        // Stripped GO or not found directly: search source prefab for component
                        const project = options.project || find_unity_project_root(dirname(file));
                        const resolved = resolve_source_prefab(doc, file, project ?? undefined);
                        if (resolved) {
                            const sourceDoc = UnityDocument.from_file(resolved.source_path);
                            const sourceGo = sourceDoc.require_unique_game_object(gameobject_name);
                            if (!('error' in sourceGo)) {
                                const compRefs = [...sourceGo.raw.matchAll(/component:[ \t]*\{fileID:[ \t]*(-?\d+)\}/g)].map(m => m[1]);
                                let compFound = false;
                                for (const refId of compRefs) {
                                    const compBlock = sourceDoc.find_by_file_id(refId);
                                    if (!compBlock) continue;
                                    if (classId !== null && compBlock.class_id === classId) {
                                        targetFileId = refId;
                                        compFound = true;
                                        break;
                                    }
                                }
                                if (!compFound) {
                                    console.log(JSON.stringify({ error: `Component "${component_type}" not found on "${gameobject_name}" in source prefab` }, null, 2));
                                    process.exit(1);
                                }
                            }
                        }
                    }
                }

                const target = `{fileID: ${targetFileId!}, guid: ${guid}, type: 3}`;
                console.log(JSON.stringify({
                    target,
                    file_id: targetFileId!,
                    guid,
                    type: 3,
                }, null, 2));
            } catch (err) {
                console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
                process.exit(1);
            }
        });

    cmd.command('script <file>')
        .description('Extract C# type declarations from a .cs file or .NET DLL')
        .option('-j, --json', 'Output as JSON')
        .action((file, _options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }

            const isDll = file.toLowerCase().endsWith('.dll');
            const isCs = file.toLowerCase().endsWith('.cs');

            if (!isDll && !isCs) {
                console.log(JSON.stringify({ error: `File must be a .cs or .dll file: ${file}` }, null, 2));
                process.exit(1);
            }

            if (isDll) {
                const extractDll = getNativeExtractDllTypes();
                if (!extractDll) {
                    console.log(JSON.stringify({ error: 'Native module not available (required for DLL parsing)' }, null, 2));
                    process.exit(1);
                }
                const types = extractDll(file);
                console.log(JSON.stringify({ file, types }, null, 2));
            } else {
                const extractCs = getNativeExtractCsharpTypes();
                if (!extractCs) {
                    console.log(JSON.stringify({ error: 'Native module not available' }, null, 2));
                    process.exit(1);
                }
                const types = extractCs(file);
                console.log(JSON.stringify({ file, types }, null, 2));
            }
        });

    cmd.command('scripts')
        .description('List C# types from the type registry with optional filtering')
        .option('--project <path>', 'Unity project root path', '.')
        .option('--name <name>', 'Filter by type name (case-insensitive substring match)')
        .option('--filter <name>', 'Alias for --name')
        .option('--namespace <ns>', 'Filter by namespace (case-insensitive substring match)')
        .option('--kind <kind>', 'Filter by kind: class, struct, enum, interface')
        .option('--source <source>', 'Filter by source: assets, packages, dlls, all', 'all')
        .option('--max <n>', 'Maximum results to return', '100')
        .option('-j, --json', 'Output as JSON')
        .action((options) => {
            if (options.filter && !options.name) options.name = options.filter;
            const buildRegistry = getNativeBuildTypeRegistry();
            if (!buildRegistry) {
                console.log(JSON.stringify({ error: 'Native module not available' }, null, 2));
                process.exit(1);
            }

            const projectPath = resolve(options.project);
            const validSources = ['assets', 'packages', 'dlls', 'all'];
            if (!validSources.includes(options.source)) {
                console.log(JSON.stringify({ error: `Invalid --source "${options.source}". Valid values: ${validSources.join(', ')}` }, null, 2));
                process.exitCode = 1;
                return;
            }
            const includePackages = options.source === 'all' || options.source === 'packages';
            const includeDlls = options.source === 'all' || options.source === 'dlls';

            let types = buildRegistry(projectPath, includePackages, includeDlls);

            // Apply filters
            if (options.name) {
                const nameLower = options.name.toLowerCase();
                types = types.filter(t => t.name.toLowerCase().includes(nameLower));
            }
            if (options.namespace) {
                const nsLower = options.namespace.toLowerCase();
                types = types.filter(t => t.namespace?.toLowerCase().includes(nsLower) ?? false);
            }
            if (options.kind) {
                const kindLower = options.kind.toLowerCase();
                types = types.filter(t => t.kind.toLowerCase() === kindLower);
            }
            if (options.source === 'assets') {
                types = types.filter(t => {
                    const fp = t.filePath;
                    if (!fp) return false;
                    return fp.startsWith('Assets/') || fp.startsWith('Assets\\') ||
                        fp.includes('/Assets/') || fp.includes('\\Assets\\');
                });
            } else if (options.source === 'packages') {
                types = types.filter(t => t.filePath?.includes('PackageCache'));
            } else if (options.source === 'dlls') {
                types = types.filter(t => t.filePath?.endsWith('.dll'));
            }

            const maxResults = parseInt(options.max, 10);
            if (isNaN(maxResults) || maxResults < 1) {
                console.log(JSON.stringify({ error: `Invalid --max value "${options.max}". Must be a positive integer.` }, null, 2));
                process.exitCode = 1;
                return;
            }
            const truncated = types.length > maxResults;
            const displayed = types.slice(0, maxResults);

            console.log(JSON.stringify({
                project: projectPath,
                total: types.length,
                truncated,
                types: displayed,
            }, null, 2));
        });

    // ========== P3.1: Editor.log reading ==========
    cmd.command('log [project-path]')
        .description('Read and filter the Unity Editor.log')
        .option('--path <file>', 'Path to Editor.log (auto-detected if omitted)')
        .option('--project <path>', 'Filter to log entries from a specific Unity project session')
        .option('--tail <n>', 'Show last N lines (default 50)', '50')
        .option('--errors', 'Show only error entries')
        .option('--warnings', 'Show only warning entries')
        .option('--compile-errors', 'Show only C# compilation errors')
        .option('--import-errors', 'Show only asset import errors')
        .option('--since <timestamp>', 'Filter entries after this timestamp (YYYY-MM-DD or HH:MM:SS)')
        .option('--search <pattern>', 'Regex filter on log content')
        .option('-j, --json', 'Output as JSON')
        .action((projectPath: string | undefined, options) => {
            if (projectPath && !options.project) options.project = projectPath;
            const logPath = options.path || get_editor_log_path();
            if (!logPath || !existsSync(logPath)) {
                console.log(JSON.stringify({ error: `Editor.log not found${logPath ? `: ${logPath}` : '. Could not detect platform log path.'}` }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(logPath, 'utf-8');
            let lines = content.split(/\r?\n/);

            // Apply --project filter: find last session matching the project path
            if (options.project) {
                const projectPath = resolve(options.project as string);
                const projectName = basename(projectPath);
                const escapedPath = projectPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escapedName = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Unity session markers for the target project
                // Anchor project name to path separator to avoid partial matches (e.g. "my-echo" matching "echo")
                const session_markers = [
                    new RegExp(`Loading project at '${escapedPath}'`),
                    new RegExp(`Loading from Project at ${escapedPath}\\b`),
                    new RegExp(`Loading project at '.*[/\\\\]${escapedName}'`),
                    new RegExp(`Loading from Project at .*[/\\\\]${escapedName}\\b`),
                ];
                // Generic session marker: any project loading (for boundary detection)
                const any_session_re = /(?:Loading project at '|Loading from Project at )/;
                // Scan backwards for the last session marker for THIS project
                let session_start = -1;
                for (let si = lines.length - 1; si >= 0; si--) {
                    if (session_markers.some(re => re.test(lines[si]))) {
                        session_start = si;
                        break;
                    }
                }
                if (session_start >= 0) {
                    // Find the next session boundary (any project loading after our marker)
                    let session_end = lines.length;
                    for (let si = session_start + 1; si < lines.length; si++) {
                        if (any_session_re.test(lines[si]) && !session_markers.some(re => re.test(lines[si]))) {
                            session_end = si;
                            break;
                        }
                    }
                    lines = lines.slice(session_start, session_end);
                } else {
                    // No session found for this project — return empty rather than all lines
                    lines = [];
                }
            }

            // Apply --since filter
            if (options.since) {
                const since = options.since as string;
                // First try: literal substring match (e.g., session marker text)
                const sinceIdx = lines.findIndex(l => l.includes(since));
                if (sinceIdx >= 0) {
                    lines = lines.slice(sinceIdx);
                } else {
                    // Second try: date-based comparison against timestamps in log lines
                    const sinceDate = new Date(since);
                    if (!isNaN(sinceDate.getTime())) {
                        let foundIdx = -1;
                        for (let li = 0; li < lines.length; li++) {
                            const ts = parse_log_line_timestamp(lines[li]);
                            if (ts && ts >= sinceDate) {
                                foundIdx = li;
                                break;
                            }
                        }
                        if (foundIdx >= 0) {
                            lines = lines.slice(foundIdx);
                        } else {
                            // Check if ANY timestamps exist in the log
                            const hasTimestamps = lines.some(l => parse_log_line_timestamp(l) !== null);
                            if (hasTimestamps) {
                                // Timestamps found but all before --since date: return empty
                                lines = [];
                            } else {
                                console.log(JSON.stringify({
                                    error: `--since "${since}" did not match: no timestamps found in log. Unity Editor.log may not contain parseable timestamps.`,
                                    log_path: logPath,
                                }, null, 2));
                                process.exit(1);
                            }
                        }
                    } else {
                        console.log(JSON.stringify({
                            error: `--since "${since}" is not a valid date and was not found as text in the log`,
                            log_path: logPath,
                        }, null, 2));
                        process.exit(1);
                    }
                }
            }

            // Apply --search filter
            if (options.search) {
                const re = new RegExp(options.search as string, 'i');
                lines = lines.filter(l => re.test(l));
            }

            // Parse structured entries for error/warning/compile-errors modes
            if (options.errors || options.warnings || options.compileErrors || options.importErrors) {
                const entries = parse_log_entries(lines);
                let filtered = entries;
                if (options.compileErrors) {
                    const compileRe = /Assets\/.*\.cs\(\d+,\d+\):\s*error\s+CS/;
                    filtered = entries.filter(e => compileRe.test(e.message));
                } else if (options.importErrors) {
                    filtered = entries.filter(e => e.level === 'import_error');
                } else if (options.errors) {
                    filtered = entries.filter(e => e.level === 'error' || e.level === 'import_error');
                } else if (options.warnings) {
                    filtered = entries.filter(e => e.level === 'warning');
                }
                const tail_filtered = parseInt(options.tail as string, 10);
                if (isNaN(tail_filtered) || tail_filtered < 1) {
                    console.log(JSON.stringify({ error: `Invalid --tail value "${options.tail}". Must be a positive integer.` }, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const shown = filtered.slice(-tail_filtered);
                console.log(JSON.stringify({
                    log_path: logPath,
                    total_entries: filtered.length,
                    shown: shown.length,
                    entries: shown,
                }, null, 2));
                return;
            }

            // Default: show last N lines
            const tail = parseInt(options.tail as string, 10);
            if (isNaN(tail) || tail < 1) {
                console.log(JSON.stringify({ error: `Invalid --tail value "${options.tail}". Must be a positive integer.` }, null, 2));
                process.exitCode = 1;
                return;
            }
            const tailLines = lines.slice(-tail);
            console.log(JSON.stringify({
                log_path: logPath,
                total_lines: lines.length,
                shown: tailLines.length,
                lines: tailLines,
            }, null, 2));
        });

    // ========== P4.1: Meta file reading ==========
    cmd.command('meta <file>')
        .description('Read a Unity .meta file and show importer settings')
        .option('--summary', 'Show importer type and key settings only')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            const metaPath = file.endsWith('.meta') ? file : `${file}.meta`;
            if (!existsSync(metaPath)) {
                console.log(JSON.stringify({ error: `Meta file not found: ${metaPath}` }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(metaPath, 'utf-8');
            const lines = content.split(/\r?\n/);

            // Extract top-level fields
            let guid = '';
            let importer_type = 'Unknown';
            let assetBundleName = '';
            let assetBundleVariant = '';
            let userData = '';
            const settings: Record<string, string> = {};
            let in_importer = false;
            let importer_indent = 0;

            for (const line of lines) {
                const trimmed = line.trimStart();
                const indent = line.length - line.trimStart().length;

                if (trimmed.startsWith('guid:')) {
                    guid = trimmed.slice('guid:'.length).trim();
                    continue;
                }

                // Extract top-level fields that appear outside the importer block
                if (trimmed.startsWith('assetBundleName:')) {
                    assetBundleName = trimmed.slice('assetBundleName:'.length).trim();
                    continue;
                }
                if (trimmed.startsWith('assetBundleVariant:')) {
                    assetBundleVariant = trimmed.slice('assetBundleVariant:'.length).trim();
                    continue;
                }
                if (trimmed.startsWith('userData:')) {
                    userData = trimmed.slice('userData:'.length).trim();
                    continue;
                }

                // Detect importer type line (e.g., "TextureImporter:", "NativeFormatImporter:")
                if (indent === 0 && trimmed.endsWith(':') && trimmed.includes('Importer')) {
                    importer_type = trimmed.replace(':', '');
                    in_importer = true;
                    importer_indent = 0;
                    continue;
                }

                if (in_importer && indent > importer_indent) {
                    // Capture key-value pairs (skip deeply nested ones for summary)
                    // Use first occurrence only — platform overrides can repeat keys like maxTextureSize
                    const kv_match = trimmed.match(/^(\w+):\s*(.*)$/);
                    if (kv_match && indent <= 4 && !(kv_match[1] in settings)) {
                        settings[kv_match[1]] = kv_match[2];
                    }
                }
            }

            if (options.summary) {
                const key_settings: Record<string, string> = {};
                const important_keys = [
                    'maxTextureSize', 'textureCompression', 'filterMode', 'isReadable',
                    'spriteMode', 'textureType', 'textureFormat', 'compressionQuality',
                    'mainObjectFileID', 'meshCompression', 'importAnimation',
                ];
                for (const key of important_keys) {
                    if (settings[key]) key_settings[key] = settings[key];
                }
                console.log(JSON.stringify({
                    file: metaPath,
                    guid,
                    importer_type,
                    settings: key_settings,
                    ...(assetBundleName ? { assetBundleName } : {}),
                    ...(assetBundleVariant ? { assetBundleVariant } : {}),
                    ...(userData ? { userData } : {}),
                }, null, 2));
                return;
            }

            console.log(JSON.stringify({
                file: metaPath,
                guid,
                importer_type,
                assetBundleName,
                assetBundleVariant,
                userData,
                settings,
            }, null, 2));
        });

    // ========== P5.1: Animation clip reading ==========
    cmd.command('animation <file>')
        .description('Read a Unity AnimationClip file (.anim)')
        .option('--summary', 'Show name, duration, curve count, event count only')
        .option('--paths', 'List only animated property paths')
        .option('--curves', 'Show full keyframe data per curve')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            const animValidationError = validate_unity_yaml(file);
            if (animValidationError) {
                console.log(JSON.stringify({ error: animValidationError }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(file, 'utf-8');
            const clip = parse_animation_yaml(content, options.curves === true);
            if (!clip) {
                console.log(JSON.stringify({ error: `No AnimationClip found in "${file}". Is this an .anim file?` }, null, 2));
                process.exit(1);
            }

            const wrap_modes: Record<number, string> = { 0: 'Default', 1: 'Once', 2: 'Loop', 4: 'PingPong', 8: 'ClampForever' };
            const total_curves = clip.position_curve_count + clip.rotation_curve_count +
                clip.scale_curve_count + clip.float_curve_count + clip.euler_curve_count;

            if (options.paths) {
                console.log(JSON.stringify({
                    file,
                    name: clip.name,
                    animated_paths: clip.animated_paths,
                }, null, 2));
                return;
            }

            if (options.summary) {
                console.log(JSON.stringify({
                    file,
                    name: clip.name,
                    duration: clip.duration,
                    sample_rate: clip.sample_rate,
                    wrap_mode: wrap_modes[clip.wrap_mode] || String(clip.wrap_mode),
                    loop_time: clip.loop_time,
                    legacy: clip.legacy,
                    total_curves,
                    event_count: clip.events.length,
                    path_count: clip.animated_paths.length,
                }, null, 2));
                return;
            }

            const output: Record<string, unknown> = {
                file,
                name: clip.name,
                duration: clip.duration,
                sample_rate: clip.sample_rate,
                wrap_mode: wrap_modes[clip.wrap_mode] || String(clip.wrap_mode),
                loop_time: clip.loop_time,
                legacy: clip.legacy,
                curves: {
                    position: clip.position_curve_count,
                    rotation: clip.rotation_curve_count,
                    scale: clip.scale_curve_count,
                    float: clip.float_curve_count,
                    euler: clip.euler_curve_count,
                    total: total_curves,
                },
                animated_paths: clip.animated_paths,
                events: clip.events,
            };
            if (clip.curves) {
                output.curve_data = clip.curves;
            }
            console.log(JSON.stringify(output, null, 2));
        });

    // ========== P7.1: AnimatorController reading ==========
    cmd.command('animator <file>')
        .description('Read a Unity AnimatorController file (.controller)')
        .option('--project <path>', 'Unity project root (for GUID resolution of motion clips)')
        .option('--summary', 'Show parameter count, layer count, state count, transition count')
        .option('--parameters', 'List parameters only')
        .option('--states', 'List states only (per layer)')
        .option('--transitions', 'List transitions with conditions')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            const ctrlValidationError = validate_unity_yaml(file);
            if (ctrlValidationError) {
                console.log(JSON.stringify({ error: ctrlValidationError }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(file, 'utf-8');
            const blocks = split_yaml_blocks(content);
            const controller_block = blocks.find(b => b.class_id === 91);
            if (!controller_block) {
                console.log(JSON.stringify({ error: `No AnimatorController found in "${file}".` }, null, 2));
                process.exit(1);
            }

            // Parse parameters
            interface Param { name: string; type: string; default_value: number | boolean }
            const params: Param[] = [];
            const ptype_re = /m_Type:\s*(\d+)/;
            const ctrl_lines = controller_block.raw.split(/\r?\n/);
            let in_params = false;
            for (let i = 0; i < ctrl_lines.length; i++) {
                const t = ctrl_lines[i].trimStart();
                if (t.startsWith('m_AnimatorParameters:')) {
                    in_params = !t.endsWith('[]');
                    continue;
                }
                if (in_params && t.startsWith('- m_Name:')) {
                    const name = t.slice('- m_Name:'.length).trim();
                    const type_line = ctrl_lines[i + 1]?.trimStart() || '';
                    const type_match = ptype_re.exec(type_line);
                    const type_num = type_match ? parseInt(type_match[1], 10) : 0;
                    const type_name = ANIMATOR_PARAM_TYPES[type_num] || `Unknown(${type_num})`;

                    let default_value: number | boolean = 0;
                    if (type_num === 1) default_value = parseFloat(yaml_field(ctrl_lines.slice(i, i + 6).join('\n'), 'm_DefaultFloat') || '0');
                    else if (type_num === 3) default_value = parseInt(yaml_field(ctrl_lines.slice(i, i + 6).join('\n'), 'm_DefaultInt') || '0', 10);
                    else if (type_num === 4) default_value = (yaml_field(ctrl_lines.slice(i, i + 6).join('\n'), 'm_DefaultBool') || '0') !== '0';

                    params.push({ name, type: type_name, default_value });
                }
                if (in_params && t.startsWith('m_AnimatorLayers:')) in_params = false;
            }

            // Parse layers
            interface Layer { name: string; state_machine_id: string; blending_mode: number; weight: number }
            const layers: Layer[] = [];
            let in_layers = false;
            for (let i = 0; i < ctrl_lines.length; i++) {
                const t = ctrl_lines[i].trimStart();
                if (t.startsWith('m_AnimatorLayers:')) {
                    in_layers = !t.endsWith('[]');
                    continue;
                }
                if (in_layers && t.startsWith('m_Name:')) {
                    const name = t.slice('m_Name:'.length).trim();
                    // Forward scan for m_StateMachine (don't assume it's the next line)
                    let sm_ref: { fileID: string; guid: string } | null = null;
                    for (let j = i + 1; j < Math.min(i + 10, ctrl_lines.length); j++) {
                        const st = ctrl_lines[j].trimStart();
                        if (st.startsWith('m_StateMachine:')) {
                            sm_ref = parse_inline_ref(st);
                            break;
                        }
                        if (st.startsWith('- serializedVersion:') || st.startsWith('m_AnimatorLayers:')) break;
                    }
                    const blend_line = ctrl_lines.slice(i, i + 8).find(l => l.trimStart().startsWith('m_BlendingMode:'));
                    const weight_line = ctrl_lines.slice(i, i + 8).find(l => l.trimStart().startsWith('m_DefaultWeight:'));
                    layers.push({
                        name,
                        state_machine_id: sm_ref?.fileID || '',
                        blending_mode: parseInt(blend_line?.trimStart().split(':')[1] || '0', 10),
                        weight: parseFloat(weight_line?.trimStart().split(':')[1] || '1'),
                    });
                }
            }

            // Parse states
            interface State { file_id: string; name: string; speed: number; motion_ref: string | null; layer: string }
            const state_blocks = blocks.filter(b => b.class_id === 1102);
            const sm_blocks = blocks.filter(b => b.class_id === 1107);

            // Build state machine -> layer mapping
            const sm_to_layer: Record<string, string> = {};
            for (const layer of layers) {
                sm_to_layer[layer.state_machine_id] = layer.name;
            }

            // Build state -> layer mapping via state machine child states
            const state_to_layer: Record<string, string> = {};
            for (const sm of sm_blocks) {
                const layer_name = sm_to_layer[sm.file_id] || 'Unknown';
                const child_re = /m_State:\s*\{fileID:\s*(-?\d+)/g;
                let cm: RegExpExecArray | null;
                while ((cm = child_re.exec(sm.raw)) !== null) {
                    state_to_layer[cm[1]] = layer_name;
                }
            }

            const animCache = load_guid_cache_for_file(file, options.project);

            // Check if we should hint about missing GUID cache
            const has_motion_refs = state_blocks.some(sb => {
                const motion_line = sb.raw.split(/\r?\n/).find((l: string) => l.trimStart().startsWith('m_Motion:'));
                if (!motion_line) return false;
                const ref = parse_inline_ref(motion_line);
                return ref && ref.guid;
            });
            const needs_setup_hint = !animCache && has_motion_refs;

            const states: State[] = state_blocks.map(sb => {
                const name = yaml_field(sb.raw, 'm_Name') || '';
                const speed = parseFloat(yaml_field(sb.raw, 'm_Speed') || '1');
                const motion_line = sb.raw.split(/\r?\n/).find(l => l.trimStart().startsWith('m_Motion:'));
                const motion_ref = motion_line ? parse_inline_ref(motion_line) : null;
                return {
                    file_id: sb.file_id,
                    name,
                    speed,
                    motion_ref: motion_ref?.guid || null,
                    layer: state_to_layer[sb.file_id] || 'Unknown',
                };
            });

            // Parse transitions
            interface Transition {
                file_id: string;
                conditions: { parameter: string; mode: string; threshold: number }[];
                duration: number;
                offset: number;
                destination_state_id: string;
                source_state_id: string;
                exit_time: number;
                has_exit_time: boolean;
            }
            const transition_blocks = blocks.filter(b => b.class_id === 1101);

            // Build reverse map: transition fileID -> source state fileID
            const transition_to_source: Record<string, string> = {};
            for (const sb of state_blocks) {
                const t_re = /m_Transitions:[ \t]*\n((?:[ \t]*-[^\n]*(?:\n|$))*)/;
                const t_match = t_re.exec(sb.raw);
                if (t_match) {
                    const ref_re = /\{fileID:[ \t]*(-?\d+)/g;
                    let rm: RegExpExecArray | null;
                    while ((rm = ref_re.exec(t_match[1])) !== null) {
                        transition_to_source[rm[1]] = sb.file_id;
                    }
                }
            }
            const transitions: Transition[] = transition_blocks.map(tb => {
                const t_lines = tb.raw.split(/\r?\n/);
                const conditions: Transition['conditions'] = [];
                let in_conditions = false;
                for (const tl of t_lines) {
                    const tt = tl.trimStart();
                    if (tt.startsWith('m_Conditions:')) { in_conditions = !tt.endsWith('[]'); continue; }
                    if (in_conditions && tt.startsWith('- m_ConditionMode:')) {
                        const mode = parseInt(tt.split(':')[1].trim(), 10);
                        const param_line = t_lines[t_lines.indexOf(tl) + 1]?.trimStart() || '';
                        const thresh_line = t_lines[t_lines.indexOf(tl) + 2]?.trimStart() || '';
                        conditions.push({
                            mode: ANIMATOR_CONDITION_MODES[mode] || String(mode),
                            parameter: param_line.includes('m_ConditionEvent:') ? param_line.split(':')[1].trim() : '',
                            threshold: parseFloat(thresh_line.includes('m_EventTreshold:') ? thresh_line.split(':')[1].trim() : '0'),
                        });
                    }
                    if (in_conditions && !tt.startsWith('-') && !tt.startsWith('m_Condition')) in_conditions = false;
                }
                const dst_line = t_lines.find(l => l.trimStart().startsWith('m_DstState:'));
                const dst_ref = dst_line ? parse_inline_ref(dst_line) : null;
                return {
                    file_id: tb.file_id,
                    conditions,
                    duration: parseFloat(yaml_field(tb.raw, 'm_TransitionDuration') || '0'),
                    offset: parseFloat(yaml_field(tb.raw, 'm_TransitionOffset') || '0'),
                    destination_state_id: dst_ref?.fileID || '',
                    source_state_id: transition_to_source[tb.file_id] || '',
                    exit_time: parseFloat(yaml_field(tb.raw, 'm_ExitTime') || '1'),
                    has_exit_time: yaml_field(tb.raw, 'm_HasExitTime') !== '0',
                };
            });

            // Output
            if (options.parameters) {
                console.log(JSON.stringify({ file, parameters: params }, null, 2));
                return;
            }
            if (options.states) {
                const by_layer: Record<string, { name: string; speed: number; motion_guid: string | null; motion_path: string | null }[]> = {};
                for (const s of states) {
                    if (!by_layer[s.layer]) by_layer[s.layer] = [];
                    by_layer[s.layer].push({
                        name: s.name, speed: s.speed, motion_guid: s.motion_ref,
                        motion_path: s.motion_ref ? animCache?.resolve(s.motion_ref) ?? null : null,
                    });
                }
                const states_out: Record<string, unknown> = { file, states_by_layer: by_layer };
                if (needs_setup_hint) states_out._hint = "Run 'setup <project>' to resolve motion paths";
                console.log(JSON.stringify(states_out, null, 2));
                return;
            }
            if (options.transitions) {
                // Resolve state names
                const state_names: Record<string, string> = {};
                for (const s of states) state_names[s.file_id] = s.name;
                const resolved = transitions.map(t => ({
                    ...t,
                    source_state: state_names[t.source_state_id] || t.source_state_id,
                    destination_state: state_names[t.destination_state_id] || t.destination_state_id,
                }));
                console.log(JSON.stringify({ file, transitions: resolved }, null, 2));
                return;
            }
            if (options.summary) {
                console.log(JSON.stringify({
                    file,
                    name: yaml_field(controller_block.raw, 'm_Name') || basename(file),
                    parameter_count: params.length,
                    layer_count: layers.length,
                    state_count: states.length,
                    transition_count: transitions.length,
                }, null, 2));
                return;
            }

            // Build state name map for default output
            const default_state_names: Record<string, string> = {};
            for (const s of states) default_state_names[s.file_id] = s.name;

            const default_out: Record<string, unknown> = {
                file,
                name: yaml_field(controller_block.raw, 'm_Name') || basename(file),
                parameters: params,
                layers: layers.map(l => l.name),
                states: states.map(s => ({
                    name: s.name, layer: s.layer, speed: s.speed,
                    motion_guid: s.motion_ref,
                    motion_path: s.motion_ref ? animCache?.resolve(s.motion_ref) ?? null : null,
                })),
                transitions: transitions.map(t => ({
                    from: default_state_names[t.source_state_id] || t.source_state_id,
                    to: default_state_names[t.destination_state_id] || t.destination_state_id,
                    has_exit_time: t.has_exit_time,
                })),
            };
            if (needs_setup_hint) default_out._hint = "Run 'setup <project>' to resolve motion paths";
            console.log(JSON.stringify(default_out, null, 2));
        });

    // ========== P6.2: Reverse dependency lookup ==========
    cmd.command('dependents <project_path> <guid>')
        .description('Find which files reference a given GUID (reverse dependency lookup)')
        .option('--type <type>', 'Filter to specific file types (scene, prefab, mat, etc.)')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, guid, options) => {
            if (!/^[0-9a-f]{32}$/i.test(guid)) {
                console.log(JSON.stringify({ error: 'GUID must be a 32-character hexadecimal string' }, null, 2));
                process.exit(1);
            }
            const assetsDir = join(resolve(project_path), 'Assets');
            if (!existsSync(assetsDir)) {
                console.log(JSON.stringify({ error: `Assets directory not found in "${project_path}"` }, null, 2));
                process.exit(1);
            }

            // Walk all YAML-like files
            const scan_extensions = new Set([
                '.unity', '.prefab', '.asset', '.mat', '.anim', '.controller',
                '.overrideController', '.mask', '.mixer', '.lighting', '.preset',
                '.signal', '.playable', '.renderTexture', '.flare', '.guiskin',
                '.terrainlayer', '.cubemap',
            ]);
            const files = walk_files(assetsDir, scan_extensions);

            const referencing: { path: string; type: string }[] = [];
            const guid_pattern = `guid: ${guid}`;

            for (const f of files) {
                try {
                    const fc = readFileSync(f, 'utf-8');
                    if (fc.includes(guid_pattern)) {
                        const rel = relative(resolve(project_path), f);
                        const ftype = categorize_asset(f);
                        referencing.push({ path: rel, type: ftype });
                    }
                } catch { continue; }
            }

            let filtered = referencing;
            if (options.type) {
                filtered = referencing.filter(r => r.type === options.type);
            }

            // Group by type
            const by_type: Record<string, string[]> = {};
            for (const r of filtered) {
                if (!by_type[r.type]) by_type[r.type] = [];
                by_type[r.type].push(r.path);
            }

            console.log(JSON.stringify({
                project_path: resolve(project_path),
                guid,
                total_references: filtered.length,
                by_type,
            }, null, 2));
        });

    // ========== P6.3: Unused asset detection ==========
    cmd.command('unused <project_path>')
        .description('Find potentially unused assets (zero inbound GUID references)')
        .option('--type <type>', 'Filter to specific asset types')
        .option('--ignore <glob>', 'Exclude paths matching this pattern')
        .option('--max <n>', 'Maximum results to return (default 200)', '200')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, options) => {
            const resolvedProject = resolve(project_path);
            const assetsDir = join(resolvedProject, 'Assets');
            if (!existsSync(assetsDir)) {
                console.log(JSON.stringify({ error: `Assets directory not found in "${project_path}"` }, null, 2));
                process.exit(1);
            }

            // Load GUID cache
            const guidCacheObj = load_guid_cache(resolvedProject);
            if (!guidCacheObj) {
                console.log(JSON.stringify({ error: 'GUID cache not found. Run "setup" first.' }, null, 2));
                process.exit(1);
            }
            const guidCache = guidCacheObj.cache;

            // Build set of all GUIDs referenced in project files
            const scan_extensions = new Set([
                '.unity', '.prefab', '.asset', '.mat', '.anim', '.controller',
                '.overrideController', '.mask', '.mixer', '.lighting', '.preset',
            ]);
            const files = walk_files(assetsDir, scan_extensions);
            const referenced_guids = new Set<string>();
            const guid_re = /guid:\s*([a-f0-9]{32})/g;

            for (const f of files) {
                try {
                    const fc = readFileSync(f, 'utf-8');
                    let gm: RegExpExecArray | null;
                    while ((gm = guid_re.exec(fc)) !== null) {
                        referenced_guids.add(gm[1]);
                    }
                } catch { continue; }
            }

            // Also scan .meta files in build settings scenes
            const buildSettingsPath = join(resolvedProject, 'ProjectSettings', 'EditorBuildSettings.asset');
            const build_scene_guids = new Set<string>();
            if (existsSync(buildSettingsPath)) {
                const bsc = readFileSync(buildSettingsPath, 'utf-8');
                let bm: RegExpExecArray | null;
                while ((bm = guid_re.exec(bsc)) !== null) {
                    build_scene_guids.add(bm[1]);
                }
            }

            // Find unreferenced assets
            interface UnusedAsset { guid: string; path: string; type: string }
            const unused: UnusedAsset[] = [];
            const ignore_pattern = options.ignore ? path_glob_to_regex(options.ignore as string) : null;

            for (const [guid_val, asset_path] of Object.entries(guidCache)) {
                // Skip if referenced
                if (referenced_guids.has(guid_val)) continue;
                // Skip build settings scenes
                if (build_scene_guids.has(guid_val)) continue;
                // Skip Resources/ folder (auto-loaded at runtime)
                if (asset_path.includes('Resources/') || asset_path.includes('Resources\\')) continue;
                // Skip StreamingAssets/
                if (asset_path.includes('StreamingAssets/') || asset_path.includes('StreamingAssets\\')) continue;
                // Skip Editor/ scripts
                if (asset_path.includes('/Editor/') || asset_path.includes('\\Editor\\')) continue;
                // Apply ignore filter
                if (ignore_pattern && ignore_pattern.test(asset_path)) continue;
                // Skip bare directories (no file extension)
                if (extname(asset_path) === '') continue;

                const asset_type = categorize_asset(asset_path);
                if (options.type && asset_type !== options.type) continue;

                unused.push({ guid: guid_val, path: asset_path, type: asset_type });
            }

            // Sort by type then path
            unused.sort((a, b) => a.type.localeCompare(b.type) || a.path.localeCompare(b.path));

            const maxResults = parseInt(options.max as string, 10) || 200;

            // Group by type, then apply --max as per-type limit so small values
            // don't cause later categories to disappear entirely
            const by_type: Record<string, string[]> = {};
            for (const u of unused) {
                if (!by_type[u.type]) by_type[u.type] = [];
                by_type[u.type].push(u.path);
            }
            let truncated = false;
            for (const type of Object.keys(by_type)) {
                if (by_type[type].length > maxResults) {
                    by_type[type] = by_type[type].slice(0, maxResults);
                    truncated = true;
                }
            }

            console.log(JSON.stringify({
                project_path: resolvedProject,
                total_assets: Object.keys(guidCache).length,
                referenced: referenced_guids.size,
                potentially_unused: unused.length,
                truncated,
                by_type,
            }, null, 2));
        });

    // ========== Package manifest reading ==========
    cmd.command('manifest <project_path>')
        .description('List packages from Packages/manifest.json')
        .option('--search <pattern>', 'Filter packages by name pattern')
        .option('-j, --json', 'Output as JSON')
        .action((project_path, options) => {
            const result = list_packages(project_path, options.search);
            if ('error' in result) {
                console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            console.log(JSON.stringify({ success: true, ...result }, null, 2));
        });

    // ========== Input Actions reading ==========
    cmd.command('input-actions <file>')
        .description('Read a Unity Input Actions file (.inputactions)')
        .option('--summary', 'Show map count, action count, binding count, scheme count')
        .option('--maps', 'List action maps only')
        .option('--actions', 'List all actions grouped by map')
        .option('--bindings', 'List all bindings grouped by action')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            if (!file.endsWith('.inputactions')) {
                console.log(JSON.stringify({ success: false, error: `File is not an Input Actions file (.inputactions): ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }
            const data = load_input_actions(file);
            if ('error' in data) {
                console.log(JSON.stringify({ success: false, error: data.error }, null, 2));
                process.exitCode = 1;
                return;
            }
            const ia = data as InputActionsFile;

            if (options.summary) {
                const total_actions = ia.maps.reduce((sum, m) => sum + m.actions.length, 0);
                const total_bindings = ia.maps.reduce((sum, m) => sum + m.bindings.length, 0);
                console.log(JSON.stringify({
                    file,
                    name: ia.name,
                    map_count: ia.maps.length,
                    action_count: total_actions,
                    binding_count: total_bindings,
                    control_scheme_count: ia.controlSchemes.length,
                }, null, 2));
                return;
            }

            if (options.maps) {
                console.log(JSON.stringify({
                    file,
                    maps: ia.maps.map(m => ({ name: m.name, action_count: m.actions.length, binding_count: m.bindings.length })),
                }, null, 2));
                return;
            }

            if (options.actions) {
                const by_map: Record<string, { name: string; type: string; expectedControlType: string }[]> = {};
                for (const m of ia.maps) {
                    by_map[m.name] = m.actions.map(a => ({ name: a.name, type: a.type, expectedControlType: a.expectedControlType }));
                }
                console.log(JSON.stringify({ file, actions_by_map: by_map }, null, 2));
                return;
            }

            if (options.bindings) {
                const by_map: Record<string, Record<string, { path: string; groups: string }[]>> = {};
                for (const m of ia.maps) {
                    by_map[m.name] = {};
                    for (const b of m.bindings) {
                        const action_name = b.action;
                        if (!by_map[m.name][action_name]) by_map[m.name][action_name] = [];
                        by_map[m.name][action_name].push({ path: b.path, groups: b.groups });
                    }
                }
                console.log(JSON.stringify({ file, bindings_by_map: by_map }, null, 2));
                return;
            }

            // Full output
            console.log(JSON.stringify({ file, ...ia }, null, 2));
        });

    // Redirect: "read prefab" -> explain to use "read scene"
    cmd.command('prefab')
        .argument('[file]')
        .allowUnknownOption()
        .action(() => {
            console.log(JSON.stringify({
                success: false,
                error: '"read prefab" does not exist. Use "read scene" -- it handles both .unity and .prefab files.',
                correct_usage: 'unity-agentic-tools read scene <file.prefab>',
            }, null, 2));
            process.exitCode = 1;
        });

    return cmd;
}
