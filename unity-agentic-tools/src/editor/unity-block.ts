import { get_class_id_name } from '../class-ids';

/**
 * Header components parsed from a Unity YAML block separator line.
 * Format: `--- !u!<class_id> &<file_id> [stripped]`
 */
interface BlockHeader {
    class_id: number;
    file_id: string;
    is_stripped: boolean;
}

/**
 * Regex for the Unity YAML block header line.
 * Captures: class_id, file_id, optional "stripped" suffix.
 */
const HEADER_PATTERN = /^--- !u!(\d+) &(\d+)(\s+stripped)?/;

/**
 * Parse a Unity YAML block header line.
 * Returns null if the line does not match the expected format.
 */
function parse_header(raw: string): BlockHeader | null {
    const first_newline = raw.indexOf('\n');
    const first_line = first_newline === -1 ? raw : raw.slice(0, first_newline);
    const match = first_line.match(HEADER_PATTERN);
    if (!match) return null;
    return {
        class_id: parseInt(match[1], 10),
        file_id: match[2],
        is_stripped: match[3] !== undefined,
    };
}

/**
 * Escape special regex characters in a string.
 */
function escape_regex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A mutable data class wrapping a single `--- !u!N &ID` Unity YAML block.
 *
 * Provides property access (get/set), format detection and preservation,
 * array operations, reference helpers, and dirty tracking.
 */
export class UnityBlock {
    private _raw: string;
    private _header: BlockHeader;
    private _dirty: boolean = false;
    private _format_cache: Map<string, 'inline' | 'block'> = new Map();

    constructor(raw: string) {
        // Normalize CRLF to LF — Unity YAML uses LF natively; git on Windows
        // may convert to CRLF on checkout, which breaks block-style regex parsing.
        const normalized = raw.replace(/\r\n/g, '\n');
        const header = parse_header(normalized);
        if (!header) {
            throw new Error(
                `Invalid Unity YAML block header: "${normalized.slice(0, 80)}"`
            );
        }
        this._raw = normalized;
        this._header = header;
    }

    // ========== Header Properties ==========

    /** The file ID from the block header. Always a string (never parseInt). */
    get file_id(): string {
        return this._header.file_id;
    }

    /** The class ID from the block header. Small number (1-1001), safe as number. */
    get class_id(): number {
        return this._header.class_id;
    }

    /** True if the header contains "stripped". */
    get is_stripped(): boolean {
        return this._header.is_stripped;
    }

    /** Human-readable type name from the class ID. */
    get type_name(): string {
        return get_class_id_name(this._header.class_id);
    }

    /** Full block text including header. */
    get raw(): string {
        return this._raw;
    }

    /** True if the block has been modified since creation. */
    get dirty(): boolean {
        return this._dirty;
    }

    // ========== Property Access ==========

    /**
     * Get a property value from the block.
     *
     * Handles:
     * - Simple paths: "m_Name" -> value after colon
     * - Dotted paths: "m_LocalPosition.x" -> inline {x: 0, y: 0} or block-style nested
     * - Array paths: "m_Materials.Array.data[0]" -> array element
     */
    get_property(path: string): string | null {
        // Array paths: e.g. m_Materials.Array.data[0]
        if (path.includes('Array.data[')) {
            return this._get_array_element(path);
        }

        // Dotted paths: e.g. m_LocalPosition.x or m_Shadows.m_Type
        if (path.includes('.')) {
            const parts = path.split('.');
            const root_prop = parts[0];

            // Try inline object first: m_LocalPosition: {x: 0, y: 1, z: -10}
            const root_pattern = new RegExp(
                `^\\s*${escape_regex(root_prop)}:\\s*(.*)$`,
                'm'
            );
            const root_match = this._raw.match(root_pattern);
            if (root_match) {
                const obj_str = root_match[1].trim();
                const sub_field = parts.slice(1).join('.');
                const sub_pattern = new RegExp(
                    `${escape_regex(sub_field)}:\\s*([^,}]+)`
                );
                const sub_match = obj_str.match(sub_pattern);
                if (sub_match) return sub_match[1].trim();
            }

            // Fall back to block-style nested YAML
            const block_value = this._extract_block_style_value(parts);
            if (block_value !== null) return block_value;

            return null;
        }

        // Simple paths: e.g. m_Name, m_IsActive
        const prop_pattern = new RegExp(
            `^\\s*${escape_regex(path)}:\\s*(.*)$`,
            'm'
        );
        const match = this._raw.match(prop_pattern);
        return match ? match[1].trim() : null;
    }

