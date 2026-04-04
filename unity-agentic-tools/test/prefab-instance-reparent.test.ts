import { describe, it, expect } from 'vitest';
import { UnityDocument } from '../src/editor/unity-document';
import { reparentGameObject } from '../src/editor/update';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('reparentPrefabInstance', () => {
    it('should reparent a PrefabInstance without stripped blocks', () => {
        const sceneContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_SceneGUID: 00000000000000000000000000000000
--- !u!166 &2
SceneRoots:
  m_Roots:
  - {fileID: 11}
  - {fileID: 1001}
--- !u!1 &10
GameObject:
  m_Component:
  - component: {fileID: 11}
  m_Name: ParentGO
--- !u!4 &11
Transform:
  m_GameObject: {fileID: 10}
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 0
--- !u!1001 &1001
PrefabInstance:
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: 123, guid: 00000000000000000000000000000abc, type: 3}
      propertyPath: m_Name
      value: MyPrefab
  m_SourcePrefab: {fileID: 100100000, guid: 00000000000000000000000000000abc, type: 3}
`;
        const tempPath = join(tmpdir(), 'test-reparent-pi.unity');
        writeFileSync(tempPath, sceneContent);

        const options = {
            file_path: tempPath,
            object_name: 'MyPrefab',
            new_parent: 'ParentGO',
            by_id: false
        };

        const result = reparentGameObject(options);
        if (!result.success) console.error(JSON.stringify(result, null, 2));
        expect(result.success).toBe(true);

        const updatedDoc = UnityDocument.from_file(tempPath);
        const piBlock = updatedDoc.find_by_file_id('1001');
        expect(piBlock?.raw).toContain('m_TransformParent: {fileID: 11}');
        expect(piBlock?.raw).toContain('propertyPath: m_RootOrder');
        expect(piBlock?.raw).toContain('value: 0'); // First child

        const parentTransform = updatedDoc.find_by_file_id('11');
        expect(parentTransform?.raw).toContain('- {fileID: 1001}');

        const sceneRoots = updatedDoc.find_by_class_id(166)[0];
        expect(sceneRoots.raw).not.toContain('- {fileID: 1001}');
    });

    it('should NOT be ambiguous when stripped block exists', () => {
        const sceneContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_SceneGUID: 00000000000000000000000000000000
--- !u!166 &2
SceneRoots:
  m_Roots:
  - {fileID: 11}
  - {fileID: 100}
--- !u!1 &10
GameObject:
  m_Component:
  - component: {fileID: 11}
  m_Name: ParentGO
--- !u!4 &11
Transform:
  m_GameObject: {fileID: 10}
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 0
--- !u!4 &100 stripped
Transform:
  m_CorrespondingSourceObject: {fileID: 123, guid: 00000000000000000000000000000abc, type: 3}
  m_PrefabInstance: {fileID: 1001}
--- !u!1001 &1001
PrefabInstance:
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: 123, guid: 00000000000000000000000000000abc, type: 3}
      propertyPath: m_Name
      value: MyPrefab
  m_SourcePrefab: {fileID: 100100000, guid: 00000000000000000000000000000abc, type: 3}
`;
        const tempPath = join(tmpdir(), 'test-no-ambiguity.unity');
        writeFileSync(tempPath, sceneContent);

        const options = {
            file_path: tempPath,
            object_name: 'MyPrefab',
            new_parent: 'ParentGO',
            by_id: false
        };

        const result = reparentGameObject(options);
        if (!result.success) console.error(JSON.stringify(result, null, 2));
        expect(result.success).toBe(true);

        const updatedDoc = UnityDocument.from_file(tempPath);
        const strippedTransform = updatedDoc.find_by_file_id('100');
        expect(strippedTransform?.raw).toContain('m_Father: {fileID: 11}');

        const piBlock = updatedDoc.find_by_file_id('1001');
        // m_TransformParent in PI should be 0 because stripped transform exists and handles it
        expect(piBlock?.raw).toContain('m_TransformParent: {fileID: 0}');
    });

    it('should reparent a PrefabInstance to root', () => {
        const sceneContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_SceneGUID: 00000000000000000000000000000000
--- !u!166 &2
SceneRoots:
  m_Roots:
  - {fileID: 11}
--- !u!1 &10
GameObject:
  m_Component:
  - component: {fileID: 11}
  m_Name: ParentGO
--- !u!4 &11
Transform:
  m_GameObject: {fileID: 10}
  m_Children:
  - {fileID: 1001}
  m_Father: {fileID: 0}
  m_RootOrder: 0
--- !u!1001 &1001
PrefabInstance:
  m_Modification:
    m_TransformParent: {fileID: 11}
    m_Modifications:
    - target: {fileID: 123, guid: 00000000000000000000000000000abc, type: 3}
      propertyPath: m_Name
      value: MyPrefab
  m_SourcePrefab: {fileID: 100100000, guid: 00000000000000000000000000000abc, type: 3}
`;
        const tempPath = join(tmpdir(), 'test-reparent-pi-root.unity');
        writeFileSync(tempPath, sceneContent);

        const options = {
            file_path: tempPath,
            object_name: 'MyPrefab',
            new_parent: 'root',
            by_id: false
        };

        const result = reparentGameObject(options);
        if (!result.success) console.error(JSON.stringify(result, null, 2));
        expect(result.success).toBe(true);

        const updatedDoc = UnityDocument.from_file(tempPath);
        const piBlock = updatedDoc.find_by_file_id('1001');
        expect(piBlock?.raw).toContain('m_TransformParent: {fileID: 0}');

        const parentTransform = updatedDoc.find_by_file_id('11');
        expect(parentTransform?.raw).not.toContain('- {fileID: 1001}');

        const sceneRoots = updatedDoc.find_by_class_id(166)[0];
        expect(sceneRoots.raw).toContain('- {fileID: 1001}');
    });

    it('should detect circular parenting involving PrefabInstance', () => {
        const sceneContent = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_SceneGUID: 00000000000000000000000000000000
--- !u!166 &2
SceneRoots:
  m_Roots:
  - {fileID: 1001}
--- !u!1 &10
GameObject:
  m_Component:
  - component: {fileID: 11}
  m_Name: ChildGO
--- !u!4 &11
Transform:
  m_GameObject: {fileID: 10}
  m_Children: []
  m_Father: {fileID: 1001}
  m_RootOrder: 0
--- !u!1001 &1001
PrefabInstance:
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: 123, guid: 00000000000000000000000000000abc, type: 3}
      propertyPath: m_Name
      value: MyPrefab
  m_SourcePrefab: {fileID: 100100000, guid: 00000000000000000000000000000abc, type: 3}
`;
        const tempPath = join(tmpdir(), 'test-circular-pi.unity');
        writeFileSync(tempPath, sceneContent);

        const options = {
            file_path: tempPath,
            object_name: 'MyPrefab',
            new_parent: 'ChildGO',
            by_id: false
        };

        const result = reparentGameObject(options);
        expect(result.success).toBe(false);
        expect(result.error).toContain('circular');
    });
});
