import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve, join } from 'path';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { editProperty, safeUnityYAMLEdit, validateUnityYAML, batchEditProperties, createGameObject, editTransform, addComponent, createPrefabVariant } from '../src/editor';
import { create_temp_fixture } from './test-utils';
import type { TempFixture } from './test-utils';

describe('UnityEditor', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
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
                '0'
            );

            expect(result.success).toBe(true);
            expect(result.file_path).toBe(temp_fixture.temp_path);
        });

        it('should handle GameObject not found', () => {
            const result = safeUnityYAMLEdit(
                temp_fixture.temp_path,
                'NonExistent',
                'm_IsActive',
                '0'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        describe('property name normalization', () => {
            it('should handle property with m_ prefix', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_IsActive',
                    '0'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                // Should have exactly one m_IsActive: 0 for Player, not m_m_IsActive
                expect(content).not.toContain('m_m_IsActive');
            });

            it('should handle property without m_ prefix', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'IsActive',
                    '0'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).not.toContain('m_m_IsActive');
            });
        });

        describe('value with spaces', () => {
            it('should rename object with multi-word name', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Main Camera',
                    'm_Name',
                    'New Main Camera'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).toContain('m_Name: New Main Camera');
                expect(content).not.toContain('m_Name: Main Camera');
            });

            it('should replace entire multi-word value', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Directional Light',
                    'm_Name',
                    'Sun Light'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).toContain('m_Name: Sun Light');
                expect(content).not.toContain('m_Name: Directional Light');
                // Make sure we didn't leave orphaned text
                expect(content).not.toContain('Sun Light Light');
            });

            it('should handle single word to multi-word rename', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Name',
                    'Player Character'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).toContain('m_Name: Player Character');
            });
        });

        describe('different property types', () => {
            it('should edit m_TagString', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_TagString',
                    'Enemy'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                // Find the Player GameObject section and check its TagString
                const playerSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
                expect(playerSection).not.toBeNull();
                expect(playerSection![0]).toContain('m_TagString: Enemy');
            });

            it('should edit m_Layer', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Layer',
                    '8'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                const playerSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
                expect(playerSection).not.toBeNull();
                expect(playerSection![0]).toContain('m_Layer: 8');
            });

            it('should edit m_StaticEditorFlags', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Directional Light',
                    'm_StaticEditorFlags',
                    '255'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                const lightSection = content.match(/--- !u!1 &1028675095[\s\S]*?(?=--- !u!)/);
                expect(lightSection).not.toBeNull();
                expect(lightSection![0]).toContain('m_StaticEditorFlags: 255');
            });
        });

        describe('file integrity', () => {
            it('should preserve YAML header after edit', () => {
                safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Name',
                    'NewPlayer'
                );

                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content.startsWith('%YAML 1.1')).toBe(true);
                expect(content).toContain('%TAG !u! tag:unity3d.com,2011:');
            });

            it('should preserve all GameObjects after edit', () => {
                safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Name',
                    'NewPlayer'
                );

                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                // All original objects should still exist (except renamed one)
                expect(content).toContain('m_Name: Main Camera');
                expect(content).toContain('m_Name: Directional Light');
                expect(content).toContain('m_Name: GameManager');
                expect(content).toContain('m_Name: NewPlayer');
            });

            it('should preserve file IDs after edit', () => {
                const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
                const originalIds = originalContent.match(/--- !u!\d+ &\d+/g);

                safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Name',
                    'NewPlayer'
                );

                const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
                const newIds = newContent.match(/--- !u!\d+ &\d+/g);

                expect(newIds).toEqual(originalIds);
            });

            it('should preserve component references after edit', () => {
                safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Main Camera',
                    'm_Name',
                    'Primary Camera'
                );

                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                // Camera's component references should be intact
                expect(content).toContain('component: {fileID: 508316495}');
                expect(content).toContain('component: {fileID: 508316494}');
            });

            it('should preserve GUIDs after edit', () => {
                const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
                const originalGuids = originalContent.match(/guid: [a-f0-9]+/g);

                safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_TagString',
                    'NPC'
                );

                const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
                const newGuids = newContent.match(/guid: [a-f0-9]+/g);

                expect(newGuids).toEqual(originalGuids);
            });
        });

        describe('edge cases', () => {
            it('should handle empty string value', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_TagString',
                    ''
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                const playerSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
                expect(playerSection![0]).toContain('m_TagString: ');
            });

            it('should handle numeric value as string', () => {
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'Player',
                    'm_Layer',
                    '12'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                const playerSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
                expect(playerSection![0]).toContain('m_Layer: 12');
            });

            it('should handle special characters in name', () => {
                // First rename to include special chars
                const result = safeUnityYAMLEdit(
                    temp_fixture.temp_path,
                    'GameManager',
                    'm_Name',
                    'Game_Manager-v2'
                );

                expect(result.success).toBe(true);
                const content = readFileSync(temp_fixture.temp_path, 'utf-8');
                expect(content).toContain('m_Name: Game_Manager-v2');
            });
        });
    });

    describe('editProperty', () => {
        it('should edit property with validation', () => {
            const result = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Player',
                property: 'm_IsActive',
                new_value: '0'
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
                new_value: '0'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should normalize property names', () => {
            // With m_ prefix
            const result1 = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Player',
                property: 'm_Layer',
                new_value: '5'
            });
            expect(result1.success).toBe(true);

            // Without m_ prefix
            const result2 = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Player',
                property: 'Layer',
                new_value: '6'
            });
            expect(result2.success).toBe(true);

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).not.toContain('m_m_Layer');
        });
    });

    describe('batchEditProperties', () => {
        it('should edit multiple properties in sequence', () => {
            const result = batchEditProperties(temp_fixture.temp_path, [
                { object_name: 'Player', property: 'm_Name', new_value: 'Hero' },
                { object_name: 'Main Camera', property: 'm_Name', new_value: 'Game Camera' }
            ]);

            expect(result.success).toBe(true);
            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toContain('m_Name: Hero');
            expect(content).toContain('m_Name: Game Camera');
        });

        it('should fail if any edit fails', () => {
            const result = batchEditProperties(temp_fixture.temp_path, [
                { object_name: 'Player', property: 'm_Name', new_value: 'Hero' },
                { object_name: 'NonExistent', property: 'm_Name', new_value: 'Fail' }
            ]);

            expect(result.success).toBe(false);
            expect(result.error).toContain('NonExistent');
        });
    });

    describe('validateUnityYAML', () => {
        it('should validate Unity YAML header', () => {
            const valid = validateUnityYAML('%YAML 1.1\ntest content...');

            expect(valid).toBe(true);
        });

        it('should reject invalid YAML header', () => {
            const invalid = validateUnityYAML('Missing header');

            expect(invalid).toBe(false);
        });

        it('should validate proper GUID format', () => {
            const valid = validateUnityYAML(
                '%YAML 1.1\nguid: 123e4567890abcdef1234567890abcdef12'
            );

            expect(valid).toBe(true);
        });

        it('should reject invalid GUID format', () => {
            const invalid = validateUnityYAML('%YAML 1.1\nguid: 123e456');

            expect(invalid).toBe(false);
        });

        it('should validate actual Unity file content', () => {
            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            const valid = validateUnityYAML(content);

            expect(valid).toBe(true);
        });
    });

    describe('regression tests', () => {
        it('should not create m_m_ prefixed properties (bug fix)', () => {
            // This was a bug where passing m_Name created m_m_Name
            editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Main Camera',
                property: 'm_Name',
                new_value: 'Test Camera'
            });

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).not.toContain('m_m_');
            expect(content).toContain('m_Name: Test Camera');
        });

        it('should not leave orphaned text when replacing multi-word values (bug fix)', () => {
            // This was a bug where "Main Camera" -> "Test" left " Camera" orphaned
            editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Main Camera',
                property: 'm_Name',
                new_value: 'Cam'
            });

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toContain('m_Name: Cam');
            expect(content).not.toContain('m_Name: Cam Camera');
            expect(content).not.toContain('Cam Camera');
        });

        it('should correctly replace when new value contains old value as substring', () => {
            editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'Player',
                property: 'm_Name',
                new_value: 'PlayerOne'
            });

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toContain('m_Name: PlayerOne');
            // Should have exactly one occurrence
            const matches = content.match(/m_Name: PlayerOne/g);
            expect(matches?.length).toBe(1);
        });
    });
});

