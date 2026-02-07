import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../../src/tokenizer';

describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('should return 1 for 1-4 character strings (Math.ceil)', () => {
        expect(estimateTokens('a')).toBe(1);
        expect(estimateTokens('ab')).toBe(1);
        expect(estimateTokens('abc')).toBe(1);
        expect(estimateTokens('abcd')).toBe(1);
    });

    it('should return 3 for 11 characters (ceil(11/4))', () => {
        expect(estimateTokens('hello world')).toBe(3);
    });

    it('should return 2500 for a 10000-character string', () => {
        const longStr = 'a'.repeat(10000);
        expect(estimateTokens(longStr)).toBe(2500);
    });

    it('should return 0 for falsy/empty input', () => {
        expect(estimateTokens('')).toBe(0);
    });
});
