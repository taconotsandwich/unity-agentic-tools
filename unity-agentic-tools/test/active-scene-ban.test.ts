import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';

const editor_root = resolve(__dirname, '../../unity-package/Editor');

interface BannedCall {
    /** The literal to search for. Substring match -- these are not regexes. */
    call: string;
    /** Paths relative to unity-package/Editor that are allowed to contain it. */
    allowed: string[];
    /** Why the call is banned, printed when a new file picks it up. */
    rule: string;
}

/**
 * Every mutation and every read in this package names its own target. Asking the
 * editor which scene happens to be selected, or letting `new GameObject` land
 * wherever that is, means acting on something the caller never asked for -- the
 * class of bug that made create.scene fail on a fresh editor, made
 * scene.hierarchy omit additively loaded scenes, and made create.prefab dirty the
 * user's open scene.
 *
 * The rule: read the active scene to restore it, never to decide what to act on,
 * and never write to it implicitly. This test is what keeps that from drifting.
 */
const BANNED_CALLS: BannedCall[] = [
    {
        call: 'GetActiveScene(',
        allowed: ['Util/AssetMutationContext.cs'],
        rule: 'Reading the active scene decides what to act on from editor state instead of from the caller\'s argument. '
            + 'AssetMutationContext reads it only to restore it afterwards.',
    },
    {
        call: 'SetActiveScene(',
        allowed: ['Util/AssetMutationContext.cs'],
        rule: 'Activating a scene changes what every later implicit read resolves to. '
            + 'AssetMutationContext does it only to put back what it found.',
    },
    {
        call: 'new GameObject(',
        allowed: ['Util/SceneObjects.cs'],
        rule: 'Constructing a GameObject writes it into whatever scene the editor has active, '
            + 'even when a reparent moves it out a statement later. Use SceneObjects.Create(name, targetScene).',
    },
];

function collect_cs_files(directory: string): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full_path = join(directory, entry.name);
        if (entry.isDirectory()) {
            found.push(...collect_cs_files(full_path));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.cs')) {
            found.push(full_path);
        }
    }

    return found;
}

/**
 * Comments explain the ban and necessarily quote the banned calls, so matching
 * them would make every explanation a violation.
 */
function strip_comments(source: string): string {
    return source
        .replace(/\r\n?/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

describe('active scene access ban', () => {
    const source_files = collect_cs_files(editor_root);

    it('finds the bridge sources', () => {
        expect(source_files.length).toBeGreaterThan(20);
    });

    it('strips line comments from CRLF source files', () => {
        const source = '// GetActiveScene()\r\nvar value = 1; // new GameObject(\r\n';

        expect(strip_comments(source)).toBe('\nvar value = 1; \n');
    });

    it.each(BANNED_CALLS)('confines $call to its one sanctioned site', ({ call, allowed, rule }) => {
        const offenders: string[] = [];

        for (const file_path of source_files) {
            const relative_path = relative(editor_root, file_path).split('\\').join('/');
            if (allowed.includes(relative_path)) {
                continue;
            }
            if (strip_comments(readFileSync(file_path, 'utf-8')).includes(call)) {
                offenders.push(relative_path);
            }
        }

        expect(
            offenders,
            `${call} is only allowed in ${allowed.join(', ')}. ${rule}`,
        ).toEqual([]);
    });

    it.each(BANNED_CALLS)('keeps the sanctioned site for $call alive', ({ call, allowed }) => {
        for (const relative_path of allowed) {
            const source = strip_comments(readFileSync(join(editor_root, relative_path), 'utf-8'));
            expect(
                source.includes(call),
                `${relative_path} no longer contains ${call}, so the allowlist entry is stale and the ban is silently unenforced.`,
            ).toBe(true);
        }
    });
});
