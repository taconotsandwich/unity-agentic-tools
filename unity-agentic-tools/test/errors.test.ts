import { describe, expect, it } from 'vitest';
import { validate_file_path, validate_vector3, validate_guid, validate_name } from '../src/utils';

describe('Path Security Validation', () => {
    describe('validate_file_path()', () => {
        describe('Absolute paths (allowed for CLI tools)', () => {
            it('allows Unix absolute paths', () => {
                const error = validate_file_path('/tmp/scene.unity', 'write');
                expect(error).toBeNull();
            });

            it('allows Windows absolute paths (C:)', () => {
                const error = validate_file_path('C:\\Projects\\scene.unity', 'write');
                expect(error).toBeNull();
            });

            it('allows Windows absolute paths (D:)', () => {
                const error = validate_file_path('D:/Unity/scene.unity', 'write');
                expect(error).toBeNull();
            });

            it('allows Windows network paths', () => {
                const error = validate_file_path('\\\\server\\share\\scene.unity', 'write');
                expect(error).toBeNull();
            });
        });

        describe('file:// URI rejection', () => {
            it('rejects file:// URIs', () => {
                const error = validate_file_path('file:///tmp/scene.unity', 'write');
                expect(error).toContain('file:// URIs are not supported');
            });

            it('rejects file:// URIs with relative paths', () => {
                const error = validate_file_path('file://./scene.unity', 'write');
                expect(error).toContain('file:// URIs are not supported');
            });
        });

        describe('Path traversal rejection (relative paths only)', () => {
            it('rejects parent directory traversal in relative paths', () => {
                const error = validate_file_path('../../../etc/passwd', 'write');
                expect(error).toContain('Path traversal (..) is not allowed');
            });

            it('rejects mid-path traversal in relative paths', () => {
                const error = validate_file_path('Assets/../../../etc/passwd', 'write');
                expect(error).toContain('Path traversal (..) is not allowed');
            });

            it('rejects traversal with backslashes in relative paths', () => {
                const error = validate_file_path('Assets\\..\\..\\sensitive.txt', 'write');
                expect(error).toContain('Path traversal (..) is not allowed');
            });

            it('rejects traversal in relative paths', () => {
                const error = validate_file_path('Assets/../file.unity', 'write');
                expect(error).toContain('Path traversal (..) is not allowed');
            });

            it('allows path traversal in absolute paths (OS will resolve it)', () => {
                const error = validate_file_path('/tmp/../tmp/scene.unity', 'write');
                expect(error).toBeNull();
            });

            it('allows path traversal in Windows absolute paths', () => {
                const error = validate_file_path('C:\\Projects\\..\\Projects\\scene.unity', 'write');
                expect(error).toBeNull();
            });
        });

        describe('Packages/ directory protection', () => {
            it('rejects writes to Packages/ directory', () => {
                const error = validate_file_path('Packages/com.unity.test/scene.unity', 'write');
                expect(error).toContain('Cannot write to Packages/');
                expect(error).toContain('read-only');
            });

            it('allows reads from Packages/ directory', () => {
                const error = validate_file_path('Packages/com.unity.test/scene.unity', 'read');
                expect(error).toBeNull();
            });

            it('rejects writes to Packages/ with backslashes', () => {
                const error = validate_file_path('Packages\\com.unity.test\\scene.unity', 'write');
                expect(error).toContain('Cannot write to Packages/');
            });
        });

        describe('Valid paths', () => {
            it('accepts relative paths in Assets/', () => {
                const error = validate_file_path('Assets/Scenes/Level1.unity', 'write');
                expect(error).toBeNull();
            });

            it('accepts relative paths in ProjectSettings/', () => {
                const error = validate_file_path('ProjectSettings/TagManager.asset', 'write');
                expect(error).toBeNull();
            });

            it('accepts paths with backslashes (normalized)', () => {
                const error = validate_file_path('Assets\\Scenes\\Level1.unity', 'write');
                expect(error).toBeNull();
            });

            it('accepts paths with spaces', () => {
                const error = validate_file_path('Assets/Scenes/Level 1 - Tutorial.unity', 'write');
                expect(error).toBeNull();
            });

            it('accepts read operations on Packages/', () => {
                const error = validate_file_path('Packages/com.unity.ugui/Runtime/UI.prefab', 'read');
                expect(error).toBeNull();
            });

            it('accepts nested paths without traversal', () => {
                const error = validate_file_path('Assets/Scenes/Levels/Boss/Final.unity', 'write');
                expect(error).toBeNull();
            });
        });
    });
});

