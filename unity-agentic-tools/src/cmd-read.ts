import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { UnityScanner } from './scanner';
import { getNativeExtractCsharpTypes, getNativeExtractDllTypes, getNativeBuildTypeRegistry } from './scanner';
import { read_settings } from './settings';
import { get_build_settings } from './build-settings';
import { UnityDocument } from './editor';

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
    const lines = content.split('\n');
    const result: ParsedMaterial = {
        name: '',
        shader: { guid: null, fileID: null },
        render_queue: null,
        keywords: [],
        textures: [],
        floats: [],
        colors: [],
    };

    // Inline reference pattern: {fileID: 123, guid: abc, type: 3}
    const inline_ref_re = /\{[^}]*fileID:\s*(\d+)[^}]*guid:\s*([a-f0-9]+)[^}]*\}/;
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

        // m_ValidKeywords (newer format: YAML list)
        if (trimmed.startsWith('m_ValidKeywords:')) {
            const inline = trimmed.slice('m_ValidKeywords:'.length).trim();
            if (inline.startsWith('[') && inline.endsWith(']')) {
                const inner = inline.slice(1, -1).trim();
                if (inner.length > 0) {
                    result.keywords = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
                }
            }
            i++;
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
                // Each texture entry starts with "- _TexName:"
                const tex_name_match = ttrimmed.match(/^-\s+(\S+):$/);
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
                // "- _FloatName: 0.5"
                const float_match = fline.match(/^-\s+(\S+):\s+([\d.e+-]+)$/);
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

/** Check if a file is a Unity YAML file by reading its header. */
function validate_unity_yaml(file: string): string | null {
    if (!existsSync(file)) {
        return `File not found: ${file}`;
    }
    try {
        const fd = require('fs').openSync(file, 'r');
        const buf = Buffer.alloc(64);
        require('fs').readSync(fd, buf, 0, 64, 0);
        require('fs').closeSync(fd);
        const header = buf.toString('utf-8');
        if (!header.startsWith('%YAML') || !header.includes('!u!')) {
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
            const maxDepth = isNaN(rawMaxDepth) ? 10 : Math.max(0, Math.min(rawMaxDepth, 50));

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

            if (!file.endsWith('.unity') && result.gameobjects) {
                result.warning = `File "${file}" is not a .unity scene file`;
            }
            if (pageSizeWarning) {
                result.warning = result.warning ? `${result.warning}; ${pageSizeWarning}` : pageSizeWarning;
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
            if (!/^\d+$/.test(object_id)) {
                const matches = getScanner().find_by_name(file, object_id, false);
                if (matches.length > 1) {
                    const ids = matches.map(m => m.fileId).join(', ');
                    console.log(JSON.stringify({ error: `Multiple GameObjects named "${object_id}" found (fileIDs: ${ids}). Use numeric fileID.` }, null, 2));
                    process.exit(1);
                }
            }
            const result = getScanner().inspect({
                file,
                identifier: object_id,
                include_properties: options.properties === true,
                verbose: options.verbose,
            });

            if (!result) {
                const label = /^\d+$/.test(object_id) ? 'fileID' : 'name';
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

    cmd.command('scriptable-object <file>')
        .description('Read a .asset file (ScriptableObject) and show its objects with properties')
        .option('-j, --json', 'Output as JSON')
        .action((file, _options) => {
            const soValidationError = validate_unity_yaml(file);
            if (soValidationError) {
                console.log(JSON.stringify({ error: soValidationError }, null, 2));
                process.exit(1);
            }
            const objects = getScanner().read_asset(file);
            const output = {
                file,
                count: objects.length,
                objects,
            };
            console.log(JSON.stringify(output, null, 2));
        });

    cmd.command('material <file>')
        .description('Read a Unity Material file (.mat) with structured property output')
        .option('--summary', 'Show shader name, property count, texture count only')
        .option('-j, --json', 'Output as JSON')
        .action((file, options) => {
            const matValidationError = validate_unity_yaml(file);
            if (matValidationError) {
                console.log(JSON.stringify({ error: matValidationError }, null, 2));
                process.exit(1);
            }

            const content = readFileSync(file, 'utf-8');
            const mat = parse_material_yaml(content);

            if (!mat.name) {
                console.log(JSON.stringify({ error: `No Material found in "${file}". Is this a .mat file?` }, null, 2));
                process.exit(1);
            }

            if (options.summary) {
                console.log(JSON.stringify({
                    file,
                    name: mat.name,
                    shader_guid: mat.shader.guid || 'unknown',
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
                shader: mat.shader,
                render_queue: mat.render_queue,
                keywords: mat.keywords,
                textures: mat.textures,
                floats: mat.floats,
                colors: mat.colors,
            }, null, 2));
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

                if (/^\d+$/.test(prefab_instance)) {
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
                        const target_match = lines[i].match(/\{fileID:\s*(\d+)/);
                        const property_match = i + 1 < lines.length ? lines[i + 1].match(/propertyPath:\s*(.+)/) : null;
                        const value_match = i + 2 < lines.length ? lines[i + 2].match(/value:\s*(.*)/) : null;
                        const obj_ref_match = i + 3 < lines.length ? lines[i + 3].match(/objectReference:\s*\{fileID:\s*(\d+)/) : null;

                        if (target_match && property_match) {
                            modifications.push({
                                target_file_id: target_match[1],
                                property_path: property_match[1].trim(),
                                value: value_match ? value_match[1].trim() : '',
                                object_reference: obj_ref_match ? obj_ref_match[1] : null,
                            });
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
        .description('Read a single component by fileID')
        .option('-p, --properties', 'Include component raw text')
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
        .option('--namespace <ns>', 'Filter by namespace (case-insensitive substring match)')
        .option('--kind <kind>', 'Filter by kind: class, struct, enum, interface')
        .option('--source <source>', 'Filter by source: assets, packages, dlls, all', 'all')
        .option('--max <n>', 'Maximum results to return', '100')
        .option('-j, --json', 'Output as JSON')
        .action((options) => {
            const buildRegistry = getNativeBuildTypeRegistry();
            if (!buildRegistry) {
                console.log(JSON.stringify({ error: 'Native module not available' }, null, 2));
                process.exit(1);
            }

            const projectPath = resolve(options.project);
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
                types = types.filter(t => t.file_path.startsWith('Assets/') || t.file_path.startsWith('Assets\\'));
            } else if (options.source === 'packages') {
                types = types.filter(t => t.file_path.includes('PackageCache'));
            } else if (options.source === 'dlls') {
                types = types.filter(t => t.file_path.endsWith('.dll'));
            }

            const maxResults = parseInt(options.max, 10) || 100;
            const truncated = types.length > maxResults;
            const displayed = types.slice(0, maxResults);

            console.log(JSON.stringify({
                project: projectPath,
                total: types.length,
                truncated,
                types: displayed,
            }, null, 2));
        });

    return cmd;
}
