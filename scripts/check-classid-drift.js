#!/usr/bin/env bun

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLASS_IDS_PATH = path.join(ROOT, 'unity-agentic-tools', 'src', 'class-ids.ts');
const UNITY_CLASSID_URL = process.env.UNITY_CLASSID_URL || 'https://docs.unity3d.com/Manual/ClassIDReference.html';

const CRITICAL_NAMES = [
  'Grid',
  'GridLayout',
  'Tilemap',
  'TilemapCollider2D',
  'TilemapRenderer',
  'TextureImporter',
  'Preset',
];

function decode_entities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parse_unity_class_ids_from_html(html) {
  const start = html.indexOf('Classes ordered by ID number');
  const end = html.indexOf('Classes ordered alphabetically');
  const section = (start >= 0 && end > start) ? html.slice(start, end) : html;

  const plain = decode_entities(
    section
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
  );

  const lines = plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const result = new Map();
  for (let i = 0; i < lines.length - 1; i += 1) {
    const id = lines[i];
    const name = lines[i + 1];
    if (!/^\d+$/.test(id)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (!result.has(name)) {
      result.set(name, Number(id));
    }
  }

  return result;
}

function parse_local_class_ids(tsSource) {
  const map = new Map();
  const regex = /\s*(\d+):\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(tsSource)) !== null) {
    map.set(match[2], Number(match[1]));
  }
  return map;
}

async function fetch_with_timeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function print_failure_details(title, rows, maxRows = 20) {
  if (rows.length === 0) return;
  console.error(`\n${title} (${rows.length}):`);
  for (const row of rows.slice(0, maxRows)) {
    console.error(`  - ${row}`);
  }
  if (rows.length > maxRows) {
    console.error(`  ... and ${rows.length - maxRows} more`);
  }
}

async function main() {
  if (!fs.existsSync(CLASS_IDS_PATH)) {
    console.error(`Could not find class ids file: ${CLASS_IDS_PATH}`);
    process.exit(1);
  }

  const localSource = fs.readFileSync(CLASS_IDS_PATH, 'utf-8');
  const local = parse_local_class_ids(localSource);

  let res;
  try {
    res = await fetch_with_timeout(UNITY_CLASSID_URL, 30000);
  } catch (err) {
    console.error(`Failed to fetch Unity class ID reference: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Failed to fetch Unity class ID reference: HTTP ${res.status}`);
    process.exit(1);
  }

  const html = await res.text();
  const unity = parse_unity_class_ids_from_html(html);

  if (unity.size < 200) {
    console.error(`Parsed too few Unity classes (${unity.size}); page format may have changed.`);
    process.exit(1);
  }

  const mismatches = [];
  for (const [name, localId] of local.entries()) {
    if (name.endsWith('Legacy')) continue;
    const unityId = unity.get(name);
    if (unityId !== undefined && unityId !== localId) {
      mismatches.push(`${name}: local=${localId}, unity=${unityId}`);
    }
  }

  const missingCritical = [];
  for (const name of CRITICAL_NAMES) {
    const localId = local.get(name);
    const unityId = unity.get(name);
    if (localId === undefined) {
      missingCritical.push(`${name}: missing locally (unity=${unityId ?? 'unknown'})`);
      continue;
    }
    if (unityId === undefined) {
      missingCritical.push(`${name}: missing in Unity docs parse (local=${localId})`);
      continue;
    }
    if (localId !== unityId) {
      missingCritical.push(`${name}: local=${localId}, unity=${unityId}`);
    }
  }

  const passed = mismatches.length === 0 && missingCritical.length === 0;

  if (!passed) {
    console.error('Unity ClassID drift check failed.');
    print_failure_details('Mismatched IDs for mapped names', mismatches);
    print_failure_details('Critical class validation failures', missingCritical);
    console.error('\nFix class IDs in unity-agentic-tools/src/class-ids.ts to match Unity docs.');
    process.exit(1);
  }

  console.log(`Unity ClassID drift check passed (${unity.size} Unity names parsed, ${local.size} local names).`);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
