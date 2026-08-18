import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { evaluate_checks, gather_facts } from '../../scripts/release-preflight.js';

interface PreflightCheck {
    name: string;
    ok: boolean;
    detail: string;
}

const PASSING_FACTS = {
    version: '0.8.0',
    cli_version: '0.8.0',
    unity_version: '0.8.0',
    changelog_section: '- Something user-visible.',
    changelog_missing: false,
    dirty_paths: '',
    local_tag: '',
    remote_tag_line: '',
    remote_tag_failed: false,
    head_sha: 'a'.repeat(40),
    release_branch_sha: 'a'.repeat(40),
};

function check_for(facts: Record<string, unknown>, name_fragment: string): PreflightCheck {
    const checks = evaluate_checks(facts) as PreflightCheck[];
    const match = checks.find((check) => check.name.includes(name_fragment));

    if (!match) {
        throw new Error(`No check matching "${name_fragment}" in: ${checks.map((c) => c.name).join(', ')}`);
    }

    return match;
}

function failures(facts: Record<string, unknown>): string[] {
    return (evaluate_checks(facts) as PreflightCheck[])
        .filter((check) => !check.ok)
        .map((check) => check.name);
}

describe('evaluate_checks', () => {
    it('passes when every precondition holds', () => {
        expect(failures(PASSING_FACTS)).toEqual([]);
    });

    it('rejects a version that is not X.Y.Z', () => {
        expect(check_for({ ...PASSING_FACTS, version: 'v0.8.0' }, 'version format').ok).toBe(false);
        expect(check_for({ ...PASSING_FACTS, version: '0.8' }, 'version format').ok).toBe(false);
    });

    it('fails when a package version lags the release', () => {
        const check = check_for({ ...PASSING_FACTS, unity_version: '0.7.0' }, 'package versions');

        expect(check.ok).toBe(false);
        expect(check.detail).toContain('sync-version.js --set 0.8.0');
    });

    it('fails when the package versions agree but do not match the release', () => {
        const check = check_for(
            { ...PASSING_FACTS, cli_version: '0.7.0', unity_version: '0.7.0' },
            'package versions',
        );

        expect(check.ok).toBe(false);
    });

    it('separates a missing CHANGELOG section from an empty one', () => {
        expect(check_for({ ...PASSING_FACTS, changelog_section: null }, 'CHANGELOG').detail)
            .toContain('no "## 0.8.0" section');
        expect(check_for({ ...PASSING_FACTS, changelog_section: '' }, 'CHANGELOG').detail)
            .toContain('is empty');
        expect(check_for({ ...PASSING_FACTS, changelog_missing: true }, 'CHANGELOG').detail)
            .toContain('not found');
    });

    it('fails on a dirty working tree and names the paths', () => {
        const check = check_for({ ...PASSING_FACTS, dirty_paths: ' M README.md' }, 'working tree');

        expect(check.ok).toBe(false);
        expect(check.detail).toContain('README.md');
    });

    it('fails when the tag exists locally, remotely, or both', () => {
        expect(check_for({ ...PASSING_FACTS, local_tag: 'v0.8.0' }, 'is available').detail)
            .toContain('locally');
        expect(check_for({ ...PASSING_FACTS, remote_tag_line: 'abc\trefs/tags/v0.8.0' }, 'is available').detail)
            .toContain('on origin');
        expect(
            check_for(
                { ...PASSING_FACTS, local_tag: 'v0.8.0', remote_tag_line: 'abc\trefs/tags/v0.8.0' },
                'is available',
            ).detail,
        ).toContain('locally and on origin');
    });

    it('fails when HEAD is not origin/main, mirroring verify-tag-on-main', () => {
        const check = check_for({ ...PASSING_FACTS, release_branch_sha: 'b'.repeat(40) }, 'HEAD is origin/main');

        expect(check.ok).toBe(false);
        expect(check.detail).toContain('merge and push main first');
    });

    it('treats an unresolvable HEAD as a failure rather than a match', () => {
        expect(check_for({ ...PASSING_FACTS, head_sha: '', release_branch_sha: '' }, 'HEAD is origin/main').ok)
            .toBe(false);
    });

    it('surfaces a failed remote tag lookup as its own check', () => {
        expect(failures({ ...PASSING_FACTS, remote_tag_failed: true })).toContain('remote tag lookup');
        expect(failures(PASSING_FACTS)).not.toContain('remote tag lookup');
    });
});

describe('gather_facts', () => {
    const repos: string[] = [];

    afterAll(() => {
        for (const repo of repos) {
            rmSync(repo, { recursive: true, force: true });
        }
    });

    function make_repo(): string {
        const repo = mkdtempSync(join(tmpdir(), 'release-preflight-'));
        repos.push(repo);

        const run = (args: string[]): void => {
            execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
        };

        run(['init', '--quiet']);
        run(['config', 'user.email', 'preflight@example.test']);
        run(['config', 'user.name', 'Preflight']);
        writeFileSync(join(repo, 'file.txt'), 'contents\n');
        run(['add', '.']);
        run(['commit', '--quiet', '-m', 'initial']);

        return repo;
    }

    it('reads a clean tree and an untaken tag from a real repo', () => {
        const facts = gather_facts('0.8.0', make_repo());

        expect(facts.dirty_paths).toBe('');
        expect(facts.local_tag).toBe('');
        expect(facts.head_sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('detects an uncommitted change', () => {
        const repo = make_repo();
        writeFileSync(join(repo, 'file.txt'), 'changed\n');

        expect(gather_facts('0.8.0', repo).dirty_paths).toContain('file.txt');
    });

    it('detects a tag that already exists locally', () => {
        const repo = make_repo();
        execFileSync('git', ['tag', 'v0.8.0'], { cwd: repo, stdio: 'pipe' });

        expect(gather_facts('0.8.0', repo).local_tag).toBe('v0.8.0');
        expect(gather_facts('0.9.0', repo).local_tag).toBe('');
    });

    it('reports an unresolvable origin/main instead of throwing', () => {
        const facts = gather_facts('0.8.0', make_repo());

        expect(facts.release_branch_sha).toBe('');
        expect(check_for(facts, 'HEAD is origin/main').ok).toBe(false);
    });
});
