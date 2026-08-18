#!/usr/bin/env bun
/**
 * Release Preflight
 *
 * Runs every precondition the release workflow enforces, locally, before the
 * tag exists. Without this the first signal that a release is malformed is a
 * failed workflow run on a tag that is already public, which then has to be
 * deleted locally and on the remote before retrying.
 *
 * Read-only by construction: no tag, no push, no publish, no commit, no branch
 * move. The only side effect anywhere is `git fetch` updating local
 * remote-tracking refs.
 *
 * Run it after the version-sync commit and after pushing main, immediately
 * before tagging -- that is the point where every check is meaningful.
 *
 * Usage:
 *   bun scripts/release-preflight.js 0.8.0
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extract_section } = require('./release-notes.js');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const CLI_PACKAGE_PATH = path.join(ROOT, 'unity-agentic-tools', 'package.json');
const UNITY_PACKAGE_PATH = path.join(ROOT, 'unity-package', 'package.json');
const RELEASE_BRANCH = 'main';

function git(args, cwd = ROOT) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });

  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

/**
 * Output only when the command actually succeeded. `git rev-parse` echoes an
 * unresolvable ref back on stdout and exits non-zero, so trusting stdout alone
 * would report the literal string "origin/main" as a commit sha.
 */
function git_output(args, cwd = ROOT) {
  const result = git(args, cwd);
  return result.status === 0 ? result.stdout : '';
}

function read_package_version(file_path) {
  try {
    return JSON.parse(fs.readFileSync(file_path, 'utf-8')).version || null;
  } catch {
    return null;
  }
}

/**
 * Collect everything the checks need. All commands are reads; `fetch` only
 * updates local remote-tracking refs.
 */
function gather_facts(version, cwd = ROOT) {
  git(['fetch', 'origin', RELEASE_BRANCH, '--tags'], cwd);

  const changelog = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, 'utf-8')
    : null;

  const remote_tag = git(['ls-remote', '--tags', 'origin', `refs/tags/v${version}`], cwd);

  return {
    version,
    cli_version: read_package_version(CLI_PACKAGE_PATH),
    unity_version: read_package_version(UNITY_PACKAGE_PATH),
    changelog_section: changelog === null ? null : extract_section(changelog, version),
    changelog_missing: changelog === null,
    dirty_paths: git_output(['status', '--porcelain'], cwd),
    local_tag: git_output(['tag', '--list', `v${version}`], cwd),
    remote_tag_line: remote_tag.status === 0 ? remote_tag.stdout : '',
    remote_tag_failed: remote_tag.status !== 0,
    head_sha: git_output(['rev-parse', 'HEAD'], cwd),
    release_branch_sha: git_output(['rev-parse', `origin/${RELEASE_BRANCH}`], cwd),
  };
}

/**
 * Pure: facts in, pass/fail list out. Everything that touches git or the
 * filesystem happens in gather_facts, so this is the part worth testing.
 */
function evaluate_checks(facts) {
  const checks = [];

  const version_ok = /^\d+\.\d+\.\d+$/.test(facts.version);
  checks.push({
    name: 'version format',
    ok: version_ok,
    detail: version_ok
      ? facts.version
      : `"${facts.version}" is not X.Y.Z. Pass the version without a leading "v".`,
  });

  const versions_synced =
    facts.cli_version === facts.version && facts.unity_version === facts.version;
  checks.push({
    name: 'package versions match the release',
    ok: versions_synced,
    detail: versions_synced
      ? `both at ${facts.version}`
      : `unity-agentic-tools is ${facts.cli_version || 'missing'}, unity-package is ${facts.unity_version || 'missing'}. Run: bun scripts/sync-version.js --set ${facts.version}`,
  });

  const has_notes = !facts.changelog_missing && Boolean(facts.changelog_section);
  checks.push({
    name: 'CHANGELOG section',
    ok: has_notes,
    detail: describe_changelog(facts),
  });

  const clean = facts.dirty_paths === '';
  checks.push({
    name: 'working tree clean',
    ok: clean,
    detail: clean ? 'nothing to commit' : `uncommitted changes:\n${indent(facts.dirty_paths)}`,
  });

  const tag_free = facts.local_tag === '' && facts.remote_tag_line === '';
  checks.push({
    name: `tag v${facts.version} is available`,
    ok: tag_free,
    detail: describe_tag(facts),
  });

  const on_release_head =
    facts.head_sha !== '' && facts.head_sha === facts.release_branch_sha;
  checks.push({
    name: `HEAD is origin/${RELEASE_BRANCH}`,
    ok: on_release_head,
    detail: on_release_head
      ? `${facts.head_sha.slice(0, 7)}`
      : `HEAD is ${short(facts.head_sha)}, origin/${RELEASE_BRANCH} is ${short(facts.release_branch_sha)}. The workflow rejects a tag that is not origin/${RELEASE_BRANCH} HEAD -- merge and push ${RELEASE_BRANCH} first.`,
  });

  if (facts.remote_tag_failed) {
    checks.push({
      name: 'remote tag lookup',
      ok: false,
      detail: 'git ls-remote failed. Without it a duplicate tag would only surface at push time.',
    });
  }

  return checks;
}

function describe_changelog(facts) {
  if (facts.changelog_missing) {
    return `CHANGELOG.md not found at ${CHANGELOG_PATH}`;
  }

  if (facts.changelog_section === null) {
    return `no "## ${facts.version}" section. Add a few bullets covering user-visible changes -- see "Release Format" in CONTRIBUTING.md.`;
  }

  if (facts.changelog_section === '') {
    return `section "## ${facts.version}" is empty.`;
  }

  const lines = facts.changelog_section.split('\n').filter((line) => line.trim() !== '');
  return `${lines.length} line(s) of notes`;
}

function describe_tag(facts) {
  const taken = [];
  if (facts.local_tag !== '') {
    taken.push('locally');
  }
  if (facts.remote_tag_line !== '') {
    taken.push('on origin');
  }

  if (taken.length === 0) {
    return 'not taken';
  }

  return `v${facts.version} already exists ${taken.join(' and ')}. Releasing it again needs a new version, not a re-tag.`;
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function short(sha) {
  return sha === '' ? '(unknown)' : sha.slice(0, 7);
}

function report(checks) {
  for (const check of checks) {
    console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => !check.ok);
  console.log('');

  if (failures.length === 0) {
    console.log('Preflight passed. Nothing was tagged, pushed, or published.');
    return true;
  }

  console.log(`${failures.length} of ${checks.length} checks failed. Do not tag yet.`);
  return false;
}

function main() {
  const version = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

  if (!version) {
    console.error('Usage: bun scripts/release-preflight.js <version>');
    console.error('Example: bun scripts/release-preflight.js 0.8.0');
    process.exit(1);
  }

  const passed = report(evaluate_checks(gather_facts(version.replace(/^v/, ''))));
  process.exit(passed ? 0 : 1);
}

module.exports = { evaluate_checks, gather_facts };

if (require.main === module) {
  main();
}