    /**
     * Set a property value in the block.
     *
     * Handles simple, dotted, and array paths. Preserves the existing
     * format (inline vs block-style) for compound properties.
     *
     * @param path - Property path (simple, dotted, or array)
     * @param value - The new value to set
     * @param object_reference - Optional object reference for prefab override style entries
     * @returns true if the block was modified
     */
    set_property(
        path: string,
        value: string,
        object_reference?: string
    ): boolean {
        const old_raw = this._raw;
        const effective_ref =
            object_reference && object_reference !== '{fileID: 0}'
                ? object_reference
                : undefined;

        // Handle simple paths (no dots, no arrays)
        if (!path.includes('.') && !path.includes('Array')) {
            const prop_pattern = new RegExp(
                `(^\\s*${escape_regex(path)}:\\s*)(.*)$`,
                'm'
            );
            if (prop_pattern.test(this._raw)) {
                const replacement_value = effective_ref ?? value;
                this._raw = this._raw.replace(
                    prop_pattern,
                    `$1${replacement_value}`
                );
            }
            return this._check_dirty(old_raw);
        }

        // Handle dotted paths (e.g. m_LocalPosition.x, m_Shadows.m_Type)
        if (path.includes('.') && !path.includes('Array')) {
            const parts = path.split('.');
            const parent_prop = parts[0];
            const sub_field = parts[1];

            // Inline object: m_LocalPosition: {x: 0, y: 0, z: 0}
            const inline_pattern = new RegExp(
                `(${escape_regex(parent_prop)}:\\s*\\{)([^}]*)(\\})`,
                'm'
            );
            const inline_match = this._raw.match(inline_pattern);
            let inline_applied = false;
            if (inline_match) {
                const fields = inline_match[2];
                const field_pattern = new RegExp(
                    `(${escape_regex(sub_field)}:\\s*)([^,}]+)`
                );
                if (field_pattern.test(fields)) {
                    const updated_fields = fields.replace(
                        field_pattern,
                        `$1${value}`
                    );
                    this._raw = this._raw.replace(
                        inline_pattern,
                        `$1${updated_fields}$3`
                    );
                    inline_applied = true;
                }
            }
            if (!inline_applied) {
                // Block-style nested YAML (or inline match found but sub-field not present)
                const effective_value = effective_ref ?? value;
                const block_result = this._resolve_block_style_path(
                    parts,
                    effective_value
                );
                if (block_result !== null) {
                    this._raw = block_result;
                }
            }

            return this._check_dirty(old_raw);
        }

        // Handle array paths (e.g. m_Materials.Array.data[0])
        if (path.includes('Array.data[')) {
            const array_match = path.match(/^(.+)\.Array\.data\[(\d+)\]$/);
            if (array_match) {
                const array_prop = array_match[1];
                const index = parseInt(array_match[2], 10);
                const ref_value = effective_ref ?? value;

                const array_pattern = new RegExp(
                    `${escape_regex(array_prop)}:\\s*\\n((?:\\s*-\\s*[^\\n]+\\n)*)`,
                    'm'
                );
                const array_block_match = this._raw.match(array_pattern);
                if (array_block_match) {
                    const lines = array_block_match[1]
                        .split('\n')
                        .filter((l) => l.trim().startsWith('-'));
                    if (index < lines.length) {
                        const old_line = lines[index];
                        const new_line = old_line.replace(
                            /-\s*.*/,
                            `- ${ref_value}`
                        );
                        this._raw = this._raw.replace(old_line, new_line);
                    }
                }
            }

            return this._check_dirty(old_raw);
        }

        return false;
    }

