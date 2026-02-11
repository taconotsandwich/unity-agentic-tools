#!/usr/bin/env bun
/**
 * Version Synchronization Script
 *
 * Ensures version consistency across:
 * - unity-agentic-tools/package.json (source of truth)
 * - .claude-plugin/plugin.json
 * - marketplace.json
 *
 * Usage:
 *   bun scripts/sync-version.js          # Sync versions
 *   bun scripts/sync-version.js --check  # Check without modifying
 *   bun scripts/sync-version.js --set 1.2.3  # Set specific version
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FILES = {
  source: path.join(ROOT, 'unity-agentic-tools', 'package.json'),
  rustCore: path.join(ROOT, 'rust-core', 'package.json'),
  plugin: path.join(ROOT, '.claude-plugin', 'plugin.json'),
  marketplace: path.join(ROOT, 'marketplace.json'),
};

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getVersions() {
  const versions = {};

  const source = readJSON(FILES.source);
  if (source) {
    versions.source = source.version;
  }

  const rustCore = readJSON(FILES.rustCore);
  if (rustCore) {
    versions.rustCore = rustCore.version;
  }

  const plugin = readJSON(FILES.plugin);
  if (plugin) {
    versions.plugin = plugin.version;
  }

  if (fs.existsSync(FILES.marketplace)) {
    const marketplace = readJSON(FILES.marketplace);
    if (marketplace && marketplace.plugins && marketplace.plugins[0]) {
      versions.marketplace = marketplace.plugins[0].version;
    }
  }

  return versions;
}

function checkVersions() {
  const versions = getVersions();

  console.log('Current versions:');
  console.log(`  unity-agentic-tools/package.json: ${versions.source || 'not found'}`);
  console.log(`  rust-core/package.json: ${versions.rustCore || 'not found'}`);
  console.log(`  .claude-plugin/plugin.json: ${versions.plugin || 'not found'}`);
  console.log(`  marketplace.json: ${versions.marketplace || 'not found'}`);

  const allVersions = Object.values(versions).filter(Boolean);
  const uniqueVersions = [...new Set(allVersions)];

  if (uniqueVersions.length === 0) {
    console.error('\nNo versions found!');
    return false;
  }

  if (uniqueVersions.length === 1) {
    console.log(`\nAll versions are synchronized: ${uniqueVersions[0]}`);
    return true;
  }

  console.error('\nVersion mismatch detected!');
  return false;
}

function syncVersions(targetVersion) {
  const source = readJSON(FILES.source);
  const version = targetVersion || (source && source.version);

  if (!version) {
    console.error('No version found in source file');
    process.exit(1);
  }

  console.log(`Syncing all files to version: ${version}`);

  // Update source if setting specific version
  if (targetVersion && source) {
    source.version = version;
    writeJSON(FILES.source, source);
    console.log(`  Updated: unity-agentic-tools/package.json`);
  }

  // Update rust-core/package.json
  const rustCore = readJSON(FILES.rustCore);
  if (rustCore) {
    rustCore.version = version;
    writeJSON(FILES.rustCore, rustCore);
    console.log(`  Updated: rust-core/package.json`);
  }

  // Update plugin.json
  const plugin = readJSON(FILES.plugin);
  if (plugin) {
    plugin.version = version;
    writeJSON(FILES.plugin, plugin);
    console.log(`  Updated: .claude-plugin/plugin.json`);
  }

  // Update marketplace.json (optional — may not exist yet)
  if (fs.existsSync(FILES.marketplace)) {
    const marketplace = readJSON(FILES.marketplace);
    if (marketplace && marketplace.plugins && marketplace.plugins[0]) {
      marketplace.plugins[0].version = version;
      writeJSON(FILES.marketplace, marketplace);
      console.log(`  Updated: marketplace.json`);
    }
  }

  console.log('\nVersion synchronization complete!');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--check')) {
  const synced = checkVersions();
  process.exit(synced ? 0 : 1);
} else if (args.includes('--set')) {
  const versionIndex = args.indexOf('--set') + 1;
  const version = args[versionIndex];
  if (!version || version.startsWith('-')) {
    console.error('Usage: bun scripts/sync-version.js --set <version>');
    process.exit(1);
  }
  syncVersions(version);
} else {
  syncVersions();
}
