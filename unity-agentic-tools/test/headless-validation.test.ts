import { describe, expect, it } from 'vitest';
import { analyze_unity_log, parse_args, SCENARIO_NAMES } from './run-headless-validation';

describe('parse_args', () => {
    it('requires --unity-bin', () => {
        expect(() => parse_args([])).toThrow('--unity-bin is required');
    });

    it('requires an absolute Unity path', () => {
        expect(() => parse_args(['--unity-bin', 'Unity.app/Contents/MacOS/Unity'])).toThrow('--unity-bin must be an absolute path');
    });

    it('parses supported options', () => {
        const options = parse_args([
            '--unity-bin', '/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity',
            '--scenario', 'baseline',
            '--timeout-ms', '1234',
            '--keep-temp',
        ]);

        expect(options).toEqual({
            unity_bin: '/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity',
            scenario: 'baseline',
            timeout_ms: 1234,
            keep_temp: true,
        });
    });
});

describe('analyze_unity_log', () => {
    it('extracts validation markers, compiler failures, and licensing failures', () => {
        const summary = analyze_unity_log([
            'VALIDATION_WARNING: harmless warning',
            'Assets/Editor/HeadlessValidator.cs(12,3): error CS1002: ; expected',
            'VALIDATION_ERROR: scene failed to open',
            'Scripts have compiler errors.',
            "[Licensing::Module] Error: 'com.unity.editor.headless' was not found.",
        ].join('\n'));

        expect(summary.validation_warnings).toEqual(['harmless warning']);
        expect(summary.validation_errors).toEqual(['scene failed to open']);
        expect(summary.compiler_errors).toHaveLength(1);
        expect(summary.fatal_errors).toContain('Scripts have compiler errors.');
        expect(summary.licensing_errors).toEqual(["[Licensing::Module] Error: 'com.unity.editor.headless' was not found."]);
    });
});

describe('SCENARIO_NAMES', () => {
    it('includes scenarios that do not depend on removed local CLI mutation groups', () => {
        expect(SCENARIO_NAMES).toContain('baseline');
        expect(SCENARIO_NAMES).toContain('negative-harness');
        expect(new Set(SCENARIO_NAMES).size).toBe(SCENARIO_NAMES.length);
    });
});
