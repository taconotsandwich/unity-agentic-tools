import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve, join } from 'path';
import { readFileSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { editProperty, safeUnityYAMLEdit, validateUnityYAML, batchEditProperties, createGameObject, editTransform, addComponent, createPrefabVariant, editComponentByFileId, removeComponent, deleteGameObject, copyComponent, duplicateGameObject, createScriptableObject, unpackPrefab, reparentGameObject, createMetaFile } from '../src/editor';
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

        it('should handle 5+ edits across multiple objects in single pass', () => {
            const result = batchEditProperties(temp_fixture.temp_path, [
                { object_name: 'Player', property: 'm_Name', new_value: 'Hero' },
                { object_name: 'Player', property: 'm_Layer', new_value: '5' },
                { object_name: 'Player', property: 'm_TagString', new_value: 'NPC' },
                { object_name: 'Main Camera', property: 'm_Name', new_value: 'Cam' },
                { object_name: 'Main Camera', property: 'm_Layer', new_value: '8' },
                { object_name: 'Directional Light', property: 'm_StaticEditorFlags', new_value: '255' }
            ]);

            expect(result.success).toBe(true);

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toContain('m_Name: Hero');
            expect(content).toContain('m_Name: Cam');
            // Verify Player block has multiple edits
            const heroSection = content.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
            expect(heroSection).not.toBeNull();
            expect(heroSection![0]).toContain('m_Layer: 5');
            expect(heroSection![0]).toContain('m_TagString: NPC');
            // Verify Light edit
            expect(content).toMatch(/m_StaticEditorFlags: 255/);
        });

        it('should not leave partial edits on failure', () => {
            const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');

            const result = batchEditProperties(temp_fixture.temp_path, [
                { object_name: 'Player', property: 'm_Name', new_value: 'Hero' },
                { object_name: 'NonExistent', property: 'm_Name', new_value: 'Fail' }
            ]);

            expect(result.success).toBe(false);

            // File should be unchanged since the batch failed before writing
            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toBe(originalContent);
        });

        it('should succeed with an empty edits array', () => {
            const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');

            const result = batchEditProperties(temp_fixture.temp_path, []);

            expect(result.success).toBe(true);

            // File content should be unchanged
            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toBe(originalContent);
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
        // Check component block exists with correct class ID and type
        expect(content).toContain(`--- !u!65 &${result.component_id}`);
        expect(content).toContain('BoxCollider:');
        expect(content).toContain(`m_GameObject: {fileID: 1847675923}`);

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
        expect(content).toContain('m_Enabled: 1');
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
        expect(content).toContain('m_Enabled: 1');
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

    it('should add MeshRenderer (generic component)', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'MeshRenderer'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!23 &${result.component_id}`);
        expect(content).toContain('MeshRenderer:');
        expect(content).toContain('m_Enabled: 1');
    });

    it('should add Animator (generic component)', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'Animator'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!95 &${result.component_id}`);
        expect(content).toContain('Animator:');
    });

    it('should add Canvas (generic component)', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'Canvas'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!223 &${result.component_id}`);
        expect(content).toContain('Canvas:');
    });

    it('should add component with case-insensitive name', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'meshfilter'  // lowercase
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain(`--- !u!33 &${result.component_id}`);
        expect(content).toContain('MeshFilter:');  // Uses canonical name
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
        expect(content).toContain('m_Enabled: 1');
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

    // Custom script tests
    it('should add custom script by GUID', () => {
        const testGuid = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: testGuid
        });

        expect(result.success).toBe(true);
        expect(result.component_id).toBeDefined();
        expect(result.script_guid).toBe(testGuid);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Check MonoBehaviour block exists with class ID 114
        expect(content).toContain(`--- !u!114 &${result.component_id}`);
        expect(content).toContain('MonoBehaviour:');
        expect(content).toContain(`guid: ${testGuid}`);
        expect(content).toContain('fileID: 11500000');
    });

    it('should add script by path with .meta file', () => {
        // Create a temporary script with .meta file
        const scriptDir = join(tmpdir(), 'test-unity-project', 'Assets', 'Scripts');
        const scriptPath = join(scriptDir, 'TestScript.cs');
        const metaPath = scriptPath + '.meta';
        const testGuid = 'deadbeef12345678deadbeef12345678';

        mkdirSync(scriptDir, { recursive: true });
        writeFileSync(scriptPath, 'public class TestScript : MonoBehaviour {}');
        writeFileSync(metaPath, `fileFormatVersion: 2\nguid: ${testGuid}\n`);

        try {
            const result = addComponent({
                file_path: temp_fixture.temp_path,
                game_object_name: 'Player',
                component_type: scriptPath
            });

            expect(result.success).toBe(true);
            expect(result.script_guid).toBe(testGuid);
            expect(result.script_path).toBe(scriptPath);

            const content = readFileSync(temp_fixture.temp_path, 'utf-8');
            expect(content).toContain('MonoBehaviour:');
            expect(content).toContain(`guid: ${testGuid}`);
        } finally {
            rmSync(join(tmpdir(), 'test-unity-project'), { recursive: true, force: true });
        }
    });

    it('should add script by name from GUID cache', () => {
        // Create a mock Unity project with GUID cache
        const projectDir = join(tmpdir(), 'test-unity-cache-project');
        const cacheDir = join(projectDir, '.unity-agentic');
        const cachePath = join(cacheDir, 'guid-cache.json');
        const testGuid = 'cafebabe12345678cafebabe12345678';

        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cachePath, JSON.stringify({
            [testGuid]: 'Assets/Scripts/PlayerController.cs'
        }));

        try {
            const result = addComponent({
                file_path: temp_fixture.temp_path,
                game_object_name: 'Player',
                component_type: 'PlayerController',
                project_path: projectDir
            });

            expect(result.success).toBe(true);
            expect(result.script_guid).toBe(testGuid);
            expect(result.script_path).toBe('Assets/Scripts/PlayerController.cs');
        } finally {
            rmSync(projectDir, { recursive: true, force: true });
        }
    });

    it('should fail for unknown script without project path', () => {
        const result = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'SomeUnknownScript'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Component or script not found');
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

// ========== Remove Component Tests ==========

describe('removeComponent', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should remove a MonoBehaviour component', () => {
        // Player's MonoBehaviour is fileID 1847675927
        const result = removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: '1847675927'
        });

        expect(result.success).toBe(true);
        expect(result.removed_file_id).toBe('1847675927');
        expect(result.removed_class_id).toBe(114);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Block should be removed
        expect(content).not.toContain('--- !u!114 &1847675927');
        // Component reference should be removed from Player GO
        expect(content).not.toContain('component: {fileID: 1847675927}');
        // Player GO should still exist
        expect(content).toContain('m_Name: Player');
    });

    it('should remove a collider component', () => {
        // First add a BoxCollider to Player, then remove it
        const addResult = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'BoxCollider'
        });
        expect(addResult.success).toBe(true);

        const result = removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: String(addResult.component_id!)
        });

        expect(result.success).toBe(true);
        expect(result.removed_class_id).toBe(65);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).not.toContain(`--- !u!65 &${addResult.component_id}`);
    });

    it('should reject Transform removal', () => {
        // Player's Transform is fileID 1847675924
        const result = removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Transform');
    });

    it('should reject GameObject removal', () => {
        // Player's GO is fileID 1847675923
        const result = removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: '1847675923'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('GameObject');
    });

    it('should fail for nonexistent fileId', () => {
        const result = removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: '9999999999'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should preserve file integrity after removal', () => {
        removeComponent({
            file_path: temp_fixture.temp_path,
            file_id: '1847675927'
        });

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content.startsWith('%YAML 1.1')).toBe(true);
        expect(validateUnityYAML(content)).toBe(true);
        // Other objects should still exist
        expect(content).toContain('m_Name: Main Camera');
        expect(content).toContain('m_Name: Directional Light');
        expect(content).toContain('m_Name: GameManager');
    });
});

// ========== Delete GameObject Tests ==========

describe('deleteGameObject', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should delete a leaf GameObject (no children)', () => {
        const result = deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'GameManager'
        });

        expect(result.success).toBe(true);
        expect(result.deleted_count).toBeGreaterThan(0);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).not.toContain('m_Name: GameManager');
        expect(content).not.toContain('--- !u!1 &2094567890');
        expect(content).not.toContain('--- !u!4 &2094567891');
        expect(content).not.toContain('--- !u!114 &2094567892');
    });

    it('should delete a GameObject with children recursively', () => {
        // Create parent → child hierarchy
        const parentResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Parent'
        });
        expect(parentResult.success).toBe(true);

        const childResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Child',
            parent: 'Parent'
        });
        expect(childResult.success).toBe(true);

        // Now delete parent - should remove both parent and child
        const result = deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Parent'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).not.toContain('m_Name: Parent');
        expect(content).not.toContain('m_Name: Child');
    });

    it('should delete a root object (no parent)', () => {
        const result = deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Directional Light'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).not.toContain('m_Name: Directional Light');
        // Other objects should remain
        expect(content).toContain('m_Name: Main Camera');
        expect(content).toContain('m_Name: Player');
    });

    it('should fail for object not found', () => {
        const result = deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'NonExistent'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should preserve file integrity after deletion', () => {
        deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player'
        });

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content.startsWith('%YAML 1.1')).toBe(true);
        expect(validateUnityYAML(content)).toBe(true);
    });

    it('should detach from parent when deleting child', () => {
        // Create parent → child
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'TestParent'
        });

        const childResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'TestChild',
            parent: 'TestParent'
        });
        expect(childResult.success).toBe(true);

        // Delete only the child
        const result = deleteGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'TestChild'
        });
        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: TestParent');
        expect(content).not.toContain('m_Name: TestChild');
        // Parent should not reference the deleted child
        expect(content).not.toContain(`fileID: ${childResult.transform_id}`);
    });
});

// ========== Copy Component Tests ==========

describe('copyComponent', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should copy a MonoBehaviour to a different GO', () => {
        // Copy Player's MonoBehaviour (1847675927) to GameManager
        const result = copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: '1847675927',
            target_game_object_name: 'GameManager'
        });

        expect(result.success).toBe(true);
        expect(result.new_component_id).toBeDefined();
        expect(result.target_game_object).toBe('GameManager');

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // New block should exist
        expect(content).toContain(`--- !u!114 &${result.new_component_id}`);
        // Should reference GameManager's GO ID
        expect(content).toContain(`m_GameObject: {fileID: 2094567890}`);
        // Original should still exist
        expect(content).toContain('--- !u!114 &1847675927');
    });

    it('should copy a component to the same GO', () => {
        // Add a BoxCollider to Player first
        const addResult = addComponent({
            file_path: temp_fixture.temp_path,
            game_object_name: 'Player',
            component_type: 'BoxCollider'
        });
        expect(addResult.success).toBe(true);

        // Copy the BoxCollider to Player itself
        const result = copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: String(addResult.component_id!),
            target_game_object_name: 'Player'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Both the original and copy should exist
        expect(content).toContain(`--- !u!65 &${addResult.component_id}`);
        expect(content).toContain(`--- !u!65 &${result.new_component_id}`);
    });

    it('should verify source unchanged after copy', () => {
        const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const originalBlock = originalContent.match(/--- !u!114 &1847675927[\s\S]*?(?=--- !u!|$)/);

        copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: '1847675927',
            target_game_object_name: 'GameManager'
        });

        const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const newBlock = newContent.match(/--- !u!114 &1847675927[\s\S]*?(?=--- !u!|$)/);
        expect(newBlock![0]).toBe(originalBlock![0]);
    });

    it('should reject Transform copy', () => {
        const result = copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: '1847675924',
            target_game_object_name: 'GameManager'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Transform');
    });

    it('should fail for nonexistent source', () => {
        const result = copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: '9999999999',
            target_game_object_name: 'GameManager'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail for nonexistent target', () => {
        const result = copyComponent({
            file_path: temp_fixture.temp_path,
            source_file_id: '1847675927',
            target_game_object_name: 'NonExistent'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

// ========== Duplicate GameObject Tests ==========

describe('duplicateGameObject', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should duplicate a flat GO (no children)', () => {
        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'GameManager'
        });

        expect(result.success).toBe(true);
        expect(result.game_object_id).toBeDefined();
        expect(result.transform_id).toBeDefined();
        expect(result.total_duplicated).toBeGreaterThan(0);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Original should still exist
        expect(content).toContain('m_Name: GameManager');
        // Clone should have default name
        expect(content).toContain('m_Name: GameManager (1)');
    });

    it('should duplicate with custom name', () => {
        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            new_name: 'Player2'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: Player');
        expect(content).toContain('m_Name: Player2');
    });

    it('should duplicate with hierarchy', () => {
        // Create parent → child
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'DupParent'
        });
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'DupChild',
            parent: 'DupParent'
        });

        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'DupParent',
            new_name: 'DupParentCopy'
        });

        expect(result.success).toBe(true);
        expect(result.total_duplicated).toBeGreaterThanOrEqual(4); // parent GO + Transform + child GO + Transform

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: DupParentCopy');
    });

    it('should use default "(1)" name when no new_name provided', () => {
        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content).toContain('m_Name: Player (1)');
    });

    it('should remap internal refs but preserve external refs', () => {
        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            new_name: 'PlayerClone'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');

        // Cloned Transform should reference cloned GO
        const clonedTransformPattern = new RegExp(`--- !u!4 &${result.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const clonedTransform = content.match(clonedTransformPattern);
        expect(clonedTransform).not.toBeNull();
        expect(clonedTransform![0]).toContain(`m_GameObject: {fileID: ${result.game_object_id}}`);

        // Cloned GO should reference cloned Transform
        const clonedGoPattern = new RegExp(`--- !u!1 &${result.game_object_id}[\\s\\S]*?(?=--- !u!|$)`);
        const clonedGo = content.match(clonedGoPattern);
        expect(clonedGo).not.toBeNull();
        expect(clonedGo![0]).toContain(`component: {fileID: ${result.transform_id}}`);
    });

    it('should verify original unchanged', () => {
        const originalContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const originalPlayerBlock = originalContent.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);

        duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            new_name: 'PlayerClone'
        });

        const newContent = readFileSync(temp_fixture.temp_path, 'utf-8');
        const newPlayerBlock = newContent.match(/--- !u!1 &1847675923[\s\S]*?(?=--- !u!)/);
        expect(newPlayerBlock![0]).toBe(originalPlayerBlock![0]);
    });

    it('should fail for object not found', () => {
        const result = duplicateGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'NonExistent'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

// ========== Create ScriptableObject Tests ==========

describe('createScriptableObject', () => {
    const outputPath = join(tmpdir(), 'TestSO.asset');

    afterEach(() => {
        try {
            unlinkSync(outputPath);
            unlinkSync(outputPath + '.meta');
        } catch { /* ignore */ }
    });

    it('should create with raw GUID', () => {
        const testGuid = 'aabbccdd11223344aabbccdd11223344';
        const result = createScriptableObject({
            output_path: outputPath,
            script: testGuid
        });

        expect(result.success).toBe(true);
        expect(result.script_guid).toBe(testGuid);
        expect(result.asset_guid).toBeDefined();
        expect(result.asset_guid).toHaveLength(32);
    });

    it('should create valid YAML structure', () => {
        const testGuid = 'aabbccdd11223344aabbccdd11223344';
        createScriptableObject({
            output_path: outputPath,
            script: testGuid
        });

        const content = readFileSync(outputPath, 'utf-8');
        expect(content).toContain('%YAML 1.1');
        expect(content).toContain('--- !u!114 &11400000');
        expect(content).toContain('MonoBehaviour:');
        expect(content).toContain(`guid: ${testGuid}`);
        expect(content).toContain('m_Name: TestSO');
        expect(content).toContain('m_GameObject: {fileID: 0}');
    });

    it('should create .meta file', () => {
        const testGuid = 'aabbccdd11223344aabbccdd11223344';
        const result = createScriptableObject({
            output_path: outputPath,
            script: testGuid
        });

        expect(result.success).toBe(true);

        const metaContent = readFileSync(outputPath + '.meta', 'utf-8');
        expect(metaContent).toContain('fileFormatVersion: 2');
        expect(metaContent).toContain('guid:');
        const guidMatch = metaContent.match(/guid:\s*([a-f0-9]+)/);
        expect(guidMatch).not.toBeNull();
        expect(guidMatch![1]).toHaveLength(32);
    });

    it('should have m_GameObject: {fileID: 0}', () => {
        const testGuid = 'aabbccdd11223344aabbccdd11223344';
        createScriptableObject({
            output_path: outputPath,
            script: testGuid
        });

        const content = readFileSync(outputPath, 'utf-8');
        expect(content).toContain('m_GameObject: {fileID: 0}');
    });

    it('should error on non-.asset path', () => {
        const result = createScriptableObject({
            output_path: join(tmpdir(), 'TestSO.unity'),
            script: 'aabbccdd11223344aabbccdd11223344'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('.asset');
    });

    it('should error on bad script', () => {
        const result = createScriptableObject({
            output_path: outputPath,
            script: 'NonExistentScript'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

// ========== Unpack Prefab Tests ==========

describe('unpackPrefab', () => {
    let temp_fixture: TempFixture;
    const projectDir = join(tmpdir(), 'test-unpack-project');
    const cacheDir = join(projectDir, '.unity-agentic');
    const cachePath = join(cacheDir, 'guid-cache.json');

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SceneWithPrefab.unity')
        );
        // Set up mock project with GUID cache pointing to the actual prefab fixture
        mkdirSync(cacheDir, { recursive: true });
        const prefabFixturePath = resolve(__dirname, 'fixtures', 'SamplePrefab.prefab');
        // The cache maps GUID → relative path, but we'll use an absolute path trick
        // by making project_path empty and storing absolute path in cache
        writeFileSync(cachePath, JSON.stringify({
            'a1b2c3d4e5f6789012345678abcdef12': prefabFixturePath
        }));
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
        rmSync(projectDir, { recursive: true, force: true });
    });

    it('should unpack a prefab instance by fileID', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: '700000',
            project_path: projectDir
        });

        expect(result.success).toBe(true);
        expect(result.unpacked_count).toBeGreaterThan(0);
        expect(result.root_game_object_id).toBeDefined();

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // PrefabInstance block should be removed
        expect(content).not.toContain('--- !u!1001 &700000');
        // Stripped blocks should be removed
        expect(content).not.toContain('stripped');
        // Standalone GO blocks should exist
        expect(content).toContain('m_Name: MyEnemy');
        // Should still have the camera
        expect(content).toContain('m_Name: Main Camera');
    });

    it('should unpack by name from modifications', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: 'MyEnemy',
            project_path: projectDir
        });

        expect(result.success).toBe(true);
        expect(result.unpacked_count).toBeGreaterThan(0);
    });

    it('should apply modifications to cloned blocks', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: '700000',
            project_path: projectDir
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // Name modification should be applied
        expect(content).toContain('m_Name: MyEnemy');
    });

    it('should fail for nonexistent prefab instance', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: '9999999',
            project_path: projectDir
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail without project path', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: '700000'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('resolve');
    });

    it('should preserve file integrity after unpack', () => {
        const result = unpackPrefab({
            file_path: temp_fixture.temp_path,
            prefab_instance: '700000',
            project_path: projectDir
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        expect(content.startsWith('%YAML 1.1')).toBe(true);
        expect(validateUnityYAML(content)).toBe(true);
    });
});

// ========== Edit Component by FileId (Dotted/Array Path) Tests ==========

describe('editComponentByFileId', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should edit a simple property (backwards compat)', () => {
        // Edit Player's Transform (1847675924) m_ConstrainProportionsScale
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924',
            property: 'm_ConstrainProportionsScale',
            new_value: '1'
        });

        expect(result.success).toBe(true);
        expect(result.class_id).toBe(4);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformBlock = content.match(/--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/);
        expect(transformBlock).not.toBeNull();
        expect(transformBlock![0]).toContain('m_ConstrainProportionsScale: 1');
    });

    it('should edit a dotted path (inline object field)', () => {
        // Edit Player's Transform m_LocalPosition.x (currently {x: 0, y: 0.5, z: 0})
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924',
            property: 'm_LocalPosition.x',
            new_value: '42'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformBlock = content.match(/--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/);
        expect(transformBlock).not.toBeNull();
        expect(transformBlock![0]).toContain('m_LocalPosition: {x: 42, y: 0.5, z: 0}');
    });

    it('should edit an array path', () => {
        // Edit Player's MeshRenderer (1847675926) m_Materials.Array.data[0]
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675926',
            property: 'm_Materials.Array.data[0]',
            new_value: '{fileID: 99999, guid: aaaa0000bbbb1111cccc2222dddd3333, type: 2}'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const rendererBlock = content.match(/--- !u!23 &1847675926[\s\S]*?(?=--- !u!|$)/);
        expect(rendererBlock).not.toBeNull();
        expect(rendererBlock![0]).toContain('guid: aaaa0000bbbb1111cccc2222dddd3333');
    });

    it('should auto-prepend m_ prefix for dotted paths without it', () => {
        // Use "LocalPosition.y" without m_ prefix — should still work
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924',
            property: 'LocalPosition.y',
            new_value: '99'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformBlock = content.match(/--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/);
        expect(transformBlock).not.toBeNull();
        expect(transformBlock![0]).toContain('m_LocalPosition: {x: 0, y: 99, z: 0}');
    });

    it('should edit non-m_ properties via fallback path', () => {
        // serializedVersion doesn't have m_ prefix — tests the fallback logic
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924',
            property: 'serializedVersion',
            new_value: '99'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformBlock = content.match(/--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/);
        expect(transformBlock).not.toBeNull();
        expect(transformBlock![0]).toContain('serializedVersion: 99');
    });

    it('should append a property that does not exist', () => {
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '1847675924',
            property: 'm_NewCustomProp',
            new_value: 'hello'
        });

        expect(result.success).toBe(true);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const transformBlock = content.match(/--- !u!4 &1847675924[\s\S]*?(?=--- !u!|$)/);
        expect(transformBlock).not.toBeNull();
        expect(transformBlock![0]).toContain('m_NewCustomProp: hello');
    });

    it('should return error for non-existent file', () => {
        const result = editComponentByFileId({
            file_path: '/tmp/no-such-file-ever.unity',
            file_id: '1847675924',
            property: 'm_IsActive',
            new_value: '0'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
    });

    it('should return error for non-existent file ID', () => {
        const result = editComponentByFileId({
            file_path: temp_fixture.temp_path,
            file_id: '9999999999',
            property: 'm_IsActive',
            new_value: '0'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

// ========== Reparent GameObject Tests ==========

describe('reparentGameObject', () => {
    let temp_fixture: TempFixture;

    beforeEach(() => {
        temp_fixture = create_temp_fixture(
            resolve(__dirname, 'fixtures', 'SampleScene.unity')
        );
    });

    afterEach(() => {
        temp_fixture.cleanup_fn();
    });

    it('should reparent to a new parent', () => {
        // Create A and B, then reparent B under A
        const aResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ParentA'
        });
        expect(aResult.success).toBe(true);

        const bResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'ChildB'
        });
        expect(bResult.success).toBe(true);

        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'ChildB',
            new_parent: 'ParentA'
        });

        expect(result.success).toBe(true);
        expect(result.new_parent_transform_id).toBe(aResult.transform_id);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        // ChildB's Transform should have m_Father pointing to ParentA's transform
        const childPattern = new RegExp(`--- !u!4 &${bResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const childMatch = content.match(childPattern);
        expect(childMatch).not.toBeNull();
        expect(childMatch![0]).toContain(`m_Father: {fileID: ${aResult.transform_id}}`);

        // ParentA's Transform should list ChildB in m_Children
        const parentPattern = new RegExp(`--- !u!4 &${aResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const parentMatch = content.match(parentPattern);
        expect(parentMatch).not.toBeNull();
        expect(parentMatch![0]).toContain(`fileID: ${bResult.transform_id}`);
    });

    it('should reparent to root', () => {
        // Create parent → child, then reparent child to root
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'TempParent'
        });
        const childResult = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'TempChild',
            parent: 'TempParent'
        });
        expect(childResult.success).toBe(true);

        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'TempChild',
            new_parent: 'root'
        });

        expect(result.success).toBe(true);
        expect(result.new_parent_transform_id).toBe(0);

        const content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const childPattern = new RegExp(`--- !u!4 &${childResult.transform_id}[\\s\\S]*?(?=--- !u!|$)`);
        const childMatch = content.match(childPattern);
        expect(childMatch).not.toBeNull();
        expect(childMatch![0]).toContain('m_Father: {fileID: 0}');
    });

    it('should prevent circular parenting', () => {
        // Create A → B hierarchy
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'CircleA'
        });
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'CircleB',
            parent: 'CircleA'
        });

        // Try to reparent A under B (would create cycle)
        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'CircleA',
            new_parent: 'CircleB'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('circular');
    });

    it('should prevent self-parenting', () => {
        createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'SelfRef'
        });

        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'SelfRef',
            new_parent: 'SelfRef'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('itself');
    });

    it('should transfer from one parent to another', () => {
        // Create two parents and a child under the first
        const parent1 = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Parent1'
        });
        expect(parent1.success).toBe(true);

        const parent2 = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'Parent2'
        });
        expect(parent2.success).toBe(true);

        const child = createGameObject({
            file_path: temp_fixture.temp_path,
            name: 'TransferChild',
            parent: 'Parent1'
        });
        expect(child.success).toBe(true);

        // Verify child is under Parent1
        let content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const p1Block = content.match(new RegExp(`--- !u!4 &${parent1.transform_id}[\\s\\S]*?(?=--- !u!|$)`));
        expect(p1Block![0]).toContain(`fileID: ${child.transform_id}`);

        // Reparent child from Parent1 to Parent2
        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'TransferChild',
            new_parent: 'Parent2'
        });

        expect(result.success).toBe(true);
        expect(result.old_parent_transform_id).toBe(parent1.transform_id);
        expect(result.new_parent_transform_id).toBe(parent2.transform_id);

        // Verify child is now under Parent2
        content = readFileSync(temp_fixture.temp_path, 'utf-8');
        const childBlock = content.match(new RegExp(`--- !u!4 &${child.transform_id}[\\s\\S]*?(?=--- !u!|$)`));
        expect(childBlock![0]).toContain(`m_Father: {fileID: ${parent2.transform_id}}`);

        // Parent1 should no longer list the child
        const p1Updated = content.match(new RegExp(`--- !u!4 &${parent1.transform_id}[\\s\\S]*?(?=--- !u!|$)`));
        expect(p1Updated![0]).not.toContain(`fileID: ${child.transform_id}`);

        // Parent2 should now list the child
        const p2Updated = content.match(new RegExp(`--- !u!4 &${parent2.transform_id}[\\s\\S]*?(?=--- !u!|$)`));
        expect(p2Updated![0]).toContain(`fileID: ${child.transform_id}`);
    });

    it('should fail for nonexistent child', () => {
        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'NonExistent',
            new_parent: 'Player'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('should fail for nonexistent new parent', () => {
        const result = reparentGameObject({
            file_path: temp_fixture.temp_path,
            object_name: 'Player',
            new_parent: 'NonExistent'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });
});

// ========== Create .meta File Tests ==========

describe('createMetaFile', () => {
    const scriptDir = join(tmpdir(), 'test-meta-gen');
    const scriptPath = join(scriptDir, 'TestScript.cs');

    beforeEach(() => {
        mkdirSync(scriptDir, { recursive: true });
        writeFileSync(scriptPath, 'public class TestScript : MonoBehaviour {}');
    });

    afterEach(() => {
        rmSync(scriptDir, { recursive: true, force: true });
    });

    it('should create a valid .meta file', () => {
        const result = createMetaFile({ script_path: scriptPath });

        expect(result.success).toBe(true);
        expect(result.guid).toBeDefined();
        expect(result.meta_path).toBe(scriptPath + '.meta');

        const content = readFileSync(result.meta_path, 'utf-8');
        expect(content).toContain('fileFormatVersion: 2');
        expect(content).toContain(`guid: ${result.guid}`);
        expect(content).toContain('MonoImporter:');
        expect(content).toContain('serializedVersion: 2');
        expect(content).toContain('executionOrder: 0');
    });

    it('should generate a 32-char lowercase hex GUID', () => {
        const result = createMetaFile({ script_path: scriptPath });

        expect(result.success).toBe(true);
        expect(result.guid).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should not overwrite existing .meta file', () => {
        // Create the first .meta
        const result1 = createMetaFile({ script_path: scriptPath });
        expect(result1.success).toBe(true);

        // Try to create again — should fail
        const result2 = createMetaFile({ script_path: scriptPath });
        expect(result2.success).toBe(false);
        expect(result2.error).toContain('already exists');
    });

    it('should generate unique GUIDs across calls', () => {
        const script2 = join(scriptDir, 'Script2.cs');
        writeFileSync(script2, 'public class Script2 : MonoBehaviour {}');

        const result1 = createMetaFile({ script_path: scriptPath });
        const result2 = createMetaFile({ script_path: script2 });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result1.guid).not.toBe(result2.guid);
    });
});
