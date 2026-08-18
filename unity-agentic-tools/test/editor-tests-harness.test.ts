import { describe, expect, it } from 'vitest';
import { build_editor_tests_manifest, parse_args, summarize_nunit_results } from './run-editor-tests';

const UNITY_BIN = '/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity';

const BASE_MANIFEST = JSON.stringify({
    dependencies: {
        'com.unity.test-framework': '1.6.0',
        'com.unity.modules.ui': '1.0.0',
    },
    testables: ['com.unity-agentic-tools.editor-bridge'],
}, null, 2);

/** Shaped like a real Unity Test Framework result file, trimmed to what is read. */
const RESULTS_XML = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<test-run id="2" testcasecount="3" result="Failed" total="3" passed="1" failed="1" inconclusive="0" skipped="1" asserts="0" duration="1.5">
  <test-suite type="TestSuite" name="UnityAgenticTools.Tests" fullname="UnityAgenticTools.Tests" result="Failed">
    <failure>
      <message><![CDATA[One or more child tests had errors]]></message>
    </failure>
    <test-case id="1001" name="Passes" fullname="UnityAgenticTools.Tests.FramingTests.Passes" result="Passed" />
    <test-case id="1002" name="Fails" fullname="UnityAgenticTools.Tests.FramingTests.Fails" result="Failed">
      <failure>
        <message><![CDATA[Expected: String containing "jsonrpc"
  But was:  "{}"]]></message>
        <stack-trace><![CDATA[at FramingTests.Fails()]]></stack-trace>
      </failure>
    </test-case>
    <test-case id="1003" name="Ignored" fullname="UnityAgenticTools.Tests.FramingTests.Ignored" result="Skipped" />
  </test-suite>
</test-run>`;

describe('parse_args', () => {
    it('requires --unity-bin', () => {
        expect(() => parse_args([], {})).toThrow('--unity-bin is required');
    });

    it('requires an absolute Unity path', () => {
        expect(() => parse_args(['--unity-bin', 'Unity.app/Contents/MacOS/Unity'], {})).toThrow('--unity-bin must be an absolute path');
    });

    it('uses UNITY_BIN when --unity-bin is omitted', () => {
        expect(parse_args([], { UNITY_BIN: UNITY_BIN }).unity_bin).toBe(UNITY_BIN);
    });

    it('parses supported options', () => {
        const options = parse_args([
            '--unity-bin', UNITY_BIN,
            '--test-filter', 'UnityAgenticTools.Tests.FramingTests',
            '--timeout-ms', '1234',
            '--keep-temp',
        ], {});

        expect(options).toEqual({
            unity_bin: UNITY_BIN,
            test_filter: 'UnityAgenticTools.Tests.FramingTests',
            timeout_ms: 1234,
            keep_temp: true,
        });
    });

    it('rejects a non-positive timeout', () => {
        expect(() => parse_args(['--unity-bin', UNITY_BIN, '--timeout-ms', '0'], {})).toThrow('Invalid --timeout-ms value: 0');
    });
});

describe('build_editor_tests_manifest', () => {
    it('points the bridge dependency at an absolute path', () => {
        const manifest = JSON.parse(build_editor_tests_manifest(BASE_MANIFEST, '/abs/unity-package')) as {
            dependencies: Record<string, string>;
        };

        expect(manifest.dependencies['com.unity-agentic-tools.editor-bridge']).toBe('file:/abs/unity-package');
    });

    it('keeps the fixture dependencies and testables', () => {
        const manifest = JSON.parse(build_editor_tests_manifest(BASE_MANIFEST, '/abs/unity-package')) as {
            dependencies: Record<string, string>;
            testables: string[];
        };

        expect(manifest.dependencies['com.unity.test-framework']).toBe('1.6.0');
        expect(manifest.dependencies['com.unity.modules.ui']).toBe('1.0.0');
        // Without this entry Unity does not surface a package's tests at all.
        expect(manifest.testables).toEqual(['com.unity-agentic-tools.editor-bridge']);
    });

    it('survives a manifest with no dependencies block', () => {
        const manifest = JSON.parse(build_editor_tests_manifest('{}', '/abs/unity-package')) as {
            dependencies: Record<string, string>;
        };

        expect(manifest.dependencies).toEqual({ 'com.unity-agentic-tools.editor-bridge': 'file:/abs/unity-package' });
    });
});

describe('summarize_nunit_results', () => {
    it('reads the counts off the test-run element', () => {
        const summary = summarize_nunit_results(RESULTS_XML);

        expect(summary.total).toBe(3);
        expect(summary.passed).toBe(1);
        expect(summary.failed).toBe(1);
        expect(summary.skipped).toBe(1);
        expect(summary.inconclusive).toBe(0);
    });

    it('reports only failed cases, with their message', () => {
        const summary = summarize_nunit_results(RESULTS_XML);

        expect(summary.failures).toHaveLength(1);
        expect(summary.failures[0]?.full_name).toBe('UnityAgenticTools.Tests.FramingTests.Fails');
        expect(summary.failures[0]?.message).toContain('Expected: String containing "jsonrpc"');
    });

    // A failed case carrying no <failure> of its own is followed here by the
    // suite's. Scanning past </test-case> -- or past a self-closing case, which
    // has no closing tag at all -- would report the suite's message as this
    // test's reason for failing.
    it('does not borrow a following element failure message', () => {
        const summary = summarize_nunit_results(`<test-run total="1" passed="0" failed="1" skipped="0" inconclusive="0">
  <test-suite type="TestSuite" name="Suite" fullname="Suite" result="Failed">
    <test-case name="Fails" fullname="Suite.Fails" result="Failed" />
    <failure><message><![CDATA[One or more child tests had errors]]></message></failure>
  </test-suite>
</test-run>`);

        expect(summary.failures).toHaveLength(1);
        expect(summary.failures[0]?.message).toBe('(no failure message)');
    });

    it('decodes entity-escaped messages', () => {
        const summary = summarize_nunit_results(`<test-run total="1" passed="0" failed="1" skipped="0" inconclusive="0">
  <test-case name="Fails" fullname="Suite.Fails" result="Failed">
    <failure><message>Expected: &lt;true&gt; &amp; got &quot;false&quot;</message></failure>
  </test-case>
</test-run>`);

        expect(summary.failures[0]?.message).toBe('Expected: <true> & got "false"');
    });

    it('reports zero totals for a run that executed nothing', () => {
        const summary = summarize_nunit_results('<test-run id="2" testcasecount="0" result="Passed" total="0" passed="0" failed="0" inconclusive="0" skipped="0" />');

        expect(summary.total).toBe(0);
        expect(summary.failures).toEqual([]);
    });

    it('rejects a results file with no test-run element', () => {
        expect(() => summarize_nunit_results('<?xml version="1.0"?><other />')).toThrow('no <test-run> element');
    });
});
