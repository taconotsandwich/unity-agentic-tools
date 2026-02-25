import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

// ========== Interfaces ==========

export interface InputBinding {
    name: string;
    id: string;
    path: string;
    interactions: string;
    processors: string;
    groups: string;
    action: string;
    isComposite: boolean;
    isPartOfComposite: boolean;
}

export interface InputAction {
    name: string;
    type: string;
    id: string;
    expectedControlType: string;
    processors: string;
    interactions: string;
    initialStateCheck: boolean;
    bindings?: InputBinding[];
}

export interface InputActionMap {
    name: string;
    id: string;
    actions: InputAction[];
    bindings: InputBinding[];
}

export interface ControlScheme {
    name: string;
    bindingGroup: string;
    devices: { devicePath: string; isOptional: boolean }[];
}

export interface InputActionsFile {
    name: string;
    maps: InputActionMap[];
    controlSchemes: ControlScheme[];
}

// ========== Helpers ==========

/**
 * Generate a UUID in Unity Input System format.
 */
export function generate_action_id(): string {
    const bytes = randomBytes(16);
    const hex = bytes.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

/**
 * Load an .inputactions file.
 */
export function load_input_actions(file: string): InputActionsFile | { error: string } {
    if (!existsSync(file)) {
        return { error: `File not found: ${file}` };
    }
    try {
        const raw = readFileSync(file, 'utf-8');
        return JSON.parse(raw) as InputActionsFile;
    } catch (err: unknown) {
        return { error: `Failed to parse input actions: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/**
 * Save an .inputactions file with 4-space indent.
 */
export function save_input_actions(file: string, data: InputActionsFile): void {
    writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf-8');
}

// ========== CRUD Operations ==========

export function add_map(data: InputActionsFile, name: string): InputActionsFile | { error: string } {
    if (!name || name.trim() === '') {
        return { error: 'Map name must not be empty' };
    }
    if (data.maps.some(m => m.name === name)) {
        return { error: `Action map "${name}" already exists` };
    }
    data.maps.push({
        name,
        id: generate_action_id(),
        actions: [],
        bindings: [],
    });
    return data;
}

export function remove_map(data: InputActionsFile, name: string): InputActionsFile | { error: string } {
    const idx = data.maps.findIndex(m => m.name === name);
    if (idx < 0) return { error: `Action map "${name}" not found` };
    data.maps.splice(idx, 1);
    return data;
}

export function add_action(
    data: InputActionsFile,
    map_name: string,
    action_name: string,
    action_type: string = 'Value',
    expected_control_type: string = ''
): InputActionsFile | { error: string } {
    const map = data.maps.find(m => m.name === map_name);
    if (!map) return { error: `Action map "${map_name}" not found` };

    map.actions.push({
        name: action_name,
        type: action_type,
        id: generate_action_id(),
        expectedControlType: expected_control_type,
        processors: '',
        interactions: '',
        initialStateCheck: false,
    });
    return data;
}

export function remove_action(data: InputActionsFile, map_name: string, action_name: string): InputActionsFile | { error: string } {
    const map = data.maps.find(m => m.name === map_name);
    if (!map) return { error: `Action map "${map_name}" not found` };

    const idx = map.actions.findIndex(a => a.name === action_name);
    if (idx < 0) return { error: `Action "${action_name}" not found in map "${map_name}"` };

    // Also remove bindings for this action
    const action_id = map.actions[idx].id;
    map.bindings = map.bindings.filter(b => b.action !== action_id && b.action !== action_name);
    map.actions.splice(idx, 1);
    return data;
}

export function add_binding(
    data: InputActionsFile,
    map_name: string,
    action_name: string,
    binding_path: string,
    groups: string = ''
): InputActionsFile | { error: string } {
    const map = data.maps.find(m => m.name === map_name);
    if (!map) return { error: `Action map "${map_name}" not found` };

    const action = map.actions.find(a => a.name === action_name);
    if (!action) return { error: `Action "${action_name}" not found in map "${map_name}"` };

    map.bindings.push({
        name: '',
        id: generate_action_id(),
        path: binding_path,
        interactions: '',
        processors: '',
        groups,
        action: action_name,
        isComposite: false,
        isPartOfComposite: false,
    });
    return data;
}

export function remove_binding(
    data: InputActionsFile,
    map_name: string,
    action_name: string,
    binding_path: string
): InputActionsFile | { error: string } {
    const map = data.maps.find(m => m.name === map_name);
    if (!map) return { error: `Action map "${map_name}" not found` };

    const idx = map.bindings.findIndex(b => b.action === action_name && b.path === binding_path);
    if (idx < 0) return { error: `Binding "${binding_path}" for action "${action_name}" not found` };
    map.bindings.splice(idx, 1);
    return data;
}

export function add_control_scheme(
    data: InputActionsFile,
    name: string,
    binding_group: string,
    devices: string[] = []
): InputActionsFile {
    data.controlSchemes.push({
        name,
        bindingGroup: binding_group,
        devices: devices.map(d => ({ devicePath: d, isOptional: false })),
    });
    return data;
}

export function remove_control_scheme(data: InputActionsFile, name: string): InputActionsFile | { error: string } {
    const idx = data.controlSchemes.findIndex(cs => cs.name === name);
    if (idx < 0) return { error: `Control scheme "${name}" not found` };
    data.controlSchemes.splice(idx, 1);
    return data;
}
