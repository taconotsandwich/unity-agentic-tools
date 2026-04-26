/**
 * Shared utilities for reading and editing Unity AnimatorController files.
 */

// ========== Types ==========

export interface AnimatorBlock {
    file_id: string;
    class_id: number;
    type_name: string;
    raw: string;
}

// ========== Parsing ==========

/**
 * Split a multi-document Unity YAML file into typed blocks.
 * Supports negative 64-bit fileIDs (e.g. &-8508701068132362129).
 */
export function split_yaml_blocks(content: string): AnimatorBlock[] {
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

/**
 * Extract a YAML field value from a block's raw text.
 */
export function yaml_field(raw: string, field: string): string | null {
    const re = new RegExp(`^\\s*${field}:\\s*(.*)$`, 'm');
    const m = re.exec(raw);
    return m ? m[1].trim() : null;
}

/**
 * Extract an inline reference {fileID: X, guid: Y} from a string.
 * Supports negative fileIDs.
 */
export function parse_inline_ref(str: string): { fileID: string; guid: string } | null {
    const m = /\{[^}]*fileID:\s*(-?\d+)(?:[^}]*guid:\s*([a-f0-9]+))?/.exec(str);
    return m ? { fileID: m[1], guid: m[2] || '' } : null;
}

// ========== Lookup Helpers ==========

/**
 * Find a state block by its m_Name.
 * Returns the block or null.
 */
export function find_state_by_name(blocks: AnimatorBlock[], name: string): AnimatorBlock | null {
    return blocks.find(b => b.class_id === 1102 && yaml_field(b.raw, 'm_Name') === name) || null;
}

/**
 * Find the state machine block for a given layer.
 * If layer_name is not specified, returns the first state machine.
 */
export function find_state_machine_for_layer(
    blocks: AnimatorBlock[],
    controller_block: AnimatorBlock,
    layer_name?: string
): AnimatorBlock | null {
    const sm_blocks = blocks.filter(b => b.class_id === 1107);
    if (sm_blocks.length === 0) return null;

    if (!layer_name) {
        // Return the first state machine (Base Layer)
        // Parse m_AnimatorLayers to get the first state machine reference
        const lines = controller_block.raw.split(/\r?\n/);
        let in_layers = false;
        for (const line of lines) {
            const t = line.trimStart();
            if (t.startsWith('m_AnimatorLayers:')) {
                in_layers = !t.endsWith('[]');
                continue;
            }
            if (in_layers && t.startsWith('m_StateMachine:')) {
                const ref = parse_inline_ref(t);
                if (ref) {
                    return blocks.find(b => b.file_id === ref.fileID && b.class_id === 1107) || null;
                }
            }
        }
        return sm_blocks[0];
    }

    // Find the layer entry and get its state machine reference
    const lines = controller_block.raw.split(/\r?\n/);
    let in_layers = false;
    let found_layer = false;
    for (const line of lines) {
        const t = line.trimStart();
        if (t.startsWith('m_AnimatorLayers:')) {
            in_layers = !t.endsWith('[]');
            continue;
        }
        if (in_layers) {
            if (t.startsWith('m_Name:') && t.includes(layer_name)) {
                found_layer = true;
                continue;
            }
            if (found_layer && t.startsWith('m_StateMachine:')) {
                const ref = parse_inline_ref(t);
                if (ref) {
                    return blocks.find(b => b.file_id === ref.fileID && b.class_id === 1107) || null;
                }
            }
            // Reset if we hit a new layer entry
            if (found_layer && t.startsWith('- serializedVersion:')) {
                found_layer = false;
            }
        }
    }
    return null;
}

/**
 * Generate a positive fileID suitable for new Unity YAML blocks.
 * Uses large positive integers to avoid collisions with existing IDs.
 */
export function generate_file_id(existing_ids: Set<string>): string {
    let id: string;
    do {
        // Generate a 10-digit positive integer
        const num = Math.floor(Math.random() * 9000000000) + 1000000000;
        id = String(num);
    } while (existing_ids.has(id));
    return id;
}

/**
 * Collect all fileIDs (as strings) from the file content.
 */
export function collect_file_ids(content: string): Set<string> {
    const ids = new Set<string>();
    const matches = content.matchAll(/--- !u!\d+ &(-?\d+)/g);
    for (const m of matches) {
        ids.add(m[1]);
    }
    return ids;
}
