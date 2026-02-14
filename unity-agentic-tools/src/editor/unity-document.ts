import { readFileSync } from 'fs';
import { UnityBlock } from './unity-block';
import { atomicWrite } from '../utils';

/**
 * Collection + I/O wrapper for Unity YAML files.
 * Loads a file, splits it into UnityBlocks, provides O(1) lookup by fileID,
 * and handles serialization and atomic save.
 */
export class UnityDocument {
    readonly file_path: string | null;
    private _header: string;
    private _blocks: UnityBlock[];
    private _id_index: Map<string, number>;
    private _structure_dirty: boolean;

    // ─── Factory Methods ───────────────────────────────────────────────

    /**
     * Load a Unity YAML file from disk.
     */
    static from_file(file_path: string, options?: { validate?: boolean }): UnityDocument {
        const content = readFileSync(file_path, 'utf-8');
        const doc = UnityDocument._parse(content, file_path);
        if (options?.validate && !doc.validate()) {
            throw new Error(`Invalid Unity YAML file: ${file_path}`);
        }
        return doc;
    }

    /**
     * Parse Unity YAML content from a string.
     */
    static from_string(content: string, options?: { validate?: boolean }): UnityDocument {
        const doc = UnityDocument._parse(content, null);
        if (options?.validate && !doc.validate()) {
            throw new Error('Invalid Unity YAML content');
        }
        return doc;
    }

    /**
     * Internal parser: split content into header + blocks, build index.
     */
    private static _parse(content: string, file_path: string | null): UnityDocument {
        // Normalize CRLF to LF — Unity YAML uses LF natively; git on Windows
        // may convert to CRLF on checkout, which breaks block-style regex parsing.
        const normalized = content.replace(/\r\n/g, '\n');
        const parts = normalized.split(/(?=--- !u!)/);

        let header = '';
        const raw_blocks: string[] = [];

        if (parts.length > 0 && !parts[0].startsWith('--- !u!')) {
            header = parts.shift()!;
        }

        for (const part of parts) {
            raw_blocks.push(part);
        }

        const blocks = raw_blocks.map(raw => new UnityBlock(raw));
        return new UnityDocument(file_path, header, blocks);
    }

    // ─── Constructor ───────────────────────────────────────────────────

    private constructor(file_path: string | null, header: string, blocks: UnityBlock[]) {
        this.file_path = file_path;
        this._header = header;
        this._blocks = blocks;
        this._id_index = new Map();
        this._structure_dirty = false;
        this._rebuild_index();
    }

    /**
     * Rebuild the fileID -> index map from scratch.
     */
    private _rebuild_index(): void {
        this._id_index.clear();
        for (let i = 0; i < this._blocks.length; i++) {
            const id = this._blocks[i].file_id;
            if (id !== '0') {
                this._id_index.set(id, i);
            }
        }
    }

    // ─── Accessors ─────────────────────────────────────────────────────

    get blocks(): ReadonlyArray<UnityBlock> {
        return this._blocks;
    }

    get count(): number {
        return this._blocks.length;
    }

    /**
     * True if any block is dirty or if blocks have been added/removed.
     */
    get dirty(): boolean {
        if (this._structure_dirty) return true;
        for (const block of this._blocks) {
            if (block.dirty) return true;
        }
        return false;
    }

    // ─── Query ─────────────────────────────────────────────────────────

    /**
     * O(1) lookup by fileID string.
     */
    find_by_file_id(file_id: string): UnityBlock | null {
        const index = this._id_index.get(file_id);
        if (index === undefined) return null;
        return this._blocks[index];
    }

    /**
     * Find all blocks matching a given class ID.
     */
    find_by_class_id(class_id: number): UnityBlock[] {
        const results: UnityBlock[] = [];
        for (const block of this._blocks) {
            if (block.class_id === class_id) {
                results.push(block);
            }
        }
        return results;
    }