describe('Unity Type Validation', () => {
    describe('validate_vector3()', () => {
        it('accepts valid Vector3', () => {
            const error = validate_vector3({ x: 1, y: 2, z: 3 });
            expect(error).toBeNull();
        });

        it('accepts Vector3 with negative values', () => {
            const error = validate_vector3({ x: -1, y: -2.5, z: 0 });
            expect(error).toBeNull();
        });

        it('accepts Vector3 with zero values', () => {
            const error = validate_vector3({ x: 0, y: 0, z: 0 });
            expect(error).toBeNull();
        });

        it('accepts Vector3 with floating point values', () => {
            const error = validate_vector3({ x: 1.5, y: 2.7, z: 3.14159 });
            expect(error).toBeNull();
        });

        it('rejects null', () => {
            const error = validate_vector3(null);
            expect(error).toContain('must be an object');
        });

        it('rejects undefined', () => {
            const error = validate_vector3(undefined);
            expect(error).toContain('must be an object');
        });

        it('rejects primitive types', () => {
            const error = validate_vector3(42);
            expect(error).toContain('must be an object');
        });

        it('rejects string representations', () => {
            const error = validate_vector3('{ x: 1, y: 2, z: 3 }');
            expect(error).toContain('must be an object');
        });

        it('rejects missing x component', () => {
            const error = validate_vector3({ y: 2, z: 3 });
            expect(error).toContain('must all be numbers');
        });

        it('rejects missing y component', () => {
            const error = validate_vector3({ x: 1, z: 3 });
            expect(error).toContain('must all be numbers');
        });

        it('rejects missing z component', () => {
            const error = validate_vector3({ x: 1, y: 2 });
            expect(error).toContain('must all be numbers');
        });

        it('rejects string x component', () => {
            const error = validate_vector3({ x: '1', y: 2, z: 3 });
            expect(error).toContain('must all be numbers');
        });

        it('rejects null components', () => {
            const error = validate_vector3({ x: null, y: 2, z: 3 });
            expect(error).toContain('must all be numbers');
        });

        it('rejects NaN components', () => {
            const error = validate_vector3({ x: NaN, y: 2, z: 3 });
            expect(error).toContain('must be finite numbers');
        });

        it('rejects Infinity components', () => {
            const error = validate_vector3({ x: Infinity, y: 2, z: 3 });
            expect(error).toContain('must be finite numbers');
        });

        it('rejects -Infinity components', () => {
            const error = validate_vector3({ x: 1, y: -Infinity, z: 3 });
            expect(error).toContain('must be finite numbers');
        });
    });

    describe('validate_guid()', () => {
        it('accepts valid lowercase GUID', () => {
            const error = validate_guid('a1b2c3d4e5f678901234567890abcdef');
            expect(error).toBeNull();
        });

        it('accepts valid uppercase GUID', () => {
            const error = validate_guid('A1B2C3D4E5F678901234567890ABCDEF');
            expect(error).toBeNull();
        });

        it('accepts valid mixed-case GUID', () => {
            const error = validate_guid('a1B2c3D4e5F678901234567890AbCdEf');
            expect(error).toBeNull();
        });

        it('accepts GUID with all zeros', () => {
            const error = validate_guid('00000000000000000000000000000000');
            expect(error).toBeNull();
        });

        it('accepts GUID with all f characters', () => {
            const error = validate_guid('ffffffffffffffffffffffffffffffff');
            expect(error).toBeNull();
        });

        it('rejects GUID that is too short', () => {
            const error = validate_guid('a1b2c3d4e5f678901234567890abcde');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects GUID that is too long', () => {
            const error = validate_guid('a1b2c3d4e5f678901234567890abcdef0');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects GUID with hyphens (UUID format)', () => {
            const error = validate_guid('a1b2c3d4-e5f6-7890-1234-567890abcdef');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects GUID with invalid characters (g)', () => {
            const error = validate_guid('g1b2c3d4e5f678901234567890abcdef');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects GUID with spaces', () => {
            const error = validate_guid('a1b2c3d4 e5f678901234567890abcdef');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects empty string', () => {
            const error = validate_guid('');
            expect(error).toContain('32-character hexadecimal');
        });

        it('rejects GUID with special characters', () => {
            const error = validate_guid('a1b2c3d4e5f678901234567890abcd@f');
            expect(error).toContain('32-character hexadecimal');
        });
    });

    describe('validate_name()', () => {
        it('accepts valid GameObject name', () => {
            const error = validate_name('Player', 'GameObject');
            expect(error).toBeNull();
        });

        it('accepts name with spaces', () => {
            const error = validate_name('Main Camera', 'GameObject');
            expect(error).toBeNull();
        });

        it('accepts name with numbers', () => {
            const error = validate_name('Enemy_01', 'GameObject');
            expect(error).toBeNull();
        });

        it('accepts name with special characters', () => {
            const error = validate_name('Player (Clone)', 'GameObject');
            expect(error).toBeNull();
        });

        it('rejects name with forward slash', () => {
            const error = validate_name('Player/Weapon', 'GameObject');
            expect(error).toContain('cannot contain forward slashes');
            expect(error).toContain('hierarchy path separators');
        });

        it('rejects name with backslash', () => {
            const error = validate_name('Player\\Weapon', 'GameObject');
            expect(error).toContain('cannot contain backslashes');
        });

        it('rejects name with newline', () => {
            const error = validate_name('Player\nWeapon', 'GameObject');
            expect(error).toContain('cannot contain newlines');
            expect(error).toContain('corrupt YAML');
        });

        it('rejects name with carriage return', () => {
            const error = validate_name('Player\rWeapon', 'GameObject');
            expect(error).toContain('cannot contain newlines');
        });

        it('rejects name with tab', () => {
            const error = validate_name('Player\tWeapon', 'GameObject');
            expect(error).toContain('cannot contain tab characters');
            expect(error).toContain('break YAML indentation');
        });

        it('rejects name with null byte', () => {
            const error = validate_name('Player\0Weapon', 'GameObject');
            expect(error).toContain('cannot contain null bytes');
        });

        it('uses label in error message', () => {
            const error = validate_name('Bad/Name', 'Tag');
            expect(error).toContain('Tag');
        });
    });
});
