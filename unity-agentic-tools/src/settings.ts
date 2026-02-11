import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { atomicWrite, validate_name } from './utils';
import type {
    ReadSettingsOptions,
    ReadSettingsResult,
    TagManagerData,
    PhysicsData,
    QualitySettingsData,
    TimeSettingsData,
    EditSettingsOptions,
    EditSettingsResult,
    TagEditOptions,
    LayerEditOptions,
    SortingLayerEditOptions,
} from './types';

/** Read a settings file and normalise line-endings so regexes work on Windows. */
function read_setting_file(file_path: string): string {
    return readFileSync(file_path, 'utf-8').replace(/\r\n/g, '\n');
}

/** Map friendly aliases to actual file names (without .asset). */
const SETTING_ALIASES: Record<string, string> = {
    tags: 'TagManager',
    tagmanager: 'TagManager',
    physics: 'DynamicsManager',
    dynamicsmanager: 'DynamicsManager',
    quality: 'QualitySettings',
    qualitysettings: 'QualitySettings',
    time: 'TimeManager',
    timemanager: 'TimeManager',
    input: 'InputManager',
    inputmanager: 'InputManager',
    audio: 'AudioManager',
    audiomanager: 'AudioManager',
    editor: 'EditorSettings',
    editorsettings: 'EditorSettings',
    graphics: 'GraphicsSettings',
    graphicssettings: 'GraphicsSettings',
    physics2d: 'Physics2DSettings',
    physics2dsettings: 'Physics2DSettings',
    player: 'ProjectSettings',
    projectsettings: 'ProjectSettings',
    navmesh: 'NavMeshAreas',
    navmeshareas: 'NavMeshAreas',
};

/**
 * Resolve a setting name to its canonical file name (without .asset).
 */
function resolve_setting_name(setting: string): string {
    const lower = setting.toLowerCase();
    return SETTING_ALIASES[lower] || setting;
}

/**
 * Resolve the full file path for a setting.
 */
function resolve_setting_path(project_path: string, setting: string): string {
    const canonical = resolve_setting_name(setting);
    return path.join(project_path, 'ProjectSettings', `${canonical}.asset`);
}

// ========== Specialized Parsers ==========

function parse_tag_manager(content: string): TagManagerData {
    const tags: string[] = [];
    const layers: { index: number; name: string }[] = [];
    const sorting_layers: { name: string; unique_id: number; locked: number }[] = [];

    // Parse tags section
    const tagsMatch = content.match(/tags:\s*\n((?:\s*-\s*.+\n)*)/);
    if (tagsMatch) {
        const tagLines = tagsMatch[1].matchAll(/^\s*-\s*(.+)$/gm);
        for (const m of tagLines) {
            tags.push(m[1].trim());
        }
    }

    // Parse layers section (32 entries, some may be empty)
    // Stop at m_SortingLayers to avoid bleeding into sorting layers
    const layersMatch = content.match(/layers:\s*\n([\s\S]*?)(?=\s*m_SortingLayers:)/);
    if (layersMatch) {
        const layerLines = layersMatch[1].split('\n').filter(l => l.match(/^\s*-/));
        for (let i = 0; i < layerLines.length; i++) {
            const nameMatch = layerLines[i].match(/^\s*-\s*(.*)$/);
            const name = nameMatch ? nameMatch[1].trim() : '';
            if (name) {
                layers.push({ index: i, name });
            }
        }
    }

    // Parse sorting layers
    const sortingMatch = content.match(/m_SortingLayers:\s*\n([\s\S]*?)(?=\n[^\s]|\n*$)/);
    if (sortingMatch) {
        const entryPattern = /- name:\s*(.+)\n\s*uniqueID:\s*(\d+)\n\s*locked:\s*(\d+)/g;
        let m: RegExpExecArray | null;
        while ((m = entryPattern.exec(sortingMatch[1])) !== null) {
            sorting_layers.push({
                name: m[1].trim(),
                unique_id: parseInt(m[2], 10),
                locked: parseInt(m[3], 10),
            });
        }
    }

    return { tags, layers, sorting_layers };
}