    /**
     * Find all GameObjects (classID=1) with a given name.
     * Matches against the m_Name property.
     */
    find_game_objects_by_name(name: string): UnityBlock[] {
        const results: UnityBlock[] = [];
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^\\s*m_Name:\\s*${escaped}\\s*$`, 'm');

        for (const block of this._blocks) {
            if (block.class_id === 1 && pattern.test(block.raw)) {
                results.push(block);
            }
        }
        return results;
    }

    /**
     * Find Transform fileIDs for GameObjects with a given name.
     * Returns the fileID of the first component (the Transform) for each matching GO.
     */
    find_transforms_by_name(name: string): string[] {
        const game_objects = this.find_game_objects_by_name(name);
        const transform_ids: string[] = [];

        for (const go of game_objects) {
            // First component listed is always the Transform
            const match = go.raw.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
            if (match) {
                transform_ids.push(match[1]);
            }
        }

        return transform_ids;
    }

    // ─── Validation Helpers ────────────────────────────────────────────

    /**
     * Require a unique GameObject match by name or fileID.
     * If name_or_id is all digits, looks up by fileID.
     * Otherwise, finds by name.
     */
    require_unique_game_object(name_or_id: string): UnityBlock | { error: string } {
        if (/^\d+$/.test(name_or_id)) {
            const block = this.find_by_file_id(name_or_id);
            if (!block) {
                return { error: `GameObject with fileID ${name_or_id} not found` };
            }
            if (block.class_id !== 1) {
                return { error: `fileID ${name_or_id} is not a GameObject (class ${block.class_id})` };
            }
            return block;
        }

        const matches = this.find_game_objects_by_name(name_or_id);
        if (matches.length === 0) {
            return { error: `GameObject "${name_or_id}" not found` };
        }
        if (matches.length > 1) {
            const ids = matches.map(b => b.file_id).join(', ');
            return { error: `Multiple GameObjects named "${name_or_id}" found (fileIDs: ${ids}). Use numeric fileID to specify which one.` };
        }
        return matches[0];
    }

    /**
     * Require a unique Transform match by GameObject name or fileID.
     * Returns the Transform block (not the GO).
     */
    require_unique_transform(name_or_id: string): UnityBlock | { error: string } {
        if (/^\d+$/.test(name_or_id)) {
            // Could be a Transform fileID directly or a GO fileID
            const block = this.find_by_file_id(name_or_id);
            if (!block) {
                return { error: `Block with fileID ${name_or_id} not found` };
            }
            if (block.class_id === 4) {
                return block;
            }
            if (block.class_id === 1) {
                // It's a GO, find its transform
                const match = block.raw.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
                if (match) {
                    const transform = this.find_by_file_id(match[1]);
                    if (transform) return transform;
                }
                return { error: `Transform for GameObject fileID ${name_or_id} not found` };
            }
            return { error: `fileID ${name_or_id} is not a GameObject or Transform (class ${block.class_id})` };
        }

        const transform_ids = this.find_transforms_by_name(name_or_id);
        if (transform_ids.length === 0) {
            return { error: `GameObject "${name_or_id}" not found` };
        }
        if (transform_ids.length > 1) {
            const go_ids = this.find_game_objects_by_name(name_or_id).map(b => b.file_id).join(', ');
            return { error: `Multiple GameObjects named "${name_or_id}" found (fileIDs: ${go_ids}). Use numeric fileID to specify which one.` };
        }
        const transform = this.find_by_file_id(transform_ids[0]);
        if (!transform) {
            return { error: `Transform for "${name_or_id}" not found` };
        }
        return transform;
    }

    /**
     * Find the root of a prefab (the Transform with m_Father: {fileID: 0}).
     * Returns the GO block, Transform block, and name.
     */
    find_prefab_root(): { game_object: UnityBlock; transform: UnityBlock; name: string } | null {
        // Look for a Transform with m_Father: {fileID: 0}
        for (const block of this._blocks) {
            if (block.class_id === 4 && !block.is_stripped && /m_Father:\s*\{fileID:\s*0\}/.test(block.raw)) {
                const go_match = block.raw.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
                if (go_match) {
                    const go_block = this.find_by_file_id(go_match[1]);
                    if (go_block) {
                        const name_match = go_block.raw.match(/m_Name:\s*(.+)/);
                        const name = name_match ? name_match[1].trim() : 'Prefab';
                        return { game_object: go_block, transform: block, name };
                    }
                }
            }
        }

        // Fallback: variant prefabs with stripped blocks
        for (const block of this._blocks) {
            if (block.class_id === 1 && block.is_stripped) {
                // Find matching stripped Transform
                for (const t_block of this._blocks) {
                    if (t_block.class_id === 4 && t_block.is_stripped) {
                        // Extract name from PrefabInstance modifications
                        let name = 'Variant';
                        for (const pi_block of this._blocks) {
                            if (pi_block.class_id === 1001) {
                                const name_mod = pi_block.raw.match(/propertyPath: m_Name\s*\n\s*value:\s*(.+)/);
                                if (name_mod) {
                                    name = name_mod[1].trim();
                                }
                                break;
                            }
                        }

                        return { game_object: block, transform: t_block, name };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Return a Set of all fileIDs in the document (as strings).
     */
    all_file_ids(): Set<string> {
        const ids = new Set<string>();
        for (const block of this._blocks) {
            const id = block.file_id;
            if (id !== '0') {
                ids.add(id);
            }
        }
        return ids;
    }

    /**
     * Trace fileID references in/out/both from a starting block.
     * Returns an array of reference edges up to max_depth.
     *
     * 'out' = blocks that this block references
     * 'in' = blocks that reference this block
     * 'both' = union of in and out
     */
    trace_references(
        file_id: string,
        direction: 'in' | 'out' | 'both' = 'both',
        max_depth: number = 3
    ): Array<{ source_file_id: string; target_file_id: string; source_class_id: number; target_class_id: number; property?: string; depth: number }> {
        const edges: Array<{ source_file_id: string; target_file_id: string; source_class_id: number; target_class_id: number; property?: string; depth: number }> = [];
        const visited = new Set<string>();

        // Build reverse index for 'in' direction: target_id -> source_ids
        let reverseIndex: Map<string, string[]> | null = null;
        if (direction === 'in' || direction === 'both') {
            reverseIndex = new Map();
            for (const block of this._blocks) {
                const refs = block.extract_file_id_refs();
                for (const ref of refs) {
                    if (!reverseIndex.has(ref)) reverseIndex.set(ref, []);
                    reverseIndex.get(ref)!.push(block.file_id);
                }
            }
        }

        const queue: Array<{ id: string; depth: number; dir: 'out' | 'in' }> = [];

        if (direction === 'out' || direction === 'both') {
            queue.push({ id: file_id, depth: 0, dir: 'out' });
        }
        if (direction === 'in' || direction === 'both') {
            queue.push({ id: file_id, depth: 0, dir: 'in' });
        }

        while (queue.length > 0) {
            const { id, depth, dir } = queue.shift()!;
            if (depth >= max_depth) continue;

            const visitKey = `${id}:${dir}`;
            if (visited.has(visitKey)) continue;
            visited.add(visitKey);

            if (dir === 'out') {
                const block = this.find_by_file_id(id);
                if (!block) continue;
                const refs = block.extract_file_id_refs();
                for (const ref of refs) {
                    const targetBlock = this.find_by_file_id(ref);
                    if (!targetBlock) continue;
                    edges.push({
                        source_file_id: id,
                        target_file_id: ref,
                        source_class_id: block.class_id,
                        target_class_id: targetBlock.class_id,
                        depth: depth + 1,
                    });
                    queue.push({ id: ref, depth: depth + 1, dir: 'out' });
                }
            } else {
                // 'in' direction
                const sources = reverseIndex?.get(id) || [];
                for (const sourceId of sources) {
                    const sourceBlock = this.find_by_file_id(sourceId);
                    const targetBlock = this.find_by_file_id(id);
                    if (!sourceBlock || !targetBlock) continue;
                    edges.push({
                        source_file_id: sourceId,
                        target_file_id: id,
                        source_class_id: sourceBlock.class_id,
                        target_class_id: targetBlock.class_id,
                        depth: depth + 1,
                    });
                    queue.push({ id: sourceId, depth: depth + 1, dir: 'in' });
                }
            }
        }

        return edges;
    }

    // ─── Mutation ──────────────────────────────────────────────────────

    /**
     * Append a single block to the document.
     */
    append_block(block: UnityBlock): void {
        const index = this._blocks.length;
        this._blocks.push(block);
        const id = block.file_id;
        if (id !== '0') {
            this._id_index.set(id, index);
        }
        this._structure_dirty = true;
    }

    /**
     * Parse raw YAML text into blocks and append them.
     * Returns the newly created blocks.
     */
    append_raw(yaml_text: string): UnityBlock[] {
        const parts = yaml_text.split(/(?=--- !u!)/);
        const new_blocks: UnityBlock[] = [];

        for (const part of parts) {
            if (!part.startsWith('--- !u!')) continue;
            const block = new UnityBlock(part);
            this.append_block(block);
            new_blocks.push(block);
        }

        return new_blocks;
    }

    /**
     * Remove all blocks whose fileIDs are in the given set.
     * Returns the count of blocks removed.
     */
    remove_blocks(file_ids: Set<string>): number {
        const original_count = this._blocks.length;
        this._blocks = this._blocks.filter(block => {
            const id = block.file_id;
            return !file_ids.has(id);
        });
        const removed = original_count - this._blocks.length;
        if (removed > 0) {
            this._rebuild_index();
            this._structure_dirty = true;
        }
        return removed;
    }

    /**
     * Remove a single block by fileID.
     * Returns true if the block was found and removed.
     */
    remove_block(file_id: string): boolean {
        const index = this._id_index.get(file_id);
        if (index === undefined) return false;

        this._blocks.splice(index, 1);
        this._rebuild_index();
        this._structure_dirty = true;
        return true;
    }

    /**
     * Replace a block at a given index.
     */
    replace_block(index: number, block: UnityBlock): void {
        if (index < 0 || index >= this._blocks.length) {
            throw new Error(`Block index ${index} out of range (0..${this._blocks.length - 1})`);
        }

        const old_id = this._blocks[index].file_id;
        this._blocks[index] = block;

        // Update index
        if (old_id !== '0') {
            this._id_index.delete(old_id);
        }
        const new_id = block.file_id;
        if (new_id !== '0') {
            this._id_index.set(new_id, index);
        }

        this._structure_dirty = true;
    }

    // ─── Hierarchy ─────────────────────────────────────────────────────

    /**
     * Add a child Transform to a parent Transform's m_Children array.
     */
    add_child_to_parent(parent_id: string, child_id: string): boolean {
        const parent = this.find_by_file_id(parent_id);
        if (!parent || parent.class_id !== 4) return false;

        let raw = parent.raw;

        // Try inline empty array first: m_Children: []
        const inline_empty = /m_Children:\s*\[\]/;
        if (inline_empty.test(raw)) {
            raw = raw.replace(inline_empty, `m_Children:\n  - {fileID: ${child_id}}`);
            parent.replace_raw(raw);
            return true;
        }

        // Try inline non-empty: m_Children: [{...}]
        const inline_pattern = /m_Children:\s*\[(.*?)\]/;
        const inline_match = raw.match(inline_pattern);
        if (inline_match) {
            const trimmed = inline_match[1].trim();
            if (trimmed === '') {
                raw = raw.replace(inline_pattern, `m_Children:\n  - {fileID: ${child_id}}`);
            } else {
                raw = raw.replace(inline_pattern, (match) => {
                    return match.replace(']', '') + `\n  - {fileID: ${child_id}}]`;
                });
            }
            parent.replace_raw(raw);
            return true;
        }

        // Multiline m_Children - append new entry
        if (raw.includes('m_Children:') && !raw.includes(`fileID: ${child_id}`)) {
            raw = raw.replace(
                /(m_Children:\s*\n(?:\s*-\s*\{fileID:\s*\d+\}\s*\n)*)/,
                `$1  - {fileID: ${child_id}}\n`
            );
            parent.replace_raw(raw);
            return true;
        }

        return false;
    }

    /**
     * Remove a child Transform from a parent Transform's m_Children array.
     */
    remove_child_from_parent(parent_id: string, child_id: string): boolean {
        const parent = this.find_by_file_id(parent_id);
        if (!parent || parent.class_id !== 4) return false;

        let raw = parent.raw;

        // Remove the child line
        const child_line = new RegExp(`\\n[ \\t]*- \\{fileID: ${child_id}\\}`);
        if (!child_line.test(raw)) return false;

        raw = raw.replace(child_line, '');

        // If m_Children is now empty, convert to empty array
        if (/m_Children:\s*\n\s*m_Father:/.test(raw) || /m_Children:\s*\n\s*m_RootOrder:/.test(raw)) {
            raw = raw.replace(/m_Children:\s*\n/, 'm_Children: []\n');
        }

        parent.replace_raw(raw);
        return true;
    }

    /**
     * Recursively collect all fileIDs in a Transform hierarchy.
     * Includes child transforms, their GameObjects, and all components.
     * Does NOT include the starting transform itself.
     */
    collect_hierarchy(transform_id: string): Set<string> {
        const result = new Set<string>();
        this._collect_hierarchy_recursive(transform_id, result);
        return result;
    }

    private _collect_hierarchy_recursive(transform_id: string, result: Set<string>): void {
        const transform = this.find_by_file_id(transform_id);
        if (!transform || transform.class_id !== 4) return;

        // Extract child transform IDs from m_Children
        const children_section = transform.raw.match(/m_Children:[\s\S]*?(?=\s*m_Father:)/);
        if (!children_section) return;

        const child_ids: string[] = [];
        const child_matches = children_section[0].matchAll(/\{fileID:\s*(\d+)\}/g);
        for (const m of child_matches) {
            if (m[1] !== '0') child_ids.push(m[1]);
        }

        for (const child_transform_id of child_ids) {
            result.add(child_transform_id);

            // Find child Transform to get its GameObject
            const child_transform = this.find_by_file_id(child_transform_id);
            if (child_transform) {
                const go_match = child_transform.raw.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
                if (go_match) {
                    const go_id = go_match[1];
                    result.add(go_id);

                    // Find GO block and collect all component fileIDs
                    const go_block = this.find_by_file_id(go_id);
                    if (go_block) {
                        const comp_matches = go_block.raw.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
                        for (const cm of comp_matches) {
                            result.add(cm[1]);
                        }
                    }
                }
            }

            // Recurse into children
            this._collect_hierarchy_recursive(child_transform_id, result);
        }
    }

    /**
     * Calculate the next m_RootOrder for a new child under a given parent.
     * For root-level (parent_id === "0"): count transforms with m_Father: {fileID: 0}.
     * For children: count entries in the parent's m_Children array.
     */
    calculate_root_order(parent_id: string): number {
        if (parent_id === '0') {
            let count = 0;
            for (const block of this._blocks) {
                if (block.class_id === 4 && /m_Father:\s*\{fileID:\s*0\}/.test(block.raw)) {
                    count++;
                }
            }
            return count;
        }

        const parent = this.find_by_file_id(parent_id);
        if (!parent || parent.class_id !== 4) return 0;

        const children_match = parent.raw.match(/m_Children:[\s\S]*?(?=\s*m_Father:)/);
        if (children_match) {
            const entries = children_match[0].match(/\{fileID:\s*\d+\}/g);
            return entries ? entries.length : 0;
        }
        return 0;
    }

    // ─── ID Management ─────────────────────────────────────────────────

    /**
     * Generate a unique fileID string that does not collide with existing IDs.
     */
    generate_file_id(): string {
        const existing = this.all_file_ids();
        let id: string;
        do {
            const numeric = Math.floor(Math.random() * 9000000000) + 1000000000;
            id = String(numeric);
        } while (existing.has(id) || id === '0');
        return id;
    }

    /**
     * Remap fileIDs across specific blocks using a string-based mapping.
     * Only affects blocks whose fileIDs are in block_ids.
     */
    remap_file_ids(id_map: Map<string, string>, block_ids: Set<string>): void {
        for (const block of this._blocks) {
            if (block_ids.has(block.file_id)) {
                for (const [old_id, new_id] of id_map) {
                    block.remap_file_id(old_id, new_id);
                }
            }
        }
        this._rebuild_index();
        this._structure_dirty = true;
    }

    // ─── Serialization ─────────────────────────────────────────────────

    /**
     * Serialize the document back to a string.
     * Round-trip fidelity: from_string(content).serialize() === content
     */
    serialize(): string {
        return this._header + this._blocks.map(b => b.raw).join('');
    }

    /**
     * Validate the document structure.
     */
    validate(): boolean {
        const content = this.serialize();

        if (!content.startsWith('%YAML 1.1')) {
            return false;
        }

        // Check for invalid GUIDs (too short)
        const invalid_guids = content.match(/guid:\s*[a-f0-9]{1,29}\b/g);
        if (invalid_guids) {
            return false;
        }

        const block_opens = (content.match(/--- !u!/g) || []).length;
        const block_closes = (content.match(/\n---(?!u!)/g) || []).length;
        if (Math.abs(block_opens - block_closes) > 1) {
            return false;
        }

        return true;
    }

    /**
     * Save the document to disk using atomic write.
     * If file_path is not provided, uses the original file_path from from_file().
     */
    save(file_path?: string): { success: boolean; bytes_written?: number; error?: string } {
        const target = file_path ?? this.file_path;
        if (!target) {
            return { success: false, error: 'No file path specified and document was not loaded from a file' };
        }

        const content = this.serialize();
        const result = atomicWrite(target, content);

        return {
            success: result.success,
            bytes_written: result.bytes_written,
            error: result.error,
        };
    }
}
