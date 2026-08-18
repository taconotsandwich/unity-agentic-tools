#!/usr/bin/env bun
/**
 * Release Notes Extraction
 *
 * Reads the CHANGELOG.md section for a version. The release workflow uses this
 * instead of a generated `git log` dump, which CONTRIBUTING "Release Format"
 * rules out.
 *
 * Usage:
 *   bun scripts/release-notes.js 0.7.0          # print the section
 *   bun scripts/release-notes.js --check 0.7.0  # verify it exists
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function extract_section(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) {
    return null;
  }

  const rest = lines.slice(start + 1);
  const next_heading = rest.findIndex((line) => line.startsWith('## '));
  const body = next_heading === -1 ? rest : rest.slice(0, next_heading);

  return body.join('\n').trim();
}

function main() {
  const args = process.argv.slice(2);
  const check_only = args.includes('--check');
  const version = args.find((arg) => !arg.startsWith('-'));

  if (!version) {
    console.error('Usage: bun scripts/release-notes.js [--check] <version>');
    process.exit(1);
  }

  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error(`CHANGELOG.md not found at ${CHANGELOG_PATH}`);
    process.exit(1);
  }

  const section = extract_section(fs.readFileSync(CHANGELOG_PATH, 'utf-8'), version);

  if (section === null) {
    console.error(`CHANGELOG.md has no "## ${version}" section.`);
    console.error('Add a few bullets covering user-visible changes before tagging.');
    process.exit(1);
  }

  if (section === '') {
    console.error(`CHANGELOG.md section "## ${version}" is empty.`);
    process.exit(1);
  }

  if (check_only) {
    console.log(`CHANGELOG.md has release notes for ${version}.`);
    process.exit(0);
  }

  console.log(section);
}

module.exports = { extract_section };

if (require.main === module) {
  main();
}
