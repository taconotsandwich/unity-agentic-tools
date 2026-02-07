import { writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';

export interface AtomicWriteResult {
    success: boolean;
    file_path: string;
    bytes_written?: number;
    error?: string;
}

/**
 * Atomic write: write to temp file, then rename to prevent partial writes.
 */
export function atomicWrite(filePath: string, content: string): AtomicWriteResult {
    const tmpPath = `${filePath}.tmp`;

    try {
        writeFileSync(tmpPath, content, 'utf-8');

        if (existsSync(filePath)) {
            renameSync(filePath, `${filePath}.bak`);
        }

        renameSync(tmpPath, filePath);

        try {
            if (existsSync(`${filePath}.bak`)) {
                unlinkSync(`${filePath}.bak`);
            }
        } catch {
            // Ignore cleanup errors
        }

        return {
            success: true,
            file_path: filePath,
            bytes_written: Buffer.byteLength(content, 'utf-8')
        };
    } catch (error) {
        if (existsSync(`${filePath}.bak`)) {
            try {
                renameSync(`${filePath}.bak`, filePath);
            } catch (restoreError) {
                console.error('Failed to restore backup:', restoreError);
            }
        }

        return {
            success: false,
            file_path: filePath,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Generate a new GUID (32 hex characters).
 */
export function generateGuid(): string {
    const hex = '0123456789abcdef';
    let guid = '';
    for (let i = 0; i < 32; i++) {
        guid += hex[Math.floor(Math.random() * 16)];
    }
    return guid;
}
