import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { editProperty, safeUnityYAMLEdit, validateUnityYAML } from '../src/editor';
import { create_temp_fixture } from './test-utils';
import type { TempFixture } from './test-utils';

describe('UnityEditor', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'Main.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    describe('safeUnityYAMLEdit', () => {
        it('should edit GameObject property with regex', () => {
            const result = safeUnityYAMLEdit(
                temp_fixture.temp_path,
                'Main Camera',
                'm_IsActive',
                'false'
            );

            expect(result.success).toBe(true);
            expect(result.file_path).toBe(temp_fixture.temp_path);
        });

        it('should handle GameObject not found', () => {
            const result = safeUnityYAMLEdit(
                temp_fixture.temp_path,
                'NonExistent',
                'm_IsActive',
                'false'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('editProperty', () => {
        it('should edit property with validation', () => {
            const result = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Instruction',
                property: 'm_IsActive',
                new_value: 'false'
            });

            expect(result.success).toBe(true);
            expect(result.file_path).toBe(temp_fixture.temp_path);
            expect(typeof result.bytes_written).toBe('number');
        });

        it('should fail when GameObject not found', () => {
            const result = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'NonExistent',
                property: 'm_IsActive',
                new_value: 'false'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('validateUnityYAML', () => {
        it('should validate Unity YAML header', () => {
            const valid = validateUnityYAML('%YAML 1.1\\ntest content...');

            expect(valid).toBe(true);
        });

        it('should reject invalid YAML header', () => {
            const invalid = validateUnityYAML('Missing header');

            expect(invalid).toBe(false);
        });

        it('should validate proper GUID format', () => {
            const valid = validateUnityYAML(
                '%YAML 1.1\\nguid: 123e4567890abcdef1234567890abcdef12'
            );

            expect(valid).toBe(true);
        });

        it('should reject invalid GUID format', () => {
            const invalid = validateUnityYAML('%YAML 1.1\\nguid: 123e456');

            expect(invalid).toBe(false);
        });
    });
});
