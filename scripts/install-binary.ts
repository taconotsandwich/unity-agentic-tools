#!/usr/bin/env bun
/**
 * Downloads and installs the pre-built native Rust binary for the current platform.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';

const REPO = 'taconotsandwich/unity-agentic-tools';
const BINARY_NAME = 'unity-agentic-core';

// Map platform/arch to binary filename
function getBinaryFilename(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') {
    return `${BINARY_NAME}.darwin-arm64.node`;
  } else if (platform === 'darwin' && arch === 'x64') {
    return `${BINARY_NAME}.darwin-x64.node`;
  } else if (platform === 'linux' && arch === 'x64') {
    return `${BINARY_NAME}.linux-x64-gnu.node`;
  } else if (platform === 'win32' && arch === 'x64') {
    return `${BINARY_NAME}.win32-x64-msvc.node`;
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
}

async function getLatestReleaseUrl(filename: string): Promise<string> {
  // Get latest release info from GitHub API
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;

  console.log('Fetching latest release info...');
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'unity-agentic-tools-installer'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch release info: ${response.status} ${response.statusText}`);
  }

  const release = await response.json() as { assets: Array<{ name: string; browser_download_url: string }> };
  const asset = release.assets.find((a: { name: string }) => a.name === filename);

  if (!asset) {
    throw new Error(`Binary ${filename} not found in latest release. Available: ${release.assets.map((a: { name: string }) => a.name).join(', ')}`);
  }

  return asset.browser_download_url;
}

async function downloadBinary(url: string, destPath: string): Promise<void> {
  console.log(`Downloading from: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'unity-agentic-tools-installer'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();

  // Ensure directory exists
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(destPath, Buffer.from(buffer));

  // Make executable on Unix
  if (process.platform !== 'win32') {
    chmodSync(destPath, 0o755);
  }

  console.log(`Saved to: ${destPath}`);
}

async function buildTypeScript(pluginRoot: string): Promise<void> {
  console.log('Building TypeScript...');

  const { execSync } = await import('child_process');

  // Install dependencies if needed
  const unityYamlDir = join(pluginRoot, 'unity-yaml');
  if (!existsSync(join(unityYamlDir, 'node_modules'))) {
    console.log('Installing dependencies...');
    execSync('bun install', { cwd: unityYamlDir, stdio: 'inherit' });
  }

  // Build
  execSync('bun run build', { cwd: unityYamlDir, stdio: 'inherit' });
  console.log('Build complete!');
}

async function main() {
  console.log('=== Unity Agentic Tools - Binary Installer ===\n');

  // Determine paths
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const pluginRoot = join(scriptDir, '..');
  const rustCoreDir = join(pluginRoot, 'rust-core');

  try {
    // Get binary filename for this platform
    const filename = getBinaryFilename();
    console.log(`Platform: ${process.platform}-${process.arch}`);
    console.log(`Binary: ${filename}\n`);

    const destPath = join(rustCoreDir, filename);

    // Check if already installed
    if (existsSync(destPath)) {
      console.log('Binary already exists. Skipping download.');
    } else {
      // Get download URL and download
      const downloadUrl = await getLatestReleaseUrl(filename);
      await downloadBinary(downloadUrl, destPath);
      console.log('\nBinary installed successfully!');
    }

    // Build TypeScript
    await buildTypeScript(pluginRoot);

    console.log('\n=== Installation Complete ===');
    console.log('You can now use the Unity Agentic Tools commands.');

  } catch (error) {
    console.error('\nInstallation failed:', (error as Error).message);
    console.error('\nManual installation:');
    console.error(`1. Download the binary from: https://github.com/${REPO}/releases`);
    console.error(`2. Place it in: ${rustCoreDir}/`);
    console.error('3. Run: cd unity-yaml && bun run build');
    process.exit(1);
  }
}

main();