describe('UnityEditor with Main.unity', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'Main.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should work with larger scene files', () => {
        const result = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Main Camera',
            property: 'm_IsActive',
            new_value: '0'
        });

        expect(result.success).toBe(true);
    });

    it('should handle Instruction object edit', () => {
        const result = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Instruction',
            property: 'm_IsActive',
            new_value: '0'
        });

        expect(result.success).toBe(true);
        expect(result.file_path).toBe(temp_fixture.temp_path);
        expect(typeof result.bytes_written).toBe('number');
    });
});

describe('UnityEditor with prefab files', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SamplePrefab.prefab')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should edit prefab root object', () => {
        const result = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'EnemyPrefab',
            property: 'm_Name',
            new_value: 'BossPrefab'
        });

        expect(result.success).toBe(true);
        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: BossPrefab');
    });

    it('should edit nested prefab child object', () => {
        const result = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'HealthBar',
            property: 'm_IsActive',
            new_value: '0'
        });

        expect(result.success).toBe(true);
        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Find the HealthBar section specifically
        const healthBarSection = content.match(/--- !u!1 &\d+[\s\S]*?m_Name: HealthBar[\s\S]*?(?=--- !u!1|$)/);
        expect(healthBarSection).not.toBeNull();
        expect(healthBarSection![0]).toContain('m_IsActive: 0');
    });

    it('should preserve prefab structure after edit', () => {
        const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const originalBlockCount = (originalContent.match(/--- !u!/g) || []).length;

        editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'EnemyPrefab',
            property: 'm_Layer',
            new_value: '8'
        });

        const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const newBlockCount = (newContent.match(/--- !u!/g) || []).length;

        expect(newBlockCount).toBe(originalBlockCount);
    });
});

