#!/usr/bin/env bun
/**
 * Hook: UserPromptSubmit
 * Fires on every user prompt. Scans the prompt text for Unity file references
 * (.unity, .prefab, .asset) and, when found, injects a context tip suggesting
 * the unity-yaml CLI commands (list, find, edit) instead of reading files raw.
 * Does nothing if no Unity file paths are detected in the prompt.
 */

const readline = require('readline');
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

    const userPrompt = data.user_prompt || data.prompt || '';

    // Match Unity file references
    const unityFilePattern = /\S+\.(unity|prefab|asset)/g;
    const matches = userPrompt.match(unityFilePattern) || [];
    const uniqueFiles = [...new Set(matches)];

    if (uniqueFiles.length > 0) {
      let context = '# Tip: Use Unity-specific tools for token efficiency\n';

      for (const file of uniqueFiles) {
        const ext = path.extname(file).slice(1);
        if (ext === 'unity' || ext === 'prefab') {
          context += '- scene-list: List hierarchy\n';
          context += '- scene-find: Find objects\n';
          context += '- yaml-edit: Edit values\n';
        } else if (ext === 'asset') {
          context += '- scene-list: List hierarchy\n';
          context += '- get-asset: Get properties\n';
        }
      }

      data.context = context + (data.context || '');
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    // On error, try to pass through original input
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
