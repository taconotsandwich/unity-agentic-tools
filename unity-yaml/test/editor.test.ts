import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { editProperty, safeUnityYAMLEdit, validateUnityYAML, batchEditProperties } from '../src/editor';
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