    /**
     * Check if a property exists in this block.
     */
    has_property(path: string): boolean {
        return this.get_property(path) !== null;
    }

    // ========== Format Detection ==========

    /**
     * Detect whether a compound property uses inline `{x: 0, y: 0}` or block-style format.
     * Results are cached per property name for subsequent calls.
     */
    detect_format(property_name: string): 'inline' | 'block' {
        const cached = this._format_cache.get(property_name);
        if (cached) return cached;

        const inline_pattern = new RegExp(
            `^\\s*${escape_regex(property_name)}:\\s*\\{[^}]+\\}\\s*$`,
            'm'
        );
        const result: 'inline' | 'block' = inline_pattern.test(this._raw)
            ? 'inline'
            : 'block';
        this._format_cache.set(property_name, result);
        return result;
    }

    // ========== Array Operations ==========

    /**
     * Get the number of elements in an array property.
     *
     * Unity YAML arrays look like:
     * ```yaml
     * m_Children:
     *   - {fileID: 123}
     *   - {fileID: 456}
     * ```
     * Or empty: `m_Children: []`
     */
    get_array_length(array_property: string): number {
        // Check for empty array syntax: `prop: []`
        const empty_pattern = new RegExp(
            `^\\s*${escape_regex(array_property)}:\\s*\\[\\]\\s*$`,
            'm'
        );
        if (empty_pattern.test(this._raw)) return 0;

        // Check for multiline array
        const lines = this._raw.split('\n');
        let in_array = false;
        let array_indent = -1;
        let count = 0;

        for (const line of lines) {
            if (!in_array) {
                const header_match = line.match(
                    new RegExp(
                        `^(\\s*)${escape_regex(array_property)}:\\s*$`
                    )
                );
                if (header_match) {
                    in_array = true;
                    array_indent = header_match[1].length;
                    continue;
                }
            } else {
                const trimmed = line.trim();
                if (trimmed === '') continue;

                const leading_match = line.match(/^(\s*)/);
                const indent = leading_match ? leading_match[1].length : 0;

                // Unity YAML arrays have dashes at the same indent as the property.
                // Break on lines at lower indent, or same-indent non-dash lines.
                if (indent < array_indent) break;
                if (indent === array_indent && !trimmed.startsWith('-')) break;

                if (trimmed.startsWith('-')) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Insert an element into an array property.
     *
     * @param array_property - The array property name (e.g. "m_Children")
     * @param index - The position to insert at. Use -1 to append.
     * @param value - The value to insert (e.g. "{fileID: 789}")
     * @returns true if the block was modified
     */
    insert_array_element(
        array_property: string,
        index: number,
        value: string
    ): boolean {
        const old_raw = this._raw;

        // Handle empty array: `prop: []`
        const empty_pattern = new RegExp(
            `(^(\\s*)${escape_regex(array_property)}:\\s*)\\[\\]`,
            'm'
        );
        const empty_match = this._raw.match(empty_pattern);
        if (empty_match) {
            const base_indent = empty_match[2];
            const element_indent = base_indent + '  ';
            this._raw = this._raw.replace(
                empty_pattern,
                `$1\n${element_indent}- ${value}`
            );
            return this._check_dirty(old_raw);
        }

        // Find the multiline array and its elements
        const lines = this._raw.split('\n');
        let array_header_idx = -1;
        let array_indent = -1;
        const element_indices: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (array_header_idx === -1) {
                const header_match = lines[i].match(
                    new RegExp(
                        `^(\\s*)${escape_regex(array_property)}:\\s*$`
                    )
                );
                if (header_match) {
                    array_header_idx = i;
                    array_indent = header_match[1].length;
                    continue;
                }
            } else {
                const trimmed = lines[i].trim();
                if (trimmed === '') continue;

                const leading_match = lines[i].match(/^(\s*)/);
                const indent = leading_match ? leading_match[1].length : 0;

                if (indent < array_indent) break;
                if (indent === array_indent && !trimmed.startsWith('-')) break;

                if (trimmed.startsWith('-')) {
                    element_indices.push(i);
                }
            }
        }

        if (array_header_idx === -1) return false;

        // Determine the indent for the new element
        let element_indent: string;
        if (element_indices.length > 0) {
            const first_elem = lines[element_indices[0]];
            const indent_match = first_elem.match(/^(\s*)-/);
            element_indent = indent_match ? indent_match[1] : '  ';
        } else {
            element_indent = ' '.repeat(array_indent + 2);
        }

        const new_line = `${element_indent}- ${value}`;

        // Determine insertion position
        let insert_at: number;
        if (index === -1 || index >= element_indices.length) {
            // Append after last element
            insert_at =
                element_indices.length > 0
                    ? element_indices[element_indices.length - 1] + 1
                    : array_header_idx + 1;
        } else {
            insert_at = element_indices[index];
        }

        lines.splice(insert_at, 0, new_line);
        this._raw = lines.join('\n');

        return this._check_dirty(old_raw);
    }

    /**
     * Remove an element from an array property by index.
     *
     * @param array_property - The array property name (e.g. "m_Children")
     * @param index - The 0-based index of the element to remove
     * @returns true if the block was modified
     */
    remove_array_element(array_property: string, index: number): boolean {
        const old_raw = this._raw;

        const lines = this._raw.split('\n');
        let array_header_idx = -1;
        let array_indent = -1;
        const element_indices: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (array_header_idx === -1) {
                const header_match = lines[i].match(
                    new RegExp(
                        `^(\\s*)${escape_regex(array_property)}:\\s*$`
                    )
                );
                if (header_match) {
                    array_header_idx = i;
                    array_indent = header_match[1].length;
                    continue;
                }
            } else {
                const trimmed = lines[i].trim();
                if (trimmed === '') continue;

                const leading_match = lines[i].match(/^(\s*)/);
                const indent = leading_match ? leading_match[1].length : 0;

                if (indent < array_indent) break;
                if (indent === array_indent && !trimmed.startsWith('-')) break;

                if (trimmed.startsWith('-')) {
                    element_indices.push(i);
                }
            }
        }

        if (
            array_header_idx === -1 ||
            index < 0 ||
            index >= element_indices.length
        ) {
            return false;
        }

        lines.splice(element_indices[index], 1);

        // If no elements left, convert to empty array syntax
        if (element_indices.length === 1) {
            const header_indent_match = lines[array_header_idx].match(
                /^(\s*)/
            );
            const header_indent = header_indent_match
                ? header_indent_match[1]
                : '';
            lines[array_header_idx] = `${header_indent}${array_property}: []`;
        }

        this._raw = lines.join('\n');

        return this._check_dirty(old_raw);
    }

    // ========== Reference Helpers ==========

    /**
     * Extract all {fileID: N} values from the block body (excluding fileID: 0).
     * Does NOT include the header file ID.
     */
    extract_file_id_refs(): string[] {
        const refs: string[] = [];
        const pattern = /\{fileID:\s*(\d+)/g;

        // Skip the header line
        const first_newline = this._raw.indexOf('\n');
        const body = first_newline === -1 ? '' : this._raw.slice(first_newline);

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(body)) !== null) {
            if (match[1] !== '0') {
                refs.push(match[1]);
            }
        }
        return refs;
    }

