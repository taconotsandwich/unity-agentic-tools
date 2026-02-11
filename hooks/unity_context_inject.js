#!/usr/bin/env bun
/**
 * Hook: PreToolUse (Read)
 * Runs before any Read tool call targeting a Unity file (.unity, .prefab, .asset).
 * Injects a context tip suggesting the unity-agentic-tools CLI commands (list, find, get, edit)
 * as alternatives to reading the raw YAML, which is verbose and wastes tokens.
 * Does nothing for non-Unity files. Does not block the Read — only adds suggestions.
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

function isUnityFile(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ['.unity', '.prefab', '.asset'].includes(ext);
}

async function main() {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);

    const toolName = data.tool_name || data.name || '';
    const toolInput = data.tool_input || data.input || {};

    // Only inject context for Read tools
    if (toolName === 'Read') {
      const filePath = toolInput.filePath || toolInput.path || toolInput.file_path || '';

      if (isUnityFile(filePath)) {
        data.context = `# Prefer unity-agentic-tools CLI over raw Read for "${path.basename(filePath)}" — use read scene/gameobject or find commands.\n` + (data.context || '');
      }
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
