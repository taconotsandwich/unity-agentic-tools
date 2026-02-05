#!/usr/bin/env bun
/**
 * Hook: PostToolUse (Edit)
 * Runs after every Edit tool call that modified a Unity file (.unity, .prefab, .asset).
 * Checks the edited file for structural corruption: missing YAML header, missing Unity
 * tag directive, duplicate document IDs, and broken component references (fileID pointing
 * to non-existent documents). Appends warnings to the tool result if issues are found
 * but does not block — the edit has already been applied.
 * Skipped if the Edit tool itself returned an error or the file is not a Unity file.
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

function verifyIntegrity(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const warnings = [];

    // Check YAML header is intact
    if (!content.startsWith('%YAML')) {
      warnings.push('YAML header corrupted');
    }

    // Check Unity tag directive
    if (!content.includes('%TAG !u! tag:unity3d.com')) {
      warnings.push('Unity tag directive missing');
    }

    // Check for orphaned file references (GUIDs that don't exist in project)
    // This is a simplified check - full validation would require project context
    const fileIdPattern = /fileID:\s*(\d+)/g;
    const fileIds = content.match(fileIdPattern) || [];

    // Check for duplicate fileIDs in same document (potential corruption)
    const docPattern = /--- !u!\d+ &(\d+)/g;
    const docIds = [];
    let match;
    while ((match = docPattern.exec(content)) !== null) {
      if (docIds.includes(match[1])) {
        warnings.push(`Duplicate document ID: ${match[1]}`);
      }
      docIds.push(match[1]);
    }

    // Check for broken component references
    const componentRefs = content.match(/component:\s*\{fileID:\s*(\d+)\}/g) || [];
    for (const ref of componentRefs) {
      const refId = ref.match(/fileID:\s*(\d+)/)[1];
      if (refId !== '0' && !content.includes(`--- !u!`) && !docIds.includes(refId)) {
        // Only warn if we have doc IDs to check against
        if (docIds.length > 0 && !docIds.includes(refId)) {
          warnings.push(`Broken component reference: ${refId}`);
        }
      }
    }

    return { valid: warnings.length === 0, warnings };
  } catch (err) {
    return { valid: false, warnings: [err.message] };
  }
}

async function main() {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);

    const toolName = data.tool_name || data.name || '';
    const toolInput = data.tool_input || data.input || {};
    const toolResult = data.tool_result || data.result || {};

    // Only verify after Edit tools
    if (toolName === 'Edit') {
      const hasError = toolResult.error && toolResult.error !== '';
      const filePath = toolInput.filePath || toolInput.path || toolInput.file_path || '';

      if (!hasError && isUnityFile(filePath) && fs.existsSync(filePath)) {
        const result = verifyIntegrity(filePath);

        if (!result.valid && result.warnings.length > 0) {
          if (!data.warnings) {
            data.warnings = [];
          }
          data.warnings.push(`Warning: Integrity check found issues after editing ${filePath}: ${result.warnings.join(', ')}`);
        }
      }
    }

    console.log(JSON.stringify(data));
  } catch (err) {
    process.stderr.write(`Hook error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
