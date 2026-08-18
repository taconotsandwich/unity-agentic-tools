#!/usr/bin/env bun
/**
 * Version Synchronization Script
 *
 * Ensures version consistency across:
 * - unity-agentic-tools/package.json (source of truth)
 * - unity-package/package.json
 * - unity-package/Editor/Bridge/BridgeMetadata.cs
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
  unityPackage: path.join(ROOT, 'unity-package', 'package.json'),
  bridgeMetadata: path.join(ROOT, 'unity-package', 'Editor', 'Bridge', 'BridgeMetadata.cs'),
};

const BRIDGE_VERSION_PATTERN = /public const string PackageVersion = "([^"]+)";/;

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

function readBridgeVersion(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(BRIDGE_VERSION_PATTERN);
    return match ? match[1] : null;
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    return null;
  }
}

function writeBridgeVersion(filePath, version) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.replace(
    BRIDGE_VERSION_PATTERN,
    `public const string PackageVersion = "${version}";`
  );

  if (updated === content && readBridgeVersion(filePath) !== version) {
    throw new Error(`PackageVersion declaration not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, updated);
}

function getVersions() {
  const versions = {};

  const source = readJSON(FILES.source);
  versions.source = source ? source.version : null;

  const unityPackage = readJSON(FILES.unityPackage);
  versions.unityPackage = unityPackage ? unityPackage.version : null;

  versions.bridgeMetadata = readBridgeVersion(FILES.bridgeMetadata);

  return versions;
}

function checkVersions() {
  const versions = getVersions();

  console.log('Current versions:');
  console.log(`  unity-agentic-tools/package.json: ${versions.source || 'not found'}`);
  console.log(`  unity-package/package.json: ${versions.unityPackage || 'not found'}`);
  console.log(`  unity-package/Editor/Bridge/BridgeMetadata.cs: ${versions.bridgeMetadata || 'not found'}`);

  const missingVersions = Object.entries(versions).filter(([, version]) => !version);
  if (missingVersions.length > 0) {
    console.error('\nOne or more version sources are missing!');
    return false;
  }

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

  // Update unity-package/package.json
  const unityPackage = readJSON(FILES.unityPackage);
  if (unityPackage) {
    unityPackage.version = version;
    writeJSON(FILES.unityPackage, unityPackage);
    console.log(`  Updated: unity-package/package.json`);
  }

  writeBridgeVersion(FILES.bridgeMetadata, version);
  console.log(`  Updated: unity-package/Editor/Bridge/BridgeMetadata.cs`);

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
