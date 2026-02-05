#!/usr/bin/env bun
/**
 * Hook: PreToolUse (Edit | Write)
 * Runs before any Edit or Write tool call targeting a Unity file (.unity, .prefab, .asset).
 * Validates the file has a valid Unity YAML header (%YAML), Unity tag directive
 * (%TAG !u! tag:unity3d.com), document markers (--- !u!), and well-formed GUIDs.
 * Blocks the tool call with an error message if validation fails.
 * Passes through silently for non-Unity files or if the file doesn't exist yet.
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

function isUnityFile(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ['.unity', '.prefab', '.asset'].includes(ext);
}

function validateUnityYAML(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for Unity YAML header
    if (!content.startsWith('%YAML')) {
      return { valid: false, error: 'Missing Unity YAML header' };
    }

    // Check for Unity tag directive
    if (!content.includes('%TAG !u! tag:unity3d.com')) {
      return { valid: false, error: 'Missing Unity tag directive' };
    }

    // Check for document markers
    if (!content.includes('--- !u!')) {
      return { valid: false, error: 'No Unity document markers found' };
    }

    // Check for valid GUID format in file references
    const guidPattern = /guid:\s*([a-f0-9]{32})/gi;
    const guids = content.match(guidPattern) || [];
    for (const guid of guids) {
      const value = guid.replace(/guid:\s*/i, '');
      if (!/^[a-f0-9]{32}$/i.test(value)) {
        return { valid: false, error: `Invalid GUID format: ${value}` };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function main() {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);

    const toolName = data.tool_name || data.name || '';
    const toolInput = data.tool_input || data.input || {};

    // Only validate for Edit and Write tools
    if (toolName === 'Edit' || toolName === 'Write') {
      const filePath = toolInput.filePath || toolInput.path || toolInput.file_path || '';

      if (isUnityFile(filePath) && fs.existsSync(filePath)) {
        const result = validateUnityYAML(filePath);

        if (!result.valid) {
          data.decision = 'block';
          data.message = `Unity file validation failed: ${result.error}. Please fix errors before editing ${filePath}.`;
          console.log(JSON.stringify(data));
          process.exit(1);
        }
      }
    }

    // Pass through
    console.log(JSON.stringify(data));
  } catch (err) {
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
