#!/usr/bin/env bun
/**
 * Hook: PreToolUse (Claude Code)
 * Purpose: Inject Unity tool suggestions for Read operations
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
        const suggestion = `# Tip: For Unity files, use specialized tools for token efficiency:
# - List hierarchy: bun unity-yaml/dist/cli.js list "${filePath}"
# - Find object: bun unity-yaml/dist/cli.js find "${filePath}" <pattern>
# - Get details: bun unity-yaml/dist/cli.js get "${filePath}" <object_id>
# - Edit value: bun unity-yaml/dist/cli.js edit "${filePath}" <object_name> <property> <value> --save
`;
        data.context = suggestion + (data.context || '');
      }
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
