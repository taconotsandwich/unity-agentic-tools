import { describe, it, expect } from 'vitest';
import { editProperty, validateUnityYAML, safeUnityYAMLEdit } from '../src/editor';

describe('UnityEditor', () => {
  describe('safeUnityYAMLEdit', () => {
    it('should edit GameObject property with regex', () => {
      const result = safeUnityYAMLEdit(
        'test/fixtures/Main.unity',
        'Main Camera',
        'm_IsActive',
        'false'
      );

      expect(result.success).toBe(true);
      expect(result.file_path).toBe('test/fixtures/Main.unity');
    });

    it('should handle GameObject not found', () => {
      const result = safeUnityYAMLEdit(
        'test/fixtures/Main.unity',
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
        file_path: 'test/fixtures/Main.unity',
        object_name: 'Instruction',
        property: 'm_IsActive',
        new_value: 'false'
      });

      expect(result.success).toBe(true);
      expect(result.file_path).toBe('test/fixtures/Main.unity');
      expect(typeof result.bytes_written).toBe('number');
    });

    it('should fail when GameObject not found', () => {
      const result = editProperty({
        file_path: 'test/fixtures/Main.unity',
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
      const valid = validateUnityYAML('%YAML 1.1\\nguid: 123e4567890abcdef1234567890abcdef12');

      expect(valid).toBe(true);
    });

    it('should reject invalid GUID format', () => {
      const invalid = validateUnityYAML('%YAML 1.1\\nguid: 123e456');

      expect(invalid).toBe(false);
    });
  });
});
