#!/usr/bin/env node
/**
 * Hook: SessionStart (Claude Code)
 * Purpose: Index Unity documentation if available
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

async function readStdin() {
  const rl = readline.createInterface({ input: process.stdin });
  const lines = [];
  for await (const line of rl) {
    lines.push(line);
  }
  return lines.join('\n');
}

async function main() {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);

    const cwd = data.cwd || process.cwd();

    // Check if Unity docs directory exists
    const docsPath = path.join(cwd, 'docs', 'unity');
    const cachePath = path.join(cwd, '.cache', 'unity_search');

    if (fs.existsSync(docsPath) || fs.existsSync(cachePath)) {
      // Documentation exists, index is already built or will be built on first search
      console.log(JSON.stringify(data));
      process.exit(0);
    }

    // Check for Unity project
    const projectVersionPath = path.join(cwd, 'ProjectSettings', 'ProjectVersion.txt');

    if (fs.existsSync(projectVersionPath)) {
      try {
        const versionContent = fs.readFileSync(projectVersionPath, 'utf-8');
        const versionMatch = versionContent.match(/m_EditorVersion:\s*(\S+)/);

        if (versionMatch) {
          const version = versionMatch[1];

          // Check if docs are linked
          const docsLink = path.join(cwd, 'docs', 'unity');
          if (fs.existsSync(docsLink) && fs.lstatSync(docsLink).isSymbolicLink()) {
            data.context = (data.context || '') + `# Unity docs linked for version ${version}\n`;
          }
        }
      } catch (err) {
        // Ignore read errors
      }
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
