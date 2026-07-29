import { existsSync } from 'fs';
import * as path from 'path';

export const EXTERNAL_FIXTURE_PATH = path.resolve(__dirname, '../../test/fixtures/external');

/**
 * Fail loudly when the external Unity project submodule is missing, instead of
 * letting the parsers report a bare "file not found" that says nothing about
 * how to fix it.
 */
export function require_external_fixture(): string {
    if (!existsSync(path.join(EXTERNAL_FIXTURE_PATH, 'ProjectSettings'))) {
        throw new Error(
            `Test fixture missing at ${EXTERNAL_FIXTURE_PATH}.\n` +
            `It is a git submodule. Run: git submodule update --init --recursive`
        );
    }

    return EXTERNAL_FIXTURE_PATH;
}
