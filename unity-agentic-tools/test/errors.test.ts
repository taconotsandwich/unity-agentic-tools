import { describe, expect, it } from 'vitest';
import { validate_file_path, validate_vector3, validate_guid, validate_name } from '../src/utils';

describe('Path Security Validation', () => {
    describe('validate_file_path()', () => {
        describe('Absolute paths (allowed for CLI tools)', () => {
            it('allows Unix absolute paths', () => {
                const error = validate_file_path('/tmp/scene.unity', 'write');
                expect(error).toBeNull();
            });

            it.each([
                ['C drive backslash', 'C:\\Projects\\scene.unity'],
                ['D drive forward slash', 'D:/Unity/scene.unity'],
            ])('allows Windows absolute paths (%s)', (_label, path) => {
                const error = validate_file_path(path, 'write');
                expect(error).toBeNull();
            });

            it('allows Windows network paths', () => {
                const error = validate_file_path('\\\\server\\share\\scene.unity', 'write');
                expect(error).toBeNull();
            });
        });

        describe('file:// URI rejection', () => {
            it.each([
                ['absolute path', 'file:///tmp/scene.unity'],
                ['relative path', 'file://./scene.unity'],
            ])('rejects file:// URIs with %s', (_label, uri) => {
                const error = validate_file_path(uri, 'write');
                expect(error).toContain('file:// URIs are not supported');
            });
        });

        describe('Path traversal rejection (relative paths only)', () => {
            it.each([
                ['parent directory traversal', '../../../etc/passwd'],
                ['mid-path traversal', 'Assets/../../../etc/passwd'],
                ['backslash traversal', 'Assets\\..\\..\\sensitive.txt'],
                ['simple traversal', 'Assets/../file.unity'],
            ])('rejects %s in relative paths', (_label, path) => {
                const error = validate_file_path(path, 'write');
                expect(error).toContain('Path traversal (..) is not allowed');
            });

            it.each([
                ['Unix absolute path', '/tmp/../tmp/scene.unity'],
                ['Windows absolute path', 'C:\\Projects\\..\\Projects\\scene.unity'],
            ])('allows path traversal in %s (OS will resolve it)', (_label, path) => {
                const error = validate_file_path(path, 'write');
                expect(error).toBeNull();
            });
        });

        describe('Packages/ directory protection', () => {
            it.each([
                ['forward slashes', 'Packages/com.unity.test/scene.unity'],
                ['backslashes', 'Packages\\com.unity.test\\scene.unity'],
            ])('rejects writes to Packages/ directory with %s', (_label, path) => {
                const error = validate_file_path(path, 'write');
                expect(error).toContain('Cannot write to Packages/');
            });

            it('allows reads from Packages/ directory', () => {
                const error = validate_file_path('Packages/com.unity.test/scene.unity', 'read');
                expect(error).toBeNull();
            });
        });

        describe('Valid paths', () => {
            it.each([
                ['relative paths in Assets/', 'Assets/Scenes/Level1.unity'],
                ['relative paths in ProjectSettings/', 'ProjectSettings/TagManager.asset'],
                ['paths with backslashes', 'Assets\\Scenes\\Level1.unity'],
                ['paths with spaces', 'Assets/Scenes/Level 1 - Tutorial.unity'],
                ['nested paths without traversal', 'Assets/Scenes/Levels/Boss/Final.unity'],
            ])('accepts %s', (_label, path) => {
                const error = validate_file_path(path, 'write');
                expect(error).toBeNull();
            });
        });
    });
});

describe('Unity Type Validation', () => {
    describe('validate_vector3()', () => {
        it.each([
            ['positive integers', { x: 1, y: 2, z: 3 }],
            ['negative and decimal values', { x: -1, y: -2.5, z: 0 }],
            ['all zeros', { x: 0, y: 0, z: 0 }],
            ['floating point values', { x: 1.5, y: 2.7, z: 3.14159 }],
        ])('accepts Vector3 with %s', (_label, value) => {
            const error = validate_vector3(value);
            expect(error).toBeNull();
        });

        it.each([
            ['null', null],
            ['undefined', undefined],
            ['number primitive', 42],
            ['string representation', '{ x: 1, y: 2, z: 3 }'],
        ])('rejects non-object value: %s', (_label, value) => {
            const error = validate_vector3(value);
            expect(error).toContain('must be an object');
        });

        it.each([
            ['missing x', { y: 2, z: 3 }],
            ['missing y', { x: 1, z: 3 }],
            ['missing z', { x: 1, y: 2 }],
        ])('rejects Vector3 with %s component', (_label, value) => {
            const error = validate_vector3(value);
            expect(error).toContain('must all be numbers');
        });

        it.each([
            ['string component', { x: '1', y: 2, z: 3 }, 'must all be numbers'],
            ['null component', { x: null, y: 2, z: 3 }, 'must all be numbers'],
            ['NaN component', { x: NaN, y: 2, z: 3 }, 'must be finite numbers'],
            ['Infinity component', { x: Infinity, y: 2, z: 3 }, 'must be finite numbers'],
            ['-Infinity component', { x: 1, y: -Infinity, z: 3 }, 'must be finite numbers'],
        ])('rejects Vector3 with %s', (_label, value, expectedError) => {
            const error = validate_vector3(value);
            expect(error).toContain(expectedError);
        });
    });

    describe('validate_guid()', () => {
        it.each([
            ['lowercase', 'a1b2c3d4e5f678901234567890abcdef'],
            ['uppercase', 'A1B2C3D4E5F678901234567890ABCDEF'],
            ['mixed-case', 'a1B2c3D4e5F678901234567890AbCdEf'],
            ['all zeros', '00000000000000000000000000000000'],
            ['all f characters', 'ffffffffffffffffffffffffffffffff'],
        ])('accepts valid %s GUID', (_label, guid) => {
            const error = validate_guid(guid);
            expect(error).toBeNull();
        });

        it.each([
            ['too short', 'a1b2c3d4e5f678901234567890abcde'],
            ['too long', 'a1b2c3d4e5f678901234567890abcdef0'],
            ['with hyphens (UUID format)', 'a1b2c3d4-e5f6-7890-1234-567890abcdef'],
            ['with invalid character (g)', 'g1b2c3d4e5f678901234567890abcdef'],
            ['with spaces', 'a1b2c3d4 e5f678901234567890abcdef'],
            ['empty string', ''],
            ['with special characters', 'a1b2c3d4e5f678901234567890abcd@f'],
        ])('rejects GUID that is %s', (_label, guid) => {
            const error = validate_guid(guid);
            expect(error).toContain('32-character hexadecimal');
        });
    });

    describe('validate_name()', () => {
        it.each([
            ['simple name', 'Player'],
            ['name with spaces', 'Main Camera'],
            ['name with numbers', 'Enemy_01'],
            ['name with special characters', 'Player (Clone)'],
        ])('accepts valid %s', (_label, name) => {
            const error = validate_name(name, 'GameObject');
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