    /**
     * Replace a file ID in both the header AND body of the block.
     * Operates on a single ID pair at a time using string comparison.
     */
    remap_file_id(old_id: string, new_id: string): void {
        // Never remap fileID: 0 -- it is the null reference
        if (old_id === '0') return;

        const old_raw = this._raw;
        const escaped_old = escape_regex(old_id);

        // Remap header: --- !u!<cls> &<old> -> &<new>
        this._raw = this._raw.replace(
            new RegExp(`^(--- !u!\\d+ &)${escaped_old}(\\s|$)`),
            `$1${new_id}$2`
        );

        // Remap all fileID references in body
        this._raw = this._raw.replace(
            new RegExp(`(\\{fileID:\\s*)${escaped_old}(\\})`, 'g'),
            `$1${new_id}$2`
        );

        if (this._raw !== old_raw) {
            this._dirty = true;
            // Update cached header if the file_id changed
            if (this._header.file_id === old_id) {
                this._header = { ...this._header, file_id: new_id };
            }
        }
    }

    // ========== Mutation ==========

    /**
     * Replace the entire block text and mark as dirty.
     * Re-parses the header from the new text.
     */
    replace_raw(new_text: string): void {
        const header = parse_header(new_text);
        if (!header) {
            throw new Error(
                `Invalid Unity YAML block header in replacement text: "${new_text.slice(0, 80)}"`
            );
        }
        this._raw = new_text;
        this._header = header;
        this._dirty = true;
        this._format_cache.clear();
    }

