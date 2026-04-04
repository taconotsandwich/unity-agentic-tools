import { describe, it, expect } from 'vitest';
import { UnityDocument } from '../src/editor/unity-document';
import { reparentGameObject } from '../src/editor/update';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { create_temp_fixture } from './test-utils';

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
        expect(parentTransform?.raw).not.toContain('- {fileID: 1001}');

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
        expect(sceneRoots.raw).not.toContain('- {fileID: 1001}');
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

    it('should resolve by-id PrefabInstance to stripped Transform when available', () => {
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
        const tempPath = join(tmpdir(), 'test-reparent-pi-by-id-stripped.unity');
        writeFileSync(tempPath, sceneContent);

        const result = reparentGameObject({
            file_path: tempPath,
            object_name: '1001',
            new_parent: '11',
            by_id: true,
        });

        expect(result.success).toBe(true);
        expect(result.child_transform_id).toBe('100');

        const updatedDoc = UnityDocument.from_file(tempPath);
        const strippedTransform = updatedDoc.find_by_file_id('100');
        expect(strippedTransform?.raw).toContain('m_Father: {fileID: 11}');

        const piBlock = updatedDoc.find_by_file_id('1001');
        expect(piBlock?.raw).toContain('m_TransformParent: {fileID: 0}');

        const parentTransform = updatedDoc.find_by_file_id('11');
        expect(parentTransform?.raw).toContain('- {fileID: 100}');
        expect(parentTransform?.raw).not.toContain('- {fileID: 1001}');

        const sceneRoots = updatedDoc.find_by_class_id(166)[0];
        expect(sceneRoots.raw).not.toContain('- {fileID: 100}');
    });

    it('should reparent no-stripped PrefabInstance under another no-stripped PrefabInstance by name', () => {
        const temp_fixture = create_temp_fixture(join(__dirname, 'fixtures', 'Track1.unity'));

        try {
            const result = reparentGameObject({
                file_path: temp_fixture.temp_path,
                object_name: 'CarAI7',
                new_parent: 'CarAI6',
                by_id: false,
            });

            expect(result.success).toBe(true);

            const updatedDoc = UnityDocument.from_file(temp_fixture.temp_path);
            const childPi = updatedDoc.find_by_file_id('206181830');
            expect(childPi).not.toBeNull();
            expect(childPi?.raw).toContain('m_TransformParent: {fileID: 217752767}');
        } finally {
            temp_fixture.cleanup_fn();
        }
    });

    it('should reparent no-stripped PrefabInstance by ID without requiring stripped Transform', () => {
        const temp_fixture = create_temp_fixture(join(__dirname, 'fixtures', 'Track1.unity'));

        try {
            const result = reparentGameObject({
                file_path: temp_fixture.temp_path,
                object_name: '206181830',
                new_parent: '208971438',
                by_id: true,
            });

            expect(result.success).toBe(true);
            expect(result.child_transform_id).toBe('206181830');

            const updatedDoc = UnityDocument.from_file(temp_fixture.temp_path);
            const childPi = updatedDoc.find_by_file_id('206181830');
            const parentTransform = updatedDoc.find_by_file_id('208971439');
            expect(childPi).not.toBeNull();
            expect(parentTransform).not.toBeNull();
            expect(childPi?.raw).toContain('m_TransformParent: {fileID: 208971439}');
            expect(parentTransform?.raw).not.toContain('- {fileID: 206181830}');
        } finally {
            temp_fixture.cleanup_fn();
        }
    });

    it('should remove legacy-invalid PrefabInstance child IDs from m_Children during reparent', () => {
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
        const tempPath = join(tmpdir(), 'test-reparent-pi-cleanup-invalid-children.unity');
        writeFileSync(tempPath, sceneContent);

        const result = reparentGameObject({
            file_path: tempPath,
            object_name: '1001',
            new_parent: 'root',
            by_id: true,
        });

        expect(result.success).toBe(true);

        const updatedDoc = UnityDocument.from_file(tempPath);
        const parentTransform = updatedDoc.find_by_file_id('11');
        expect(parentTransform?.raw).not.toContain('- {fileID: 1001}');

        const piBlock = updatedDoc.find_by_file_id('1001');
        expect(piBlock?.raw).toContain('m_TransformParent: {fileID: 0}');
    });
});
