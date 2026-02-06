import { describe, it, expect } from 'vitest';
import { UnityScanner, isNativeModuleAvailable } from '../src/scanner';

// Skip all tests if native module is not available
const describeIfNative = isNativeModuleAvailable() ? describe : describe.skip;

let scanner: UnityScanner;
if (isNativeModuleAvailable()) {
  scanner = new UnityScanner();
}

describeIfNative('UnityScanner', () => {

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

    it('should exclude properties by default', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/Main.unity',
        identifier: 'Instruction'
      });

      expect(result).toBeDefined();
      if (result?.components) {
        for (const comp of result.components) {
          expect(comp.properties).toBeUndefined();
        }
      }
    });

    it('should include properties when requested', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/Main.unity',
        identifier: 'Instruction',
        include_properties: true
      });

      expect(result).toBeDefined();
      const hasProps = result?.components?.some((c: any) => c.properties !== undefined);
      expect(hasProps).toBe(true);
    });
  });

  describe('PrefabInstance awareness', () => {
    it('scan_scene_with_components should find PrefabInstances', () => {
      const result = scanner.scan_scene_with_components('test/fixtures/SceneWithPrefab.unity');
      const prefabs = result.filter((r: any) => r.type === 'PrefabInstance') as any[];
      expect(prefabs.length).toBe(1);
      expect(prefabs[0].name).toBe('MyEnemy');
      expect(prefabs[0].source_guid).toBe('a1b2c3d4e5f6789012345678abcdef12');
      expect(prefabs[0].modifications_count).toBe(4);
    });

    it('scan_scene_with_components should include regular GameObjects too', () => {
      const result = scanner.scan_scene_with_components('test/fixtures/SceneWithPrefab.unity');
      const gameobjects = result.filter((r: any) => r.type !== 'PrefabInstance');
      expect(gameobjects.length).toBeGreaterThan(0);
      expect(gameobjects.some((go: any) => go.name === 'Main Camera')).toBe(true);
    });

    it('inspect_all should include prefabInstances field', () => {
      const result = scanner.inspect_all('test/fixtures/SceneWithPrefab.unity', false, false);
      expect(result.prefabInstances).toBeDefined();
      expect(result.prefabInstances!.length).toBe(1);
      expect(result.prefabInstances![0].name).toBe('MyEnemy');
      expect(result.prefabInstances![0].fileId).toBe('700000');
    });

    it('inspect by file ID should find PrefabInstance', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/SceneWithPrefab.unity',
        identifier: '700000',
      });
      expect(result).toBeDefined();
      expect((result as any).type).toBe('PrefabInstance');
      expect((result as any).name).toBe('MyEnemy');
    });

    it('inspect by name should find PrefabInstance', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/SceneWithPrefab.unity',
        identifier: 'MyEnemy',
      });
      expect(result).toBeDefined();
      expect((result as any).type).toBe('PrefabInstance');
      expect((result as any).name).toBe('MyEnemy');
    });

    it('GameObjects should appear before PrefabInstances in scan output', () => {
      const result = scanner.scan_scene_with_components('test/fixtures/SceneWithPrefab.unity');
      const firstPrefabIdx = result.findIndex((r: any) => r.type === 'PrefabInstance');
      const lastGameObjectIdx = result.length - 1 - [...result].reverse().findIndex((r: any) => r.type !== 'PrefabInstance');
      expect(firstPrefabIdx).toBeGreaterThan(lastGameObjectIdx);
    });

    it('inspect_all should omit prefabInstances for files without them', () => {
      const result = scanner.inspect_all('test/fixtures/SampleScene.unity', false, false);
      expect(result.prefabInstances).toBeUndefined();
    });

    it('verbose scan should include file_id on PrefabInstances', () => {
      const result = scanner.scan_scene_with_components('test/fixtures/SceneWithPrefab.unity', { verbose: true });
      const prefabs = result.filter((r: any) => r.type === 'PrefabInstance') as any[];
      expect(prefabs.length).toBe(1);
      expect(prefabs[0].file_id).toBe('700000');
    });

    it('non-verbose scan should omit file_id on PrefabInstances', () => {
      const result = scanner.scan_scene_with_components('test/fixtures/SceneWithPrefab.unity');
      const prefabs = result.filter((r: any) => r.type === 'PrefabInstance') as any[];
      expect(prefabs[0].file_id).toBeUndefined();
    });

    it('inspect PrefabInstance should include source_guid and modifications_count', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/SceneWithPrefab.unity',
        identifier: '700000',
      });
      expect((result as any).source_guid).toBe('a1b2c3d4e5f6789012345678abcdef12');
      expect((result as any).modifications_count).toBe(4);
    });
  });

  describe('inspect_all', () => {
    it('should exclude properties by default', () => {
      const result = scanner.inspect_all('test/fixtures/Main.unity', false, false);

      expect(result).toBeDefined();
      expect(result.count).toBeGreaterThan(0);
      for (const go of result.gameobjects) {
        for (const comp of go.components) {
          expect(comp.properties).toBeUndefined();
        }
      }
    });

    it('should include properties when requested', () => {
      const result = scanner.inspect_all('test/fixtures/Main.unity', true, false);

      expect(result).toBeDefined();
      const hasProps = result.gameobjects.some(
        (go: any) => go.components.some((c: any) => c.properties !== undefined)
      );
      expect(hasProps).toBe(true);
    });

    it('should filter Unity metadata from properties', () => {
      const result = scanner.inspect_all('test/fixtures/Main.unity', true, false);

      for (const go of result.gameobjects) {
        for (const comp of go.components) {
          if (comp.properties) {
            expect(comp.properties).not.toHaveProperty('ObjectHideFlags');
            expect(comp.properties).not.toHaveProperty('CorrespondingSourceObject');
            expect(comp.properties).not.toHaveProperty('PrefabInstance');
            expect(comp.properties).not.toHaveProperty('PrefabAsset');
          }
        }
      }
    });
  });
});