    /**
     * Create an independent deep copy of this block. The clone is NOT dirty.
     */
    clone(): UnityBlock {
        return new UnityBlock(this._raw);
    }

    // ========== Private Helpers ==========

    /**
     * Compare old and new raw text; if changed, set dirty and return true.
     */
    private _check_dirty(old_raw: string): boolean {
        if (this._raw !== old_raw) {
            this._dirty = true;
            return true;
        }
        return false;
    }

    /**
     * Extract a value from an Array.data[N] style path.
     */
    private _get_array_element(path: string): string | null {
        const array_match = path.match(/^(.+)\.Array\.data\[(\d+)\]$/);
        if (!array_match) return null;

        const array_prop = array_match[1];
        const index = parseInt(array_match[2], 10);

        // Find the array section in the block
        const array_pattern = new RegExp(
            `${escape_regex(array_prop)}:\\s*\\n((?:\\s*-\\s*[^\\n]+\\n?)*)`,
            'm'
        );
        const array_block_match = this._raw.match(array_pattern);
        if (!array_block_match) return null;

        const lines = array_block_match[1]
            .split('\n')
            .filter((l) => l.trim().startsWith('-'));

        if (index >= lines.length) return null;

        // Extract the value after the dash
        const element_match = lines[index].match(/^\s*-\s*(.+)$/);
        return element_match ? element_match[1].trim() : null;
    }

    /**
     * Extract a nested value from block-style YAML by walking indentation levels.
     *
     * For a path like ["m_Shadows", "m_Type"], finds:
     *   m_Shadows:
     *     m_Type: 2    <-- returns "2"
     */
    private _extract_block_style_value(parts: string[]): string | null {
        const lines = this._raw.split('\n');
        let search_start = 0;
        let search_end = lines.length;

        // Walk each segment except the last to narrow the search window
        for (let seg = 0; seg < parts.length - 1; seg++) {
            const segment = parts[seg];
            let parent_idx = -1;
            let parent_indent = -1;

            for (let i = search_start; i < search_end; i++) {
                const match = lines[i].match(
                    new RegExp(`^(\\s*)${escape_regex(segment)}:\\s*(.*)$`)
                );
                if (match) {
                    const trailing = match[2].trim();
                    if (trailing === '') {
                        // Pure parent line (e.g. "DirectNested:")
                        parent_idx = i;
                        parent_indent = match[1].length;
                        break;
                    }
                    // Line has content after colon — only treat as block parent
                    // if the next non-empty line is indented further
                    for (let j = i + 1; j < search_end; j++) {
                        if (lines[j].trim() === '') continue;
                        const nextLeading = lines[j].match(/^(\s*)/);
                        if (nextLeading && nextLeading[1].length > match[1].length) {
                            parent_idx = i;
                            parent_indent = match[1].length;
                        }
                        break;
                    }
                    if (parent_idx !== -1) break;
                }
            }

            if (parent_idx === -1) return null;

            // Detect child indent from first non-empty line after parent
            let child_indent = -1;
            for (let i = parent_idx + 1; i < search_end; i++) {
                if (lines[i].trim() === '') continue;
                const leading_spaces = lines[i].match(/^(\s*)/);
                if (leading_spaces) {
                    const indent = leading_spaces[1].length;
                    if (indent > parent_indent) {
                        child_indent = indent;
                        break;
                    }
                }
                break; // non-empty line at same or lower indent = no children
            }

            if (child_indent === -1) return null;

            // Narrow search window to children of this parent
            search_start = parent_idx + 1;
            for (let i = parent_idx + 1; i < search_end; i++) {
                if (lines[i].trim() === '') continue;
                const leading_spaces = lines[i].match(/^(\s*)/);
                if (
                    leading_spaces &&
                    leading_spaces[1].length < child_indent
                ) {
                    search_end = i;
                    break;
                }
            }
        }

        // Find the final property within the narrowed window
        const final_prop = parts[parts.length - 1];
        for (let i = search_start; i < search_end; i++) {
            const match = lines[i].match(
                new RegExp(
                    `^\\s*${escape_regex(final_prop)}:\\s*(.+)$`
                )
            );
            if (match) {
                return match[1].trim();
            }
        }

        return null;
    }

