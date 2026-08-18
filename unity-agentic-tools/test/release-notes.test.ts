import { describe, expect, it } from 'vitest';
import { extract_section } from '../../scripts/release-notes.js';

const CHANGELOG = [
    '# Changelog',
    '',
    'Preamble prose that must never leak into a release body.',
    '',
    '## 0.8.0',
    '',
    '- Newest release.',
    '',
    '## 0.7.0',
    '',
    '- Reads wait out domain reloads.',
    '- `stream` reconnects on its own.',
    '',
    '## 0.6.9',
    '',
    '- Older release.',
    '',
].join('\n');

describe('extract_section', () => {
    it('returns the bullets for a version', () => {
        expect(extract_section(CHANGELOG, '0.7.0')).toBe(
            '- Reads wait out domain reloads.\n- `stream` reconnects on its own.',
        );
    });

    it('stops at the next heading rather than bleeding into older releases', () => {
        const section = extract_section(CHANGELOG, '0.8.0');

        expect(section).toBe('- Newest release.');
        expect(section).not.toContain('0.7.0');
        expect(section).not.toContain('Reads wait out');
    });

    it('reads the last section to the end of the file', () => {
        expect(extract_section(CHANGELOG, '0.6.9')).toBe('- Older release.');
    });

    it('never captures the preamble above the first release', () => {
        expect(extract_section(CHANGELOG, '0.8.0')).not.toContain('Preamble prose');
    });

    it('returns null for a version with no section', () => {
        expect(extract_section(CHANGELOG, '9.9.9')).toBeNull();
    });

    it('distinguishes an empty section from a missing one', () => {
        const empty = ['## 1.0.0', '', '## 0.9.0', '', '- Something.', ''].join('\n');

        expect(extract_section(empty, '1.0.0')).toBe('');
        expect(extract_section(empty, '0.9.0')).toBe('- Something.');
    });

    it('does not match a version that is only a prefix of a heading', () => {
        const versions = ['## 0.7.10', '', '- Ten.', ''].join('\n');

        expect(extract_section(versions, '0.7.1')).toBeNull();
        expect(extract_section(versions, '0.7.10')).toBe('- Ten.');
    });

    it('ignores deeper headings inside a section', () => {
        const nested = ['## 1.0.0', '', '### Fixed', '', '- A fix.', '', '## 0.9.0', '', '- Old.', ''].join('\n');

        expect(extract_section(nested, '1.0.0')).toBe('### Fixed\n\n- A fix.');
    });
});
