#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'unity-package', 'Editor', 'Commands', 'Registry.cs');
const referenceDir = join(root, 'skills', 'unity-agentic-tools', 'reference');

const registry = readFileSync(registryPath, 'utf8');
const commandRegex = /new BuiltInCommand\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)/g;
const commands = [...registry.matchAll(commandRegex)].map((match) => ({
    name: match[1],
    typeName: match[2],
    memberName: match[3],
    description: match[4],
}));

if (commands.length === 0) {
    throw new Error(`No BuiltInCommand entries found in ${registryPath}`);
}

const groups = new Map();
for (const command of commands) {
    const group = command.name.includes('.') ? command.name.split('.')[0] : 'other';
    const existing = groups.get(group) ?? [];
    existing.push(command);
    groups.set(group, existing);
}

const lines = [
    '# Command Reference',
    '',
    'Generated from `unity-package/Editor/Commands/Registry.cs`.',
    '',
    'Use aliases before raw public static C# targets.',
    '',
];

for (const [group, groupCommands] of groups) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Alias | Backing API | Purpose |');
    lines.push('|-------|-------------|---------|');
    for (const command of groupCommands) {
        const backingApi = `${command.typeName}.${command.memberName}`;
        lines.push(`| \`${command.name}\` | \`${backingApi}\` | ${command.description} |`);
    }
    lines.push('');
}

const generated = `${lines.join('\n').trim()}\n`;
mkdirSync(referenceDir, { recursive: true });
const generatedPath = join(referenceDir, 'command-reference.md');
writeFileSync(generatedPath, generated);

console.log(`Generated ${commands.length} command reference entries at ${generatedPath}.`);
