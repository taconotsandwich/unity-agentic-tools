#!/usr/bin/env bun
/**
 * Hook: UserPromptSubmit
 * Fires on every user prompt. Scans the prompt text for Unity file references
 * (.unity, .prefab, .asset) and, when found, injects a context tip suggesting
 * the unity-yaml CLI commands (list, find, edit) instead of reading files raw.
 * Does nothing if no Unity file paths are detected in the prompt.
 */

const readline = require('readline');

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
      data.context = '# Use unity-yaml CLI (list/find/inspect/edit) instead of reading Unity files raw.\n' + (data.context || '');
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    // On error, try to pass through original input
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