function parse_dynamics_manager(content: string): PhysicsData {
    const parse_vector = (str: string): { x: number; y: number; z: number } => {
        const m = str.match(/\{x:\s*([-\d.]+),\s*y:\s*([-\d.]+),\s*z:\s*([-\d.]+)\}/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : { x: 0, y: 0, z: 0 };
    };

    const get_float = (key: string): number => {
        const m = content.match(new RegExp(`${key}:\\s*([-\\d.]+)`));
        return m ? parseFloat(m[1]) : 0;
    };

    const get_int = (key: string): number => {
        const m = content.match(new RegExp(`${key}:\\s*(\\d+)`));
        return m ? parseInt(m[1], 10) : 0;
    };

    const gravity_match = content.match(/m_Gravity:\s*(\{[^}]+\})/);
    const gravity = gravity_match ? parse_vector(gravity_match[1]) : { x: 0, y: -9.81, z: 0 };

    return {
        gravity,
        default_contact_offset: get_float('m_DefaultContactOffset'),
        default_solver_iterations: get_int('m_DefaultSolverIterations'),
        default_solver_velocity_iterations: get_int('m_DefaultSolverVelocityIterations'),
        bounce_threshold: get_float('m_BounceThreshold'),
        sleep_threshold: get_float('m_SleepThreshold'),
        queries_hit_triggers: get_int('m_QueriesHitTriggers') === 1,
        auto_simulation: get_int('m_AutoSimulation') === 1,
    };
}

function parse_quality_settings(content: string): QualitySettingsData {
    const current_match = content.match(/m_CurrentQuality:\s*(\d+)/);
    const current_quality = current_match ? parseInt(current_match[1], 10) : 0;

    const quality_levels: QualitySettingsData['quality_levels'] = [];

    // Split on quality level entries (each starts with "  - serializedVersion:")
    const levels_section = content.match(/m_QualitySettings:\s*\n([\s\S]*?)(?=\n\s*m_PerPlatformDefaultQuality:|\n*$)/);
    if (levels_section) {
        const entries = levels_section[1].split(/\n\s*-\s*serializedVersion:\s*\d+\n/).filter(s => s.trim());
        for (const entry of entries) {
            const get = (key: string): string => {
                const m = entry.match(new RegExp(`${key}:\\s*(.+)`));
                return m ? m[1].trim() : '';
            };

            const name = get('name');
            if (!name) continue;

            quality_levels.push({
                name,
                pixel_light_count: parseInt(get('pixelLightCount') || '0', 10),
                shadows: parseInt(get('shadows') || '0', 10),
                shadow_resolution: parseInt(get('shadowResolution') || '0', 10),
                shadow_distance: parseFloat(get('shadowDistance') || '0'),
                anti_aliasing: parseInt(get('antiAliasing') || '0', 10),
                vsync_count: parseInt(get('vSyncCount') || '0', 10),
                lod_bias: parseFloat(get('lodBias') || '0'),
            });
        }
    }

    return { current_quality, quality_levels };
}

function parse_time_manager(content: string): TimeSettingsData {
    const get_float = (key: string): number => {
        const m = content.match(new RegExp(`${key}:\\s*([-\\d.]+)`));
        return m ? parseFloat(m[1]) : 0;
    };

    return {
        fixed_timestep: get_float('Fixed Timestep'),
        max_timestep: get_float('Maximum Allowed Timestep'),
        time_scale: get_float('m_TimeScale'),
        max_particle_timestep: get_float('Maximum Particle Timestep'),
    };
}

function parse_generic_asset(content: string): Record<string, any> {
    const result: Record<string, any> = {};

    // Extract simple key: value pairs from the main block
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^\s{2}(\w[\w\s]*\w|\w+):\s*(.+)$/);
        if (match) {
            const key = match[1];
            let value: any = match[2].trim();

            // Try parsing as number
            if (/^-?\d+(\.\d+)?$/.test(value)) {
                value = parseFloat(value);
            } else if (value === '0' || value === '1') {
                // Keep as number
                value = parseInt(value, 10);
            }

            result[key] = value;
        }
    }

    return result;
}

// ========== Read Settings ==========

/**
 * Read Unity project settings from ProjectSettings/*.asset files.
 */
