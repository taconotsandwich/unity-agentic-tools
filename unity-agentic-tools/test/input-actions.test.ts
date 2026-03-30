import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    load_input_actions,
    save_input_actions,
    add_map,
    remove_map,
    add_action,
    remove_action,
    add_binding,
    remove_binding,
    add_control_scheme,
    remove_control_scheme,
    generate_action_id,
} from '../src/input-actions';
import type { InputActionsFile } from '../src/input-actions';

const FIXTURE = join(__dirname, 'fixtures', 'test-input-actions.inputactions');

describe('input-actions', () => {
    let tmp_file: string;
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'ia-test-'));
        tmp_file = join(tmp_dir, 'test.inputactions');
        cpSync(FIXTURE, tmp_file);
    });

    afterEach(() => {
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    describe('generate_action_id', () => {
        test('generates UUID format', () => {
            const id = generate_action_id();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });

        test('generates unique IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) ids.add(generate_action_id());
            expect(ids.size).toBe(100);
        });
    });

    describe('load_input_actions', () => {
        test('loads valid file', () => {
            const data = load_input_actions(tmp_file);
            expect('name' in data).toBe(true);
            if ('name' in data) {
                expect(data.name).toBe('TestInputActions');
                expect(data.maps.length).toBe(1);
                expect(data.maps[0].name).toBe('Player');
            }
        });

        test('returns error for missing file', () => {
            const data = load_input_actions('/tmp/nonexistent.inputactions');
            expect('error' in data).toBe(true);
        });

        test('returns error for invalid JSON', () => {
            writeFileSync(tmp_file, 'not json', 'utf-8');
            const data = load_input_actions(tmp_file);
            expect('error' in data).toBe(true);
        });
    });

    describe('save_input_actions', () => {
        test('saves with 4-space indent and trailing newline', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const out = join(tmp_dir, 'out.inputactions');
            save_input_actions(out, data);
            const raw = readFileSync(out, 'utf-8');
            expect(raw).toContain('    "name"');
            expect(raw.endsWith('}\n')).toBe(true);
        });
    });

    describe('add_map', () => {
        test('adds a new action map', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_map(data, 'UI');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                data = result;
                expect(data.maps.length).toBe(2);
                expect(data.maps[1].name).toBe('UI');
                expect(data.maps[1].id).toMatch(/^[a-f0-9-]+$/);
            }
        });

        test('rejects duplicate map name', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_map(data, 'Player');
            expect('error' in result).toBe(true);
        });

        test('rejects empty map name', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_map(data, '');
            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toContain('must not be empty');
            }
        });
    });

    describe('remove_map', () => {
        test('removes an existing map', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_map(data, 'Player');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                expect(result.maps.length).toBe(0);
            }
        });

        test('returns error for non-existent map', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_map(data, 'Nonexistent');
            expect('error' in result).toBe(true);
        });
    });

    describe('add_action', () => {
        test('adds an action to a map', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_action(data, 'Player', 'Jump', 'Button');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                expect(result.maps[0].actions.length).toBe(2);
                expect(result.maps[0].actions[1].name).toBe('Jump');
                expect(result.maps[0].actions[1].type).toBe('Button');
            }
        });

        test('returns error for non-existent map', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_action(data, 'Nonexistent', 'Jump');
            expect('error' in result).toBe(true);
        });
    });

    describe('remove_action', () => {
        test('removes an action and its bindings', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_action(data, 'Player', 'Move');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                expect(result.maps[0].actions.length).toBe(0);
                expect(result.maps[0].bindings.length).toBe(0);
            }
        });
    });

    describe('add_binding', () => {
        test('adds a binding to an action', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = add_binding(data, 'Player', 'Move', '<Keyboard>/w');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                expect(result.maps[0].bindings.length).toBe(2);
                expect(result.maps[0].bindings[1].path).toBe('<Keyboard>/w');
            }
        });
    });

    describe('remove_binding', () => {
        test('removes a binding', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_binding(data, 'Player', 'Move', '<Gamepad>/leftStick');
            expect('maps' in result).toBe(true);
            if ('maps' in result) {
                expect(result.maps[0].bindings.length).toBe(0);
            }
        });

        test('returns error for non-existent binding', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_binding(data, 'Player', 'Move', '<Keyboard>/wasd');
            expect('error' in result).toBe(true);
        });
    });

    describe('add_control_scheme', () => {
        test('adds a control scheme', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            data = add_control_scheme(data, 'Keyboard', 'Keyboard', ['<Keyboard>']);
            expect(data.controlSchemes.length).toBe(2);
            expect(data.controlSchemes[1].name).toBe('Keyboard');
            expect(data.controlSchemes[1].devices[0].devicePath).toBe('<Keyboard>');
        });
    });

    describe('remove_control_scheme', () => {
        test('removes a control scheme', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_control_scheme(data, 'Gamepad');
            expect('controlSchemes' in result).toBe(true);
            if ('controlSchemes' in result) {
                expect(result.controlSchemes.length).toBe(0);
            }
        });

        test('returns error for non-existent scheme', () => {
            const data = load_input_actions(tmp_file) as InputActionsFile;
            const result = remove_control_scheme(data, 'Touch');
            expect('error' in result).toBe(true);
        });
    });

    describe('round-trip', () => {
        test('add map, add action, add binding, save, reload', () => {
            let data = load_input_actions(tmp_file) as InputActionsFile;
            const r0 = add_map(data, 'UI');
            if ('error' in r0) throw new Error(r0.error);
            data = r0;
            const r1 = add_action(data, 'UI', 'Navigate', 'Value', 'Vector2');
            if ('error' in r1) throw new Error(r1.error);
            data = r1;
            const r2 = add_binding(data, 'UI', 'Navigate', '<Gamepad>/dpad');
            if ('error' in r2) throw new Error(r2.error);
            data = r2;

            save_input_actions(tmp_file, data);

            const reloaded = load_input_actions(tmp_file) as InputActionsFile;
            expect(reloaded.maps.length).toBe(2);
            expect(reloaded.maps[1].name).toBe('UI');
            expect(reloaded.maps[1].actions[0].name).toBe('Navigate');
            expect(reloaded.maps[1].bindings[0].path).toBe('<Gamepad>/dpad');
        });
    });
});
