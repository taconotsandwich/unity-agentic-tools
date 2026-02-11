import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';

export interface TempFixture {
    temp_path: string;
    cleanup_fn: () => void;
}

export function create_temp_fixture(source_path: string): TempFixture {
    const temp_dir = mkdtempSync(join(tmpdir(), 'uat-test-'));
    const temp_path = join(temp_dir, basename(source_path));
    copyFileSync(source_path, temp_path);

    const cleanup_fn = (): void => {
        if (existsSync(temp_dir)) {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    };

    return { temp_path, cleanup_fn };
}