export function read_settings(options: ReadSettingsOptions): ReadSettingsResult {
    const { project_path, setting } = options;
    const file_path = resolve_setting_path(project_path, setting);

    if (!existsSync(file_path)) {
        return {
            success: false,
            project_path,
            setting,
            error: `Settings file not found: ${file_path}`,
        };
    }

    let content: string;
    try {
        content = read_setting_file(file_path);
    } catch (err) {
        return {
            success: false,
            project_path,
            setting,
            error: `Failed to read settings file: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const canonical = resolve_setting_name(setting);

    let data: ReadSettingsResult['data'];
    switch (canonical) {
        case 'TagManager':
            data = parse_tag_manager(content);
            break;
        case 'DynamicsManager':
            data = parse_dynamics_manager(content);
            break;
        case 'QualitySettings':
            data = parse_quality_settings(content);
            break;
        case 'TimeManager':
            data = parse_time_manager(content);
            break;
        default:
            data = parse_generic_asset(content);
            break;
    }

    return {
        success: true,
        project_path,
        setting: canonical,
        file_path,
        data,
    };
}

// ========== Edit Settings ==========

/**
 * Edit a generic property in any ProjectSettings/*.asset file.
 */
export function edit_settings(options: EditSettingsOptions): EditSettingsResult {
    const { project_path, setting, property, value } = options;
    const file_path = resolve_setting_path(project_path, setting);

    if (!existsSync(file_path)) {
        return {
            success: false,
            project_path,
            setting,
            error: `Settings file not found: ${file_path}`,
        };
    }

    let content: string;
    try {
        content = read_setting_file(file_path);
    } catch (err) {
        return {
            success: false,
            project_path,
            setting,
            error: `Failed to read settings file: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Match the property line (with or without m_ prefix, with PascalCase normalization)
    const propPattern = new RegExp(`(^\\s*${property}:\\s*)(.*)$`, 'm');
    if (propPattern.test(content)) {
        content = content.replace(propPattern, `$1${value}`);
    } else {
        // Try with m_ prefix
        const prefixedPattern = new RegExp(`(^\\s*m_${property}:\\s*)(.*)$`, 'm');
        if (prefixedPattern.test(content)) {
            content = content.replace(prefixedPattern, `$1${value}`);
        } else {
            // Try snake_case to PascalCase conversion with m_ prefix
            // e.g., fixed_timestep -> m_FixedTimestep, time_scale -> m_TimeScale
            const pascal = property.replace(/(^|_)([a-z])/g, (_: string, __: string, c: string) => c.toUpperCase());
            const pascalPattern = new RegExp(`(^\\s*m_${pascal}:\\s*)(.*)$`, 'm');
            if (pascalPattern.test(content)) {
                content = content.replace(pascalPattern, `$1${value}`);
            } else {
                // Try with space-separated names (TimeManager uses "Fixed Timestep")
                const spacedName = property.replace(/_/g, ' ').replace(/(^| )([a-z])/g, (_: string, sp: string, c: string) => sp + c.toUpperCase());
                const spacedPattern = new RegExp(`(^\\s*${spacedName}:\\s*)(.*)$`, 'm');
                if (spacedPattern.test(content)) {
                    content = content.replace(spacedPattern, `$1${value}`);
                } else {
                    return {
                        success: false,
                        project_path,
                        setting,
                        error: `Property "${property}" not found in ${setting}`,
                    };
                }
            }
        }
    }

    const result = atomicWrite(file_path, content);
    if (!result.success) {
        return {
            success: false,
            project_path,
            setting,
            error: result.error,
        };
    }

    return {
        success: true,
        project_path,
        setting: resolve_setting_name(setting),
        file_path,
        bytes_written: result.bytes_written,
    };
}

// ========== Tag Editing ==========

/**
 * Add or remove a tag in the TagManager.
 */
export function edit_tag(options: TagEditOptions): EditSettingsResult {
    const { project_path, action, tag } = options;

    if (!tag || !tag.trim()) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: 'Tag name cannot be empty',
        };
    }

    const nameError = validate_name(tag, 'Tag name');
    if (nameError) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: nameError,
        };
    }

    const file_path = resolve_setting_path(project_path, 'TagManager');

    if (!existsSync(file_path)) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `TagManager not found: ${file_path}`,
        };
    }

    let content: string;
    try {
        content = read_setting_file(file_path);
    } catch (err) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    if (action === 'add') {
        // Check for duplicates
        const existing = parse_tag_manager(content);
        if (existing.tags.includes(tag)) {
            return {
                success: false,
                project_path,
                setting: 'TagManager',
                error: `Tag "${tag}" already exists`,
            };
        }

        // Append tag to tags section
        content = content.replace(
            /(tags:\s*\n(?:\s*-\s*.+\n)*)/,
            `$1  - ${tag}\n`
        );
    } else {
        // Remove matching tag line
        const tagPattern = new RegExp(`^\\s*-\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$\\n?`, 'm');
        if (!tagPattern.test(content)) {
            return {
                success: false,
                project_path,
                setting: 'TagManager',
                error: `Tag "${tag}" not found`,
            };
        }
        content = content.replace(tagPattern, '');
    }

    const result = atomicWrite(file_path, content);
    if (!result.success) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: result.error,
        };
    }

    return {
        success: true,
        project_path,
        setting: 'TagManager',
        file_path,
        bytes_written: result.bytes_written,
    };
}

// ========== Layer Editing ==========

/**
 * Set a named layer at a specific index in the TagManager.
 */
