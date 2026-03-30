import { describe, expect, it } from 'vitest';
import { parse_log_entries } from '../src/cmd-read';

describe('parse_log_entries', () => {
    it('should classify timestamp-prefixed errors', () => {
        const lines = [
            '2024-01-15 10:30:45 NullReferenceException: Object reference not set',
            '  at GameManager.Update () [0x00000]',
            'Normal info line',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('error');
        expect(entries[0].stack_trace).toHaveLength(1);
    });

    it('should classify runtime exceptions anywhere in the line', () => {
        const lines = [
            'UnityEngine.MissingReferenceException: The object was destroyed',
            '  at Spawner.Spawn () [0x00012]',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('error');
    });

    it('should classify assertion failures', () => {
        const lines = [
            'Assertion failed: Expected value > 0',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('error');
    });

    it('should classify errors not at start of line', () => {
        const lines = [
            'PlayerController: error in state machine transition',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('error');
    });

    it('should classify warnings anywhere in line', () => {
        const lines = [
            'Animation warning: clip has no curves',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('warning');
    });

    it('should classify compile errors', () => {
        const lines = [
            'Assets/Scripts/Foo.cs(42,10): error CS0103: The name \'bar\' does not exist',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('error');
    });

    it('should classify import errors', () => {
        const lines = [
            'Failed to import Assets/Textures/broken.png',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(1);
        expect(entries[0].level).toBe('import_error');
    });

    it('should not classify normal info lines', () => {
        const lines = [
            'Loaded scene: MainScene',
            'Player connected',
            'Build completed successfully',
        ];
        const entries = parse_log_entries(lines);
        expect(entries.length).toBe(0);
    });
});
