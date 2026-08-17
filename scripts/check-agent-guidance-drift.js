#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { referencePath, render_command_reference } from './generate-agent-guidance.js';

const { text, count } = render_command_reference();

let committed;
try {
    committed = readFileSync(referencePath, 'utf8');
} catch {
    console.error(`Missing ${referencePath}. Run: bun run generate:agent-guidance`);
    process.exit(1);
}

if (committed !== text) {
    console.error('Command reference has drifted from Registry.cs.');
    console.error('Run: bun run generate:agent-guidance, then commit the result.');
    process.exit(1);
}

console.log(`Command reference is in sync with Registry.cs (${count} entries).`);