export function edit_layer(options: LayerEditOptions): EditSettingsResult {
    const { project_path, index, name } = options;
    const file_path = resolve_setting_path(project_path, 'TagManager');

    if (!existsSync(file_path)) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `TagManager not found: ${file_path}`,
        };
    }

    // Unity locks specific built-in layers that have assigned names.
    // Indices 3, 6, 7 are in the builtin range but unnamed — editable in the Editor.
    // User layers 8-31 are always editable.
    const RESERVED_LAYERS: Record<number, string> = {
        0: 'Default',
        1: 'TransparentFX',
        2: 'Ignore Raycast',
        4: 'Water',
        5: 'UI',
    };
    if (index < 0 || index > 31) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Layer index must be between 0 and 31`,
        };
    }
    if (RESERVED_LAYERS[index]) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Cannot modify reserved layer "${RESERVED_LAYERS[index]}" at index ${index}`,
        };
    }

    let content: string;
    try {
        content = read_setting_file(file_path);
    } catch (err) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    // Find the layers section (stop at m_SortingLayers to avoid bleeding)
    const layersMatch = content.match(/(layers:\s*\n)([\s\S]*?)(?=\s*m_SortingLayers:)/);
    if (!layersMatch) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: 'Could not find layers section in TagManager',
        };
    }

    const layerLines = layersMatch[2].split('\n').filter(l => l.match(/^\s*-/));
    if (index >= layerLines.length) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Layer index ${index} is out of range (file has ${layerLines.length} layers)`,
        };
    }

    // Replace the layer line at the target index
    layerLines[index] = `  - ${name}`;

    // Rebuild the layers section (preserve trailing newline before m_SortingLayers)
    const newLayersSection = layerLines.join('\n') + '\n';
    content = content.replace(layersMatch[2], newLayersSection);

    const result = atomicWrite(file_path, content);
    if (!result.success) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: result.error,
        };
    }

    return {
        success: true,
        project_path,
        setting: 'TagManager',
        file_path,
        bytes_written: result.bytes_written,
    };
}

// ========== Sorting Layer Editing ==========

/**
 * Add or remove a sorting layer in the TagManager.
 */
export function edit_sorting_layer(options: SortingLayerEditOptions): EditSettingsResult {
    const { project_path, action, name } = options;

    if (!name || !name.trim()) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: 'Sorting layer name cannot be empty',
        };
    }

    const file_path = resolve_setting_path(project_path, 'TagManager');

    if (!existsSync(file_path)) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `TagManager not found: ${file_path}`,
        };
    }

    let content: string;
    try {
        content = read_setting_file(file_path);
    } catch (err) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    if (action === 'remove' && name === 'Default') {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: 'Cannot remove the Default sorting layer — it is required by Unity',
        };
    }

    if (action === 'add') {
        // Check for duplicates
        const existing = parse_tag_manager(content);
        if (existing.sorting_layers.some(sl => sl.name === name)) {
            return {
                success: false,
                project_path,
                setting: 'TagManager',
                error: `Sorting layer "${name}" already exists`,
            };
        }

        // Generate a random uniqueID (uint32 range)
        const unique_id = Math.floor(Math.random() * 4294967295);

        // Append sorting layer entry
        const newEntry = `  - name: ${name}\n    uniqueID: ${unique_id}\n    locked: 0\n`;

        // Find end of m_SortingLayers section and append before the next top-level key
        const sortingEnd = content.match(/(m_SortingLayers:\s*\n(?:\s+-\s+name:[\s\S]*?(?=\n[^\s]|\n*$)))/);
        if (sortingEnd) {
            content = content.replace(sortingEnd[1], sortingEnd[1] + newEntry);
        } else {
            // Fallback: append before end of file
            content = content.trimEnd() + '\n' + newEntry;
        }
    } else {
        // Remove the sorting layer entry
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const slPattern = new RegExp(`\\s*-\\s*name:\\s*${escapedName}\\n\\s*uniqueID:\\s*\\d+\\n\\s*locked:\\s*\\d+\\n?`, 'm');

        if (!slPattern.test(content)) {
            return {
                success: false,
                project_path,
                setting: 'TagManager',
                error: `Sorting layer "${name}" not found`,
            };
        }

        content = content.replace(slPattern, '\n');
    }

    const result = atomicWrite(file_path, content);
    if (!result.success) {
        return {
            success: false,
            project_path,
            setting: 'TagManager',
            error: result.error,
        };
    }

    return {
        success: true,
        project_path,
        setting: 'TagManager',
        file_path,
        bytes_written: result.bytes_written,
    };
}
