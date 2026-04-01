import { describe, expect, it } from 'vitest';
import { ping_editor } from '../src/editor-client';

describe('ping_editor', () => {
    it('should return reachable: false for a non-listening port', async () => {
        const result = await ping_editor(59999, 1000);
        expect(result.reachable).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should respect timeout', async () => {
        const start = Date.now();
        await ping_editor(59998, 500);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(3000);
    });
});
