import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, resolve, dirname } from 'path';
import type { UnityScanner } from './scanner';
import { editComponentByFileId } from './editor';
import { edit_settings, edit_layer } from './settings';
import { resolve_project_path } from './utils';
import { to_cli_output } from './cli-output';

export function build_update_command(getScanner: () => UnityScanner): Command {
    const cmd = new Command('update')
        .description('Update existing Unity asset and project property values without requiring the editor bridge');

    cmd.command('scriptable-object <file> <property> <value>')
        .description('Edit a property in a .asset file (first object, or specify --file-id)')
        .option('--file-id <id>', 'Target a specific block by file ID instead of the first object')
        .action((file, property, value, options) => {
            if (!file.endsWith('.asset')) {
                console.log(JSON.stringify({ success: false, error: `File is not a ScriptableObject (.asset): ${file}` }, null, 2));
                process.exitCode = 1;
                return;
            }
            let targetFileId: string;
            if (options.fileId) {
                targetFileId = options.fileId;
            } else {
                const objects = getScanner().read_asset(file);
                const target = objects[0];
                if (!target) {
                    console.log(JSON.stringify({ success: false, error: 'No objects found in asset file.' }, null, 2));
                    process.exit(1);
                }
                targetFileId = target.file_id;
            }
            const result = editComponentByFileId({
                file_path: file,
                file_id: targetFileId,
                property,
                new_value: value,
            });

            // Rewrite generic component error to contextually appropriate message
            if (!result.success && result.error) {
                result.error = result.error
                    .replace(/Component with file ID/g, 'Object with file ID')
                    .replace(/component \d+/g, (m) => m.replace('component', 'object'));
            }

            console.log(JSON.stringify(to_cli_output(result as unknown as Record<string, unknown>, { drop_keys: ['file_path'] }), null, 2));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('settings')
        .description('Edit a property in any ProjectSettings/*.asset file')
        .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
        .option('-s, --setting <name>', 'Setting name or alias')
        .option('--property <name>', 'Property name to edit')
        .option('--value <value>', 'New value')
        .action((options) => {
            if (!options.setting || !options.property || !options.value) {
                console.log(JSON.stringify({ success: false, error: 'Required: --setting, --property, --value' }, null, 2));
                process.exit(1);
            }

            const resolvedProjectPath = resolve_project_path(options.project);
            const result = edit_settings({
                project_path: resolvedProjectPath,
                setting: options.setting,
                property: options.property,
                value: options.value,
            });

            console.log(JSON.stringify(
                to_cli_output(result as unknown as Record<string, unknown>, { drop_keys: ['project_path', 'file_path'] }),
                null,
                2
            ));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('layer <index> <name>')
        .description('Set a named layer at a specific index (3-31)')
        .option('-p, --project <path>', 'Unity project path (defaults to cwd)')
        .action((index, name, options) => {
            const resolvedProjectPath = resolve_project_path(options.project);
            const result = edit_layer({
                project_path: resolvedProjectPath,
                index: parseInt(index, 10),
                name,
            });

            console.log(JSON.stringify(
                to_cli_output(result as unknown as Record<string, unknown>, { drop_keys: ['project_path', 'file_path'] }),
                null,
                2
            ));
            if (!result.success) process.exitCode = 1;
        });

    cmd.command('material <file>')
        .description('Edit existing Unity Material property values (.mat file)')
        .option('--set <property=value>', 'Set a float property (e.g., _Metallic=0.8)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--set-color <property=r,g,b,a>', 'Set a color property (e.g., _Color=1,0,0,1)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--set-texture <property=guid>', 'Set a texture property GUID (e.g., _MainTex=abc123)')
        .option('--shader <guid>', 'Change shader reference GUID')
        .configureOutput({
            writeErr: (str: string) => {
                if (str.includes('too many arguments')) {
                    console.error(str.trim());
                    console.error('Hint: Use --set-color property=r,g,b,a (single arg with =). Example: --set-color _Color=1,0,0,1');
                } else {
                    console.error(str);
                }
            }
        })
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }
            let content = readFileSync(file, 'utf-8');
            const changes: string[] = [];

            // --shader: replace m_Shader GUID
            if (options.shader) {
                const guid = options.shader as string;
                if (!/^[a-f0-9]{32}$/.test(guid)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid shader GUID "${guid}". Must be a 32-character hex string` }, null, 2));
                    process.exit(1);
                }
                content = content.replace(
                    /(m_Shader:\s*\{[^}]*guid:\s*)[a-f0-9]+/,
                    `$1${guid}`
                );
                changes.push(`shader -> ${guid}`);
            }

            // --set: float/object properties in m_Floats or m_Colors sections
            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                // Check for undefined (no = found) rather than empty string — empty is valid (reset/clear)
                if (val === undefined) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const escaped_prop = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Try matching numeric value first, then object value {…}
                const float_re = new RegExp(`(- ${escaped_prop}:\\s*)[\\d.e+-]+`);
                const obj_re = new RegExp(`(- ${escaped_prop}:\\s*)\\{[^}]*\\}`);
                if (float_re.test(content)) {
                    content = content.replace(float_re, `$1${val}`);
                    changes.push(`${prop} -> ${val}`);
                } else if (obj_re.test(content)) {
                    content = content.replace(obj_re, `$1${val}`);
                    changes.push(`${prop} -> ${val}`);
                } else {
                    changes.push(`${prop}: not found (skipped)`);
                }
            }

            // --set-color: color properties in m_Colors section
            for (const entry of (options.setColor as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set-color format: "${entry}". Use property=r,g,b,a` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const parts = entry.slice(eq + 1).split(',').map(Number);
                if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) {
                    console.log(JSON.stringify({ success: false, error: `Invalid color format for "${prop}". Use r,g,b,a (e.g., 1,0,0,1)` }, null, 2));
                    process.exit(1);
                }
                const re = new RegExp(`(- ${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*)\{[^}]*\}`);
                if (re.test(content)) {
                    content = content.replace(re, `$1{r: ${parts[0]}, g: ${parts[1]}, b: ${parts[2]}, a: ${parts[3]}}`);
                    changes.push(`${prop} -> {r: ${parts[0]}, g: ${parts[1]}, b: ${parts[2]}, a: ${parts[3]}}`);
                } else {
                    changes.push(`${prop}: not found (skipped)`);
                }
            }

            // --set-texture: texture GUID in m_TexEnvs section
            if (options.setTexture) {
                const eq = (options.setTexture as string).indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: 'Invalid --set-texture format. Use property=guid' }, null, 2)); process.exit(1); }
                const prop = (options.setTexture as string).slice(0, eq);
                const guid = (options.setTexture as string).slice(eq + 1);
                if (!/^[a-f0-9]{32}$/.test(guid)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid texture GUID "${guid}". Must be a 32-character hex string` }, null, 2));
                    process.exit(1);
                }
                // Find the texture entry and replace its guid
                const tex_section_re = new RegExp(`(- ${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[\\s\\S]*?m_Texture:\\s*\\{[^}]*guid:\\s*)[a-f0-9]+`);
                if (tex_section_re.test(content)) {
                    content = content.replace(tex_section_re, `$1${guid}`);
                    changes.push(`${prop} texture -> ${guid}`);
                } else {
                    changes.push(`${prop} texture: not found (skipped)`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set, --set-color, --set-texture, or --shader' }, null, 2));
                process.exit(1);
            }

            // Check if any real modifications were made (vs all skipped)
            const has_real_changes = changes.some(c => !c.includes('(skipped)'));
            if (!has_real_changes) {
                console.log(JSON.stringify({ success: false, changes, error: 'No properties were modified (all targets not found)' }, null, 2));
                process.exitCode = 1;
                return;
            }

            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ changes }, null, 2));
        });

    cmd.command('meta [file]')
        .description('Edit existing Unity .meta importer settings')
        .option('--set <key=value>', 'Set an importer setting (e.g., isReadable=1)', (v: string, p: string[]) => [...p, v], [] as string[])
        .option('--max-size <n>', 'Set TextureImporter maxTextureSize')
        .option('--compression <type>', 'Set textureCompression (0=None, 1=LowQuality, 2=Normal, 3=HighQuality)')
        .option('--filter-mode <mode>', 'Set filterMode (0=Point, 1=Bilinear, 2=Trilinear)')
        .option('--read-write', 'Enable isReadable')
        .option('--no-read-write', 'Disable isReadable')
        .option('--batch <glob>', 'Apply to all matching files')
        .option('--dry-run', 'Preview changes without writing')
        .action((file, options) => {
            if (!file && !options.batch) {
                console.log(JSON.stringify({ success: false, error: 'Provide a file path or use --batch <glob>' }, null, 2));
                process.exit(1);
            }
            const metaPath = file ? (file.endsWith('.meta') ? file : `${file}.meta`) : '';
            // Build key-value edits from options
            const edits: Array<{ key: string; value: string }> = [];

            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use key=value` }, null, 2)); process.exit(1); }
                edits.push({ key: entry.slice(0, eq), value: entry.slice(eq + 1) });
            }
            if (options.maxSize) {
                const size = parseInt(options.maxSize as string, 10);
                if (isNaN(size) || size < 1) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --max-size value "${options.maxSize}". Must be a positive integer (e.g., 512, 1024, 2048)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'maxTextureSize', value: String(size) });
            }
            if (options.compression !== undefined && options.compression !== false) {
                const valid_compression = ['0', '1', '2', '3'];
                const cv = String(options.compression);
                if (!valid_compression.includes(cv)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --compression value "${options.compression}". Valid values: 0 (None), 1 (LowQuality), 2 (Normal), 3 (HighQuality)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'textureCompression', value: cv });
            }
            if (options.filterMode !== undefined && options.filterMode !== false) {
                const valid_filter = ['0', '1', '2'];
                const fv = String(options.filterMode);
                if (!valid_filter.includes(fv)) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --filter-mode value "${options.filterMode}". Valid values: 0 (Point), 1 (Bilinear), 2 (Trilinear)` }, null, 2));
                    process.exit(1);
                }
                edits.push({ key: 'filterMode', value: fv });
            }
            if (options.readWrite === true) edits.push({ key: 'isReadable', value: '1' });
            if (options.readWrite === false) edits.push({ key: 'isReadable', value: '0' });

            if (edits.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No edits specified. Use --set, --max-size, --compression, --filter-mode, or --read-write' }, null, 2));
                process.exit(1);
            }

            // Handle batch mode (P4.3)
            if (options.batch) {
                const glob_pattern = options.batch as string;
                const pattern = glob_pattern.endsWith('.meta') ? glob_pattern : `${glob_pattern}.meta`;
                // Simple glob: split at last '/' before glob chars, scan dir for matching suffix
                const first_glob = pattern.search(/[*?[\]{}]/);
                const dir_part = first_glob >= 0 ? pattern.slice(0, pattern.lastIndexOf('/', first_glob)) : dirname(pattern);
                const dir = resolve(dir_part);
                const suffix = basename(pattern).replace(/^\*+/, '');
                const meta_files: string[] = [];
                const scan = (d: string): void => {
                    for (const entry of readdirSync(d)) {
                        const full = join(d, entry);
                        if (statSync(full).isDirectory()) {
                            if (pattern.includes('**')) scan(full);
                        } else if (entry.endsWith(suffix)) {
                            meta_files.push(full);
                        }
                    }
                };
                if (existsSync(dir)) scan(dir);
                if (meta_files.length === 0) {
                    console.log(JSON.stringify({ success: false, error: `No files matched pattern: ${glob_pattern}` }, null, 2));
                    process.exit(1);
                }

                const results: { file: string; changes: string[] }[] = [];
                for (const mf of meta_files) {
                    let mc = readFileSync(mf, 'utf-8');
                    const file_changes: string[] = [];
                    for (const edit of edits) {
                        const re = new RegExp(`^(\\s*${edit.key}:)[ \\t]*.*$`, 'm');
                        if (re.test(mc)) {
                            mc = mc.replace(re, `$1 ${edit.value}`);
                            file_changes.push(`${edit.key} -> ${edit.value}`);
                        }
                    }
                    if (file_changes.length > 0) {
                        if (!options.dryRun) writeFileSync(mf, mc, 'utf-8');
                        results.push({ file: mf, changes: file_changes });
                    }
                }

                console.log(JSON.stringify({
                    dry_run: !!options.dryRun,
                    files_matched: meta_files.length,
                    files_modified: results.length,
                    results,
                }, null, 2));
                return;
            }

            if (!existsSync(metaPath)) {
                console.log(JSON.stringify({ success: false, error: `Meta file not found: ${metaPath}` }, null, 2));
                process.exit(1);
            }

            let content = readFileSync(metaPath, 'utf-8');
            const changes: string[] = [];

            for (const edit of edits) {
                // Match "  key: value" at any indentation level
                // Use [ \t]* (not \s*) to avoid matching newlines in multiline mode
                const re = new RegExp(`^(\\s*${edit.key}:)[ \\t]*.*$`, 'm');
                if (re.test(content)) {
                    content = content.replace(re, `$1 ${edit.value}`);
                    changes.push(`${edit.key} -> ${edit.value}`);
                } else {
                    changes.push(`${edit.key}: not found (skipped)`);
                }
            }

            if (options.dryRun) {
                console.log(JSON.stringify({ dry_run: true, changes }, null, 2));
                return;
            }

            writeFileSync(metaPath, content, 'utf-8');
            console.log(JSON.stringify({ changes }, null, 2));
        });

    cmd.command('animation <file>')
        .description('Edit existing AnimationClip settings')
        .option('--set <property=value>', 'Set a clip property (e.g., wrap-mode=2 for Loop)', (v: string, p: string[]) => [...p, v], [] as string[])
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }
            if (!file.endsWith('.anim')) {
                console.log(JSON.stringify({ success: false, error: `File is not an AnimationClip (.anim): ${file}` }, null, 2));
                process.exit(1);
            }
            let content = readFileSync(file, 'utf-8');
            const changes: string[] = [];

            const property_map: Record<string, string> = {
                'wrap-mode': 'm_WrapMode',
                'sample-rate': 'm_SampleRate',
                'loop-time': 'm_LoopTime',
            };

            for (const entry of (options.set as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) { console.log(JSON.stringify({ success: false, error: `Invalid --set format: "${entry}". Use property=value` }, null, 2)); process.exit(1); }
                const prop = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                const yaml_key = property_map[prop] || prop;
                const re = new RegExp(`^(\\s*${yaml_key}:\\s*).+$`, 'm');
                if (re.test(content)) {
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${yaml_key} -> ${val}`);
                } else {
                    changes.push(`${yaml_key}: not found (skipped)`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set' }, null, 2));
                process.exit(1);
            }

            // Check if all changes were skipped (no real modifications)
            const has_real_anim_changes = changes.some(c => !c.includes('(skipped)'));
            if (!has_real_anim_changes) {
                console.log(JSON.stringify({ success: false, changes, error: 'No properties were modified (all targets not found)' }, null, 2));
                process.exitCode = 1;
                return;
            }

            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ changes }, null, 2));
        });

    cmd.command('animator <file>')
        .description('Edit existing AnimatorController parameter default values')
        .option('--set-default <param=value>', 'Set parameter default value (e.g., Speed=1.5)', (v: string, p: string[]) => [...p, v], [] as string[])
        .action((file, options) => {
            if (!existsSync(file)) {
                console.log(JSON.stringify({ success: false, error: `File not found: ${file}` }, null, 2));
                process.exit(1);
            }

            let content = readFileSync(file, 'utf-8');
            // Normalize line endings for consistent regex matching
            const had_crlf = content.includes('\r\n');
            if (had_crlf) content = content.replace(/\r\n/g, '\n');
            const changes: string[] = [];

            // Find m_AnimatorParameters section in the AnimatorController block
            const ctrl_match = content.match(/^--- !u!91 &(\d+)/m);
            if (!ctrl_match) {
                console.log(JSON.stringify({ success: false, error: 'No AnimatorController block found (class_id 91)' }, null, 2));
                process.exit(1);
            }
            const ctrl_file_id = ctrl_match[1];

            // --set-default
            for (const entry of (options.setDefault as string[])) {
                const eq = entry.indexOf('=');
                if (eq < 0) {
                    console.log(JSON.stringify({ success: false, error: `Invalid --set-default format: "${entry}". Use param=value` }, null, 2));
                    process.exit(1);
                }
                const param_name = entry.slice(0, eq);
                const val = entry.slice(eq + 1);
                const escaped = param_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Find the parameter entry and determine its type
                const param_block_re = new RegExp(`(  - m_Name: ${escaped}\\n    m_Type: (\\d+)\\n)`);
                const block_match = param_block_re.exec(content);
                if (!block_match) {
                    changes.push(`parameter "${param_name}": not found (skipped)`);
                    continue;
                }

                const ptype = parseInt(block_match[2], 10);
                // Update the appropriate default field based on type
                if (ptype === 1) {
                    // Float
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultFloat:\\s*)([\\d.e+-]+)`);
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${param_name} default -> ${val} (float)`);
                } else if (ptype === 3) {
                    // Int
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultInt:\\s*)(\\d+)`);
                    content = content.replace(re, `$1${val}`);
                    changes.push(`${param_name} default -> ${val} (int)`);
                } else if (ptype === 4) {
                    // Bool
                    const bool_val = val === 'true' || val === '1' ? '1' : '0';
                    const re = new RegExp(`(  - m_Name: ${escaped}\\n[\\s\\S]*?m_DefaultBool:\\s*)(\\d+)`);
                    content = content.replace(re, `$1${bool_val}`);
                    changes.push(`${param_name} default -> ${bool_val} (bool)`);
                } else {
                    changes.push(`${param_name}: trigger parameters have no default value (skipped)`);
                }
            }

            if (changes.length === 0) {
                console.log(JSON.stringify({ success: false, error: 'No changes specified. Use --set-default' }, null, 2));
                process.exit(1);
            }

            // Restore original line endings
            if (had_crlf) content = content.replace(/\n/g, '\r\n');
            writeFileSync(file, content, 'utf-8');
            console.log(JSON.stringify({ changes }, null, 2));
        });

    return cmd;
}
