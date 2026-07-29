#!/usr/bin/env bun
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'unity-package', 'Editor', 'Commands', 'Registry.cs');
const editorDir = join(root, 'unity-package', 'Editor');
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

function collect_cs_sources(dir) {
    const sources = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            sources.push(...collect_cs_sources(fullPath));
        } else if (entry.name.endsWith('.cs')) {
            sources.push(readFileSync(fullPath, 'utf8'));
        }
    }
    return sources;
}

const editorSources = collect_cs_sources(editorDir);

function escape_regex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function find_type_source(typeName) {
    const lastDot = typeName.lastIndexOf('.');
    if (lastDot === -1) {
        return null;
    }
    const namespaceRegex = new RegExp(`namespace\\s+${escape_regex(typeName.slice(0, lastDot))}\\s*[{;\\r\\n]`);
    const classRegex = new RegExp(`\\bclass\\s+${escape_regex(typeName.slice(lastDot + 1))}\\b`);
    return editorSources.find((source) => namespaceRegex.test(source) && classRegex.test(source)) ?? null;
}

function split_params(raw) {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return [];
    }
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of trimmed) {
        if (ch === '<' || ch === '(' || ch === '[') {
            depth += 1;
        } else if (ch === '>' || ch === ')' || ch === ']') {
            depth -= 1;
        }
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function render_param_hint(param) {
    const equalsIndex = param.indexOf('=');
    const optional = equalsIndex !== -1;
    const declaration = (optional ? param.slice(0, equalsIndex) : param).trim();
    const tokens = declaration.split(/\s+/);
    const name = tokens[tokens.length - 1];
    return optional ? `[${name}]` : `<${name}>`;
}

function extract_arg_hint(source, memberName) {
    const memberRegex = new RegExp(`public\\s+static\\s+[^(\\n]*?\\b${escape_regex(memberName)}\\s*\\(([^)]*)\\)`, 'g');
    const signatures = [...source.matchAll(memberRegex)].map((match) => split_params(match[1]));
    if (signatures.length === 0) {
        return null;
    }
    let widest = signatures[0];
    for (const signature of signatures) {
        if (signature.length > widest.length) {
            widest = signature;
        }
    }
    if (widest.length === 0) {
        return '';
    }
    return ` ${widest.map(render_param_hint).join(' ')}`;
}

for (const command of commands) {
    const inRepo = command.typeName.startsWith('UnityAgenticTools.');
    const source = inRepo ? find_type_source(command.typeName) : null;
    const hint = source === null ? null : extract_arg_hint(source, command.memberName);
    if (inRepo && hint === null) {
        throw new Error(`Cannot resolve signature for ${command.typeName}.${command.memberName} (alias ${command.name}).`);
    }
    command.argHint = hint ?? '';
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
    'Use aliases before raw public static C# targets. Argument hints: `<required>` `[optional]`.',
    '',
];

for (const [group, groupCommands] of groups) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Alias | Backing API | Purpose |');
    lines.push('|-------|-------------|---------|');
    for (const command of groupCommands) {
        const backingApi = `${command.typeName}.${command.memberName}`;
        lines.push(`| \`${command.name}${command.argHint}\` | \`${backingApi}\` | ${command.description} |`);
    }
    lines.push('');
}

const generated = `${lines.join('\n').trim()}\n`;
mkdirSync(referenceDir, { recursive: true });
const generatedPath = join(referenceDir, 'command-reference.md');
writeFileSync(generatedPath, generated);

console.log(`Generated ${commands.length} command reference entries at ${generatedPath}.`);
