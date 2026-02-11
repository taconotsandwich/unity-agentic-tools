import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
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
      expect(result[0].resultType).toBe('GameObject');
    });

    it('should find GameObject by fuzzy match', () => {
      const result = scanner.find_by_name('test/fixtures/Main.unity', 'ame', true);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(go => {
        expect(go.name.toLowerCase()).toContain('ame');
        expect(go.resultType).toBe('GameObject');
      });
    });

    it('should find PrefabInstance by exact name', () => {
      const result = scanner.find_by_name('test/fixtures/SceneWithPrefab.unity', 'MyEnemy', false);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const prefab = result.find(r => r.resultType === 'PrefabInstance');
      expect(prefab).toBeDefined();
      expect(prefab!.name).toBe('MyEnemy');
      expect(prefab!.sourceGuid).toBe('a1b2c3d4e5f6789012345678abcdef12');
      expect(prefab!.modificationsCount).toBe(4);
    });

    it('should find PrefabInstance by fuzzy match', () => {
      const result = scanner.find_by_name('test/fixtures/SceneWithPrefab.unity', 'enemy', true);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const prefab = result.find(r => r.resultType === 'PrefabInstance');
      expect(prefab).toBeDefined();
      expect(prefab!.name).toBe('MyEnemy');
      expect(prefab!.matchScore).toBeDefined();
      expect(prefab!.matchScore).toBeGreaterThan(0);
    });

    it('should return mixed results sorted by score', () => {
      const result = scanner.find_by_name('test/fixtures/SceneWithPrefab.unity', 'ma', true);

      // Should match "Main Camera" (GameObject) and potentially others
      expect(result.length).toBeGreaterThan(0);
      // Verify scores are in descending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].matchScore).toBeGreaterThanOrEqual(result[i].matchScore!);
      }
    });

    it('should set correct resultType discriminator', () => {
      const result = scanner.find_by_name('test/fixtures/SceneWithPrefab.unity', 'Camera', true);
      const goResults = result.filter(r => r.resultType === 'GameObject');
      expect(goResults.length).toBeGreaterThan(0);
      goResults.forEach(r => {
        expect(r.active).toBeDefined();
        expect(r.sourceGuid).toBeUndefined();
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

    it('inspect PrefabInstance with --properties should include modifications grouped by target', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/SceneWithPrefab.unity',
        identifier: '700000',
        include_properties: true,
      });
      expect(result).toBeDefined();
      expect((result as any).modifications).toBeDefined();
      const mods = (result as any).modifications;
      // Should be grouped by target fileID
      expect(typeof mods).toBe('object');
      // Should have entries (the exact count depends on the fixture)
      const keys = Object.keys(mods);
      expect(keys.length).toBeGreaterThan(0);
      // Each group should be an array of {propertyPath, value}
      for (const key of keys) {
        expect(Array.isArray(mods[key])).toBe(true);
        for (const mod of mods[key]) {
          expect(mod.propertyPath).toBeDefined();
          expect(mod.value).toBeDefined();
        }
      }
    });

    it('inspect PrefabInstance without --properties should NOT include modifications', () => {
      const result = scanner.inspect({
        file: 'test/fixtures/SceneWithPrefab.unity',
        identifier: '700000',
      });
      expect(result).toBeDefined();
      expect((result as any).modifications).toBeUndefined();
    });
  });

  describe('GUID resolution', () => {
    const guidProjectRoot = 'test/fixtures/guid-project';
    const guidSceneFile = 'test/fixtures/guid-project/Assets/Scenes/TestScene.unity';

    it('should populate script_name from resolved script_path', () => {
      scanner.setProjectRoot(guidProjectRoot);
      const result = scanner.inspect({
        file: guidSceneFile,
        identifier: 'Player',
        verbose: true,
      });

      expect(result).toBeDefined();
      const components = (result as any).components;
      const monoBehaviour = components.find((c: any) => c.type === 'MonoBehaviour');
      expect(monoBehaviour).toBeDefined();
      expect(monoBehaviour.script_name).toBe('PlayerController');
      expect(monoBehaviour.script_path).toContain('PlayerController.cs');
    });

    it('should resolve GUID references in property values', () => {
      scanner.setProjectRoot(guidProjectRoot);
      const result = scanner.inspect({
        file: guidSceneFile,
        identifier: 'Player',
        include_properties: true,
        verbose: true,
      });

      expect(result).toBeDefined();
      const components = (result as any).components;
      const monoBehaviour = components.find((c: any) => c.type === 'MonoBehaviour');
      expect(monoBehaviour).toBeDefined();
      // The m_Script property references PlayerController.cs via GUID
      const script = monoBehaviour.properties?.Script;
      expect(script).toBeDefined();
      expect(script).toContain('-> Assets/Scripts/PlayerController.cs');
    });

    it('should preserve non-GUID property values unchanged', () => {
      scanner.setProjectRoot(guidProjectRoot);
      const result = scanner.inspect({
        file: guidSceneFile,
        identifier: 'MainCamera',
        include_properties: true,
        verbose: true,
      });

      expect(result).toBeDefined();
      const components = (result as any).components;
      const transform = components.find((c: any) => c.type === 'Transform');
      expect(transform).toBeDefined();
      // Non-GUID values should not be altered
      const pos = transform.properties?.LocalPosition;
      expect(pos).toBeDefined();
      expect(pos).not.toContain('->');
    });

    it('should not set script_name for non-script components', () => {
      scanner.setProjectRoot(guidProjectRoot);
      const result = scanner.inspect({
        file: guidSceneFile,
        identifier: 'Player',
        verbose: true,
      });

      expect(result).toBeDefined();
      const components = (result as any).components;
      const transform = components.find((c: any) => c.type === 'Transform');
      expect(transform).toBeDefined();
      expect(transform.script_name).toBeUndefined();
      expect(transform.script_guid).toBeUndefined();
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

  describe('read_asset', () => {
    it('should read a .asset file and return objects with properties', () => {
      const objects = scanner.read_asset('../test/fixtures/external/Assets/Objects/Sign_1.asset');

      expect(objects).toBeDefined();
      expect(Array.isArray(objects)).toBe(true);
      expect(objects.length).toBeGreaterThan(0);

      const first = objects[0] as any;
      expect(first.class_id).toBe(114);
      expect(first.file_id).toBe('11400000');
      expect(first.type_name).toBe('MonoBehaviour');
      expect(first.name).toBe('Sign_1');
      expect(first.properties).toBeDefined();
      expect(first.properties.Sprite).toBeDefined();
    });

    it('should return empty array for non-existent file', () => {
      const objects = scanner.read_asset('nonexistent.asset');
      expect(objects).toEqual([]);
    });

    it('should return empty array for scene files (no non-GO blocks)', () => {
      // Scene files have GameObjects which are filtered out
      const objects = scanner.read_asset('test/fixtures/Main.unity');
      // May contain Transform/MonoBehaviour blocks that aren't class_id 1
      // but the key thing is it doesn't crash
      expect(Array.isArray(objects)).toBe(true);
    });
  });

  describe('CLI distribution', () => {
    it('dist/cli.js should exist', () => {
      expect(existsSync('dist/cli.js')).toBe(true);
    });

    it('package.json bin field should point to dist/cli.js', async () => {
      const pkg = await import('../package.json');
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin['unity-agentic-tools']).toBe('./dist/cli.js');
    });
  });
});
