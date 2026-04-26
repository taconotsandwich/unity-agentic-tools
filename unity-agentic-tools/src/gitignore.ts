import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const AGENTIC_DIR = '.unity-agentic';
const GITIGNORE_ENTRY = `${AGENTIC_DIR}/`;
const ACCEPTED_AGENTIC_PATTERNS = new Set([
    AGENTIC_DIR,
    GITIGNORE_ENTRY,
    `/${AGENTIC_DIR}`,
    `/${GITIGNORE_ENTRY}`,
]);

export function ensure_gitignore_ignores_agentic_dir(project_path: string): void {
    const gitignore_path = join(project_path, '.gitignore');

    if (!existsSync(gitignore_path)) {
        writeFileSync(gitignore_path, `${GITIGNORE_ENTRY}\n`);
        return;
    }

    const content = readFileSync(gitignore_path, 'utf-8');
    if (gitignore_ignores_agentic_dir(content)) {
        return;
    }

    const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignore_path, `${content}${separator}${GITIGNORE_ENTRY}\n`);
}

export function gitignore_ignores_agentic_dir(content: string): boolean {
    for (const raw_line of content.split(/\r?\n/)) {
        const line = raw_line.trim();
        if (line.length === 0 || line.startsWith('#')) {
            continue;
        }

        if (ACCEPTED_AGENTIC_PATTERNS.has(line)) {
            return true;
        }
    }

    return false;
}
