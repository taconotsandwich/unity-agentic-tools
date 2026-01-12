import { describe, it, expect } from 'vitest';
import { UnityScanner } from '../src/scanner';

const scanner = new UnityScanner();

describe('UnityScanner', () => {

  describe('scan_scene_minimal', () => {
    it('should parse GameObjects from Unity file', () => {
      const gameobjects = scanner.scan_scene_minimal('test/fixtures/Main.unity');

      expect(gameobjects).toBeDefined();
      expect(Array.isArray(gameobjects)).toBe(true);
      expect(gameobjects.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent file', () => {
      const gameobjects = scanner.scan_scene_minimal('nonexistent.unity');

      expect(gameobjects).toEqual([]);
    });
  });

  describe('scan_scene_with_components', () => {
    it('should parse GameObjects with components', () => {
      const gameobjects = scanner.scan_scene_with_components('test/fixtures/Main.unity');

      expect(gameobjects).toBeDefined();
      expect(Array.isArray(gameobjects)).toBe(true);
    });
  });

  describe('find_by_name', () => {
    it('should find GameObject by exact match', () => {
      const result = scanner.find_by_name('test/fixtures/Main.unity', 'Instruction', false);

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Instruction');
    });

    it('should find GameObject by fuzzy match', () => {
      const result = scanner.find_by_name('test/fixtures/Main.unity', 'ame', true);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(go => {
        expect(go.name.toLowerCase()).toContain('ame');
      });
    });
  });

  describe('inspect', () => {
    it('should get GameObject by file ID', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/Main.unity',
        identifier: '162353359'
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Instruction');
    });

    it('should get GameObject by name', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/Main.unity',
        identifier: 'Instruction'
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Instruction');
    });
  });
});