    /**
     * Resolve and replace a nested property value in block-style YAML.
     *
     * For a path like ["m_Shadows", "m_Type"] with value "1", finds:
     *   m_Shadows:
     *     m_Type: 2    <-- replaces "2" with "1"
     *
     * Returns the modified full block text, or null if the path wasn't found.
     */
    private _resolve_block_style_path(
        segments: string[],
        value: string
    ): string | null {
        const lines = this._raw.split('\n');
        let search_start = 0;
        let search_end = lines.length;

        // Walk each segment except the last to narrow the search window
        for (let seg = 0; seg < segments.length - 1; seg++) {
            const segment = segments[seg];
            let parent_idx = -1;
            let parent_indent = -1;

            for (let i = search_start; i < search_end; i++) {
                const match = lines[i].match(
                    new RegExp(
                        `^(\\s*)${escape_regex(segment)}:\\s*(.*)$`
                    )
                );
                if (match) {
                    const trailing = match[2].trim();
                    if (trailing === '') {
                        // Pure parent line (e.g. "DirectNested:")
                        parent_idx = i;
                        parent_indent = match[1].length;
                        break;
                    }
                    // Line has content after colon — only treat as block parent
                    // if the next non-empty line is indented further
                    for (let j = i + 1; j < search_end; j++) {
                        if (lines[j].trim() === '') continue;
                        const nextLeading = lines[j].match(/^(\s*)/);
                        if (nextLeading && nextLeading[1].length > match[1].length) {
                            parent_idx = i;
                            parent_indent = match[1].length;
                        }
                        break;
                    }
                    if (parent_idx !== -1) break;
                }
            }

            if (parent_idx === -1) return null;

            // Detect child indent from first non-empty line after parent
            let child_indent = -1;
            for (let i = parent_idx + 1; i < search_end; i++) {
                if (lines[i].trim() === '') continue;
                const leading_spaces = lines[i].match(/^(\s*)/);
                if (leading_spaces) {
                    const indent = leading_spaces[1].length;
                    if (indent > parent_indent) {
                        child_indent = indent;
                        break;
                    }
                }
                break;
            }

            if (child_indent === -1) return null;

            // Narrow to children
            search_start = parent_idx + 1;
            for (let i = parent_idx + 1; i < search_end; i++) {
                if (lines[i].trim() === '') continue;
                const leading_spaces = lines[i].match(/^(\s*)/);
                if (
                    leading_spaces &&
                    leading_spaces[1].length < child_indent
                ) {
                    search_end = i;
                    break;
                }
            }
        }

        // Find and replace the final property
        const final_prop = segments[segments.length - 1];
        for (let i = search_start; i < search_end; i++) {
            const match = lines[i].match(
                new RegExp(
                    `^(\\s*${escape_regex(final_prop)}:\\s*).+$`
                )
            );
            if (match) {
                lines[i] = match[1] + value;
                return lines.join('\n');
            }
        }

        return null;
    }
}
