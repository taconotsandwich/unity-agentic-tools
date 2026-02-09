import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discover_sources, read_unity_version, resolve_editor_docs_path } from '../../src/sources';

describe('discover_sources', () => {
    let temp_dir: string;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'sources-test-'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('should discover package documentation sources', () => {
        // Create fake package with Documentation~ folder
        const pkgDir = join(temp_dir, 'Packages', 'com.unity.cinemachine', 'Documentation~');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'index.md'), '# Cinemachine docs');

        const sources = discover_sources(temp_dir);

        expect(sources.length).toBeGreaterThanOrEqual(1);
        const pkgSource = sources.find(s => s.id === 'pkg:com.unity.cinemachine');
        expect(pkgSource).toBeDefined();
        expect(pkgSource!.type).toBe('package');
        expect(pkgSource!.path).toBe(pkgDir);
    });

    it('should discover multiple package sources', () => {
        const pkg1 = join(temp_dir, 'Packages', 'com.unity.cinemachine', 'Documentation~');
        const pkg2 = join(temp_dir, 'Packages', 'com.unity.render-pipelines.universal', 'Documentation~');
        mkdirSync(pkg1, { recursive: true });
        mkdirSync(pkg2, { recursive: true });

        const sources = discover_sources(temp_dir);
        const pkgSources = sources.filter(s => s.type === 'package');

        expect(pkgSources.length).toBe(2);
    });

    it('should skip packages without Documentation~ folder', () => {
        mkdirSync(join(temp_dir, 'Packages', 'com.unity.no-docs'), { recursive: true });

        const sources = discover_sources(temp_dir);
        const pkgSources = sources.filter(s => s.type === 'package');

        expect(pkgSources.length).toBe(0);
    });

    it('should return empty when Packages dir does not exist', () => {
        const sources = discover_sources(temp_dir);

        expect(sources.length).toBe(0);
    });
});

describe('read_unity_version', () => {
    let temp_dir: string;

    beforeEach(() => {
        temp_dir = mkdtempSync(join(tmpdir(), 'version-test-'));
    });

    afterEach(() => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('should parse version from ProjectVersion.txt', () => {
        const settingsDir = join(temp_dir, 'ProjectSettings');
        mkdirSync(settingsDir, { recursive: true });
        writeFileSync(join(settingsDir, 'ProjectVersion.txt'),
            'm_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (abc123)');

        const version = read_unity_version(temp_dir);

        expect(version).toBe('2022.3.10f1');
    });

    it('should return null when file does not exist', () => {
        const version = read_unity_version(temp_dir);

        expect(version).toBeNull();
    });

    it('should return null for malformed file', () => {
        const settingsDir = join(temp_dir, 'ProjectSettings');
        mkdirSync(settingsDir, { recursive: true });
        writeFileSync(join(settingsDir, 'ProjectVersion.txt'), 'garbage content');

        const version = read_unity_version(temp_dir);

        expect(version).toBeNull();
    });
});

describe('resolve_editor_docs_path', () => {
    it('should return null for non-existent editor install', () => {
        const result = resolve_editor_docs_path('9999.9.9f1');

        expect(result).toBeNull();
    });
});