describe('UnityEditor error handling', () => {
    it('should return error for nonexistent file', () => {
        const result = editProperty({
            file_path: '/nonexistent/path/file.unity',
            object_name: 'Test',
            property: 'm_Name',
            new_value: 'Fail'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
    });

    it('should return error for nonexistent GameObject in valid file', () => {
        const temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );

        try {
            const result = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: 'NonExistentObject123',
                property: 'm_Name',
                new_value: 'Test'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        } finally {
            temp_fixture.cleanup_fn();
        }
    });

    it('should handle empty object name gracefully', () => {
        const temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );

        try {
            const result = editProperty({
                file_path: temp_fixture.temp_path,
                object_name: '',
                property: 'm_Name',
                new_value: 'Test'
            });

            expect(result.success).toBe(false);
        } finally {
            temp_fixture.cleanup_fn();
        }
    });
});

describe('createGameObject', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should create a new GameObject with Transform', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'NewTestObject'
        });

        expect(result.success).toBe(true);
        expect(result.game_object_id).toBeDefined();
        expect(result.transform_id).toBeDefined();
        expect(typeof result.game_object_id).toBe('number');
        expect(typeof result.transform_id).toBe('number');

        // Verify the content was actually written
        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: NewTestObject');
        expect(content).toContain(`--- !u!1 &${result.game_object_id}`);
        expect(content).toContain(`--- !u!4 &${result.transform_id}`);
    });

    it('should create GameObject with unique file IDs', () => {
        const result1 = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Object1'
        });

        const result2 = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Object2'
        });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        // All IDs should be unique
        const allIds = [
            result1.game_object_id,
            result1.transform_id,
            result2.game_object_id,
            result2.transform_id
        ];
        const uniqueIds = new Set(allIds);
        expect(uniqueIds.size).toBe(4);
    });

    it('should preserve existing content when creating', () => {
        const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const originalBlockCount = (originalContent.match(/--- !u!/g) || []).length;

        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'NewObject'
        });

        expect(result.success).toBe(true);

        const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const newBlockCount = (newContent.match(/--- !u!/g) || []).length;

        // Should have 2 more blocks (GameObject + Transform)
        expect(newBlockCount).toBe(originalBlockCount + 2);

        // Original objects should still exist
        expect(newContent).toContain('m_Name: Main Camera');
        expect(newContent).toContain('m_Name: Player');
        expect(newContent).toContain('m_Name: Directional Light');
    });

    it('should create valid Unity YAML structure', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ValidObject'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Find the new GameObject block
        const goPattern = new RegExp(`--- !u!1 &${result.game_object_id}[\\s\\S]*?(?=--- !u!|$)`);
        const goMatch = content.match(goPattern);
        expect(goMatch).not.toBeNull();

        // Check required fields in GameObject
        const goBlock = goMatch![0];
        expect(goBlock).toContain('m_ObjectHideFlags: 0');
        expect(goBlock).toContain('serializedVersion: 6');
        expect(goBlock).toContain(`component: {fileID: ${result.transform_id}}`);
        expect(goBlock).toContain('m_Name: ValidObject');
        expect(goBlock).toContain('m_TagString: Untagged');
        expect(goBlock).toContain('m_IsActive: 1');

        // Find the Transform block
        const transformPattern = new RegExp(`--- !u!4 &${result.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const transformMatch = content.match(transformPattern);
        expect(transformMatch).not.toBeNull();

        // Check required fields in Transform
        const transformBlock = transformMatch![0];
        expect(transformBlock).toContain(`m_GameObject: {fileID: ${result.game_object_id}}`);
        expect(transformBlock).toContain('m_LocalPosition: {x: 0, y: 0, z: 0}');
        expect(transformBlock).toContain('m_LocalScale: {x: 1, y: 1, z: 1}');
        expect(transformBlock).toContain('m_Father: {fileID: 0}');
    });

    it('should reject empty name', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: ''
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only name', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: '   '
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('empty');
    });

    it('should handle names with spaces', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'My New Object'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: My New Object');
    });

    it('should handle names with special characters', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Object (Clone) [1]'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: Object (Clone) [1]');
    });

    it('should return error for nonexistent file', () => {
        const result = createGameObject({
            file_path: '/nonexistent/path/file.unity',
            name: 'Test'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
    });

    it('should allow editing newly created object', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'EditableObject'
        });

        expect(createResult.success).toBe(true);

        // Now edit the new object
        const editResult = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'EditableObject',
            property: 'm_Layer',
            new_value: '5'
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Find the EditableObject section
        const objectPattern = new RegExp(`--- !u!1 &${createResult.game_object_id}[\\s\\S]*?(?=--- !u!|$)`);
        const objectMatch = content.match(objectPattern);
        expect(objectMatch).not.toBeNull();
        expect(objectMatch![0]).toContain('m_Layer: 5');
    });

    it('should create child object with parent by name', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ChildObject',
            parent: 'Player'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Child's transform should have m_Father pointing to Player's transform (1847675924)
        const childTransformPattern = new RegExp(`--- !u!4 &${result.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const childMatch = content.match(childTransformPattern);
        expect(childMatch).not.toBeNull();
        expect(childMatch![0]).toContain('m_Father: {fileID: 1847675924}');

        // Player's transform should have the child in m_Children
        const parentTransformPattern = /--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/;
        const parentMatch = content.match(parentTransformPattern);
        expect(parentMatch).not.toBeNull();
        expect(parentMatch![0]).toContain(`fileID: ${result.transform_id}`);
    });

    it('should create child object with parent by Transform fileID', () => {
        // Use Player's transform ID directly
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ChildById',
            parent: 1847675924
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Child's transform should have m_Father
        const childTransformPattern = new RegExp(`--- !u!4 &${result.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const childMatch = content.match(childTransformPattern);
        expect(childMatch).not.toBeNull();
        expect(childMatch![0]).toContain('m_Father: {fileID: 1847675924}');
    });

    it('should fail with nonexistent parent name', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Orphan',
            parent: 'NonExistentParent'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail with nonexistent parent Transform ID', () => {
        const result = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Orphan',
            parent: 9999999999
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should create nested hierarchy', () => {
        // Create parent
        const parentResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Parent'
        });
        expect(parentResult.success).toBe(true);

        // Create child
        const childResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Child',
            parent: 'Parent'
        });
        expect(childResult.success).toBe(true);

        // Create grandchild
        const grandchildResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Grandchild',
            parent: 'Child'
        });
        expect(grandchildResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Verify grandchild has Child as parent
        const grandchildPattern = new RegExp(`--- !u!4 &${grandchildResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const grandchildMatch = content.match(grandchildPattern);
        expect(grandchildMatch).not.toBeNull();
        expect(grandchildMatch![0]).toContain(`m_Father: {fileID: ${childResult.transform_id}}`);
    });
});

describe('editTransform', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should edit transform position', () => {
        // First create an object to get a known transform ID
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'PositionTest'
        });
        expect(createResult.success).toBe(true);

        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: createResult.transform_id!,
            position: { x: 10, y: 20, z: 30 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_LocalPosition: {x: 10, y: 20, z: 30}');
    });

    it('should edit transform scale', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ScaleTest'
        });
        expect(createResult.success).toBe(true);

        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: createResult.transform_id!,
            scale: { x: 2, y: 3, z: 4 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_LocalScale: {x: 2, y: 3, z: 4}');
    });

    it('should edit transform rotation with Euler angles', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'RotationTest'
        });
        expect(createResult.success).toBe(true);

        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: createResult.transform_id!,
            rotation: { x: 45, y: 90, z: 0 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Check Euler hint is set correctly
        expect(content).toContain('m_LocalEulerAnglesHint: {x: 45, y: 90, z: 0}');
        // Find the transform block and verify quaternion has changed
        const transformPattern = new RegExp(`--- !u!4 &${createResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const match = content.match(transformPattern);
        expect(match).not.toBeNull();
        // Quaternion should not be identity (0,0,0,1) - rotation was applied
        expect(match![0]).not.toMatch(/m_LocalRotation:\s*\{x: 0, y: 0, z: 0, w: 1\}/);
    });

    it('should edit multiple properties at once', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'MultiEditTest'
        });
        expect(createResult.success).toBe(true);

        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: createResult.transform_id!,
            position: { x: 5, y: 10, z: 15 },
            rotation: { x: 0, y: 180, z: 0 },
            scale: { x: 0.5, y: 0.5, z: 0.5 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_LocalPosition: {x: 5, y: 10, z: 15}');
        expect(content).toContain('m_LocalScale: {x: 0.5, y: 0.5, z: 0.5}');
        expect(content).toContain('m_LocalEulerAnglesHint: {x: 0, y: 180, z: 0}');
    });

    it('should return error for nonexistent transform ID', () => {
        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: 9999999999,
            position: { x: 1, y: 2, z: 3 }
        });

        expect(editResult.success).toBe(false);
        expect(editResult.error).toContain('not found');
    });

    it('should return error for nonexistent file', () => {
        const editResult = editTransform({
            file_path: '/nonexistent/file.unity',
            transform_id: 123,
            position: { x: 1, y: 2, z: 3 }
        });

        expect(editResult.success).toBe(false);
        expect(editResult.error).toContain('File not found');
    });

    it('should preserve other transform properties when editing position only', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'PreserveTest'
        });
        expect(createResult.success).toBe(true);

        // Edit only position
        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: createResult.transform_id!,
            position: { x: 100, y: 200, z: 300 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformPattern = new RegExp(`--- !u!4 &${createResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const match = content.match(transformPattern);
        expect(match).not.toBeNull();

        // Position should be changed
        expect(match![0]).toContain('m_LocalPosition: {x: 100, y: 200, z: 300}');
        // Scale should still be default
        expect(match![0]).toContain('m_LocalScale: {x: 1, y: 1, z: 1}');
        // Rotation should still be identity
        expect(match![0]).toContain('m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}');
    });

    it('should work with existing scene transforms', () => {
        // Player's transform ID from SampleScene.unity is 1847675924
        const editResult = editTransform({
            file_path: temp_fixture.temp_path,
            transform_id: 1847675924,
            position: { x: 99, y: 88, z: 77 }
        });

        expect(editResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Find Player's transform block
        const transformPattern = /--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/;
        const match = content.match(transformPattern);
        expect(match).not.toBeNull();
        expect(match![0]).toContain('m_LocalPosition: {x: 99, y: 88, z: 77}');
    });
});

