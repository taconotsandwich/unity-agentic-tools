import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
    parse_version,
    is_unity6_or_later,
    read_project_version,
    has_build_profiles,
    get_project_info,
} from '../src/version';

const FIXTURE_PATH = path.resolve(__dirname, '../../test/fixtures/external');

describe('parse_version', () => {
    it('should parse Unity 2022 version', () => {
        const version = parse_version('2022.3.13f1');

        expect(version.raw).toBe('2022.3.13f1');
        expect(version.major).toBe(2022);
        expect(version.minor).toBe(3);
        expect(version.patch).toBe(13);
        expect(version.releaseType).toBe('f');
        expect(version.revision).toBe(1);
    });

    it('should parse Unity 6 version', () => {
        const version = parse_version('6000.0.23f1');

        expect(version.raw).toBe('6000.0.23f1');
        expect(version.major).toBe(6000);
        expect(version.minor).toBe(0);
        expect(version.patch).toBe(23);
        expect(version.releaseType).toBe('f');
        expect(version.revision).toBe(1);
    });

    it('should parse beta version', () => {
        const version = parse_version('2023.1.0b5');

        expect(version.major).toBe(2023);
        expect(version.releaseType).toBe('b');
        expect(version.revision).toBe(5);
    });

    it('should parse alpha version', () => {
        const version = parse_version('6000.1.0a12');

        expect(version.major).toBe(6000);
        expect(version.releaseType).toBe('a');
        expect(version.revision).toBe(12);
    });

    it('should throw on invalid format', () => {
        expect(() => parse_version('invalid')).toThrow('Invalid Unity version format');
        expect(() => parse_version('2022.3')).toThrow('Invalid Unity version format');
    });
});

describe('is_unity6_or_later', () => {
    it('should return false for Unity 2022', () => {
        const version = parse_version('2022.3.13f1');
        expect(is_unity6_or_later(version)).toBe(false);
    });

    it('should return false for Unity 2023', () => {
        const version = parse_version('2023.2.0f1');
        expect(is_unity6_or_later(version)).toBe(false);
    });

    it('should return true for Unity 6', () => {
        const version = parse_version('6000.0.23f1');
        expect(is_unity6_or_later(version)).toBe(true);
    });

    it('should return true for Unity 6.1', () => {
        const version = parse_version('6000.1.0f1');
        expect(is_unity6_or_later(version)).toBe(true);
    });
});

describe('read_project_version', () => {
    it('should read version from test fixture', () => {
        const version = read_project_version(FIXTURE_PATH);

        expect(version.raw).toBe('2022.3.13f1');
        expect(version.major).toBe(2022);
        expect(version.fullRevision).toBe('2022.3.13f1 (5f90a5ebde0f)');
    });

    it('should throw for non-existent project', () => {
        expect(() => read_project_version('/nonexistent/path')).toThrow(
            'ProjectVersion.txt not found'
        );
    });
});

describe('has_build_profiles', () => {
    it('should return false for Unity 2022 project', () => {
        const result = has_build_profiles(FIXTURE_PATH);

        expect(result.exists).toBe(false);
        expect(result.path).toContain('Assets/Settings/Build Profiles');
    });
});

describe('get_project_info', () => {
    it('should return complete project info', () => {
        const info = get_project_info(FIXTURE_PATH);

        expect(info.projectPath).toBe(FIXTURE_PATH);
        expect(info.version.raw).toBe('2022.3.13f1');
        expect(info.isUnity6OrLater).toBe(false);
        expect(info.hasBuildProfiles).toBe(false);
        expect(info.buildProfilesPath).toBeUndefined();
    });
});