describe('addComponent', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should add BoxCollider to existing GameObject', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'BoxCollider'
        });

        expect(result.success).toBe(true);
        expect(result.component_id).toBeDefined();

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Check component block exists
        expect(content).toContain(`--- !u!65 &${result.component_id}`);
        expect(content).toContain('BoxCollider:');
        expect(content).toContain('m_Size: {x: 1, y: 1, z: 1}');

        // Check GameObject has component reference
        const playerGoPattern = /--- !u!1 &1847675923[\s\S]*?(?=--- !u!|$)/;
        const playerMatch = content.match(playerGoPattern);
        expect(playerMatch).not.toBeNull();
        expect(playerMatch![0]).toContain(`component: {fileID: ${result.component_id}}`);
    });

    it('should add SphereCollider', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'SphereCollider'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!135 &${result.component_id}`);
        expect(content).toContain('SphereCollider:');
        expect(content).toContain('m_Radius: 0.5');
    });

    it('should add Rigidbody', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'Rigidbody'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!54 &${result.component_id}`);
        expect(content).toContain('Rigidbody:');
        expect(content).toContain('m_Mass: 1');
        expect(content).toContain('m_UseGravity: 1');
    });

    it('should add Light', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'Light'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!108 &${result.component_id}`);
        expect(content).toContain('Light:');
    });

    it('should add multiple components to same GameObject', () => {
        const result1 = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'BoxCollider'
        });

        const result2 = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'Rigidbody'
        });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Both components should exist
        expect(content).toContain('BoxCollider:');
        expect(content).toContain('Rigidbody:');

        // Both should be referenced in Player's m_Component
        const playerGoPattern = /--- !u!1 &1847675923[\s\S]*?(?=--- !u!|$)/;
        const playerMatch = content.match(playerGoPattern);
        expect(playerMatch).not.toBeNull();
        expect(playerMatch![0]).toContain(`component: {fileID: ${result1.component_id}}`);
        expect(playerMatch![0]).toContain(`component: {fileID: ${result2.component_id}}`);
    });

    it('should add component to newly created GameObject', () => {
        const createResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'NewObject'
        });
        expect(createResult.success).toBe(true);

        const componentResult = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'NewObject',
            component_type: 'CapsuleCollider'
        });

        expect(componentResult.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('CapsuleCollider:');
        expect(content).toContain('m_Height: 2');
    });

    it('should fail for nonexistent GameObject', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'NonExistent',
            component_type: 'BoxCollider'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail for nonexistent file', () => {
        const result = addComponent({
            file_path: '/nonexistent/file.unity',
            game_object_name: 'Player',
            component_type: 'BoxCollider'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
    });
});

describe('createPrefabVariant', () => {
    const sourcePrefab = resolve(__dirname, 'fixtures', 'SamplePrefab.prefab');
    const outputPath = join(tmpdir(), 'TestVariant.prefab');

    afterEach(() => {
        // Clean up created files
        try {
            unlinkSync(outputPath);
            unlinkSync(outputPath + '.meta');
        } catch {
            // Ignore if files don't exist
        }
    });

    it('should create a prefab variant from source prefab', () => {
        const result = createPrefabVariant({
            source_prefab: sourcePrefab,
            output_path: outputPath
        });

        expect(result.success).toBe(true);
        expect(result.source_guid).toBe('a1b2c3d4e5f6789012345678abcdef12');
        expect(result.prefab_instance_id).toBeDefined();

        // Verify the variant file was created
        const content = readFileSync(outputPath, 'utf-8');
        expect(content).toContain('%YAML 1.1');
        expect(content).toContain('PrefabInstance:');
        expect(content).toContain('stripped');
        expect(content).toContain('m_SourcePrefab:');
        expect(content).toContain('guid: a1b2c3d4e5f6789012345678abcdef12');

        // Verify default name is "EnemyPrefab Variant"
        expect(content).toContain('value: EnemyPrefab Variant');
    });

    it('should create variant with custom name', () => {
        const result = createPrefabVariant({
            source_prefab: sourcePrefab,
            output_path: outputPath,
            variant_name: 'BossEnemy'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(outputPath, 'utf-8');
        expect(content).toContain('value: BossEnemy');
    });

    it('should create .meta file for variant', () => {
        const result = createPrefabVariant({
            source_prefab: sourcePrefab,
            output_path: outputPath
        });

        expect(result.success).toBe(true);

        // Verify meta file exists and has valid GUID
        const metaContent = readFileSync(outputPath + '.meta', 'utf-8');
        expect(metaContent).toContain('fileFormatVersion: 2');
        expect(metaContent).toContain('guid:');
        expect(metaContent).toContain('PrefabImporter:');

        // GUID should be 32 hex characters
        const guidMatch = metaContent.match(/guid:\s*([a-f0-9]+)/);
        expect(guidMatch).not.toBeNull();
        expect(guidMatch![1]).toHaveLength(32);
    });

    it('should have proper PrefabInstance structure', () => {
        const result = createPrefabVariant({
            source_prefab: sourcePrefab,
            output_path: outputPath
        });

        expect(result.success).toBe(true);

        const content = readFileSync(outputPath, 'utf-8');

        // Check stripped GameObject references source
        expect(content).toMatch(/--- !u!1 &\d+ stripped/);
        expect(content).toContain('m_CorrespondingSourceObject: {fileID: 100000');

        // Check stripped Transform references source
        expect(content).toMatch(/--- !u!4 &\d+ stripped/);
        expect(content).toContain('m_CorrespondingSourceObject: {fileID: 400000');

        // Check PrefabInstance block
        expect(content).toMatch(/--- !u!1001 &\d+/);
        expect(content).toContain('m_SourcePrefab: {fileID: 100100000');
    });

    it('should fail for nonexistent source prefab', () => {
        const result = createPrefabVariant({
            source_prefab: '/nonexistent/source.prefab',
            output_path: outputPath
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail for non-prefab source file', () => {
        const result = createPrefabVariant({
            source_prefab: resolve(__dirname, 'fixtures', 'SampleScene.unity'),
            output_path: outputPath
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('.prefab');
    });

    it('should fail for non-prefab output path', () => {
        const result = createPrefabVariant({
            source_prefab: sourcePrefab,
            output_path: join(tmpdir(), 'output.unity')
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('.prefab');
    });

    it('should fail if source has no .meta file', () => {
        // Create a temp prefab without .meta
        const tempPrefab = join(tmpdir(), 'NoMeta.prefab');
        const fs = require('fs');
        fs.writeFileSync(tempPrefab, readFileSync(sourcePrefab, 'utf-8'));

        try {
            const result = createPrefabVariant({
                source_prefab: tempPrefab,
                output_path: outputPath
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('.meta');
        } finally {
            try { fs.unlinkSync(tempPrefab); } catch { /* ignore */ }
        }
    });
});

describe('UnityEditor special cases', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should handle object names with regex special characters', () => {
        // First rename to include special chars
        const result1 = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            property: 'm_Name',
            new_value: 'Player (Clone)'
        });
        expect(result1.success).toBe(true);

        // Now edit the object with special chars in name
        const result2 = editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Player (Clone)',
            property: 'm_Layer',
            new_value: '5'
        });
        expect(result2.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: Player (Clone)');
    });

    it('should handle consecutive edits to same object', () => {
        editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            property: 'm_Name',
            new_value: 'Hero'
        });

        editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Hero',
            property: 'm_Layer',
            new_value: '10'
        });

        editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Hero',
            property: 'm_TagString',
            new_value: 'Enemy'
        });

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const heroSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
        expect(heroSection).not.toBeNull();
        expect(heroSection![0]).toContain('m_Name: Hero');
        expect(heroSection![0]).toContain('m_Layer: 10');
        expect(heroSection![0]).toContain('m_TagString: Enemy');
    });

    it('should not affect other objects when editing one', () => {
        const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const originalLightSection = originalContent.match(/--- !u!1 &1028675095[\s\S]*?(?=--- !u!)/);

        editProperty({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            property: 'm_Name',
            new_value: 'ModifiedPlayer'
        });

        const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const newLightSection = newContent.match(/--- !u!1 &1028675095[\s\S]*?(?=--- !u!)/);

        // Directional Light section should be unchanged
        expect(newLightSection![0]).toBe(originalLightSection![0]);
    });
});
