import { describe, expect, it } from 'vitest';
import { ParamNormalizer, Result } from '../src/params';

describe('ParamNormalizer', () => {
    describe('get() with case fallback', () => {
        it('returns value for exact match', () => {
            const params = new ParamNormalizer({ pageSize: 100 });
            expect(params.get('pageSize')).toBe(100);
        });

        it('returns snake_case when camelCase requested', () => {
            const params = new ParamNormalizer({ page_size: 100 });
            expect(params.get('pageSize')).toBe(100);
        });

        it('returns camelCase when snake_case requested', () => {
            const params = new ParamNormalizer({ pageSize: 100 });
            expect(params.get('page_size')).toBe(100);
        });

        it('prioritizes exact match over case variant', () => {
            const params = new ParamNormalizer({ pageSize: 100, page_size: 200 });
            expect(params.get('pageSize')).toBe(100);
            expect(params.get('page_size')).toBe(200);
        });

        it('returns default value when key not found', () => {
            const params = new ParamNormalizer({});
            expect(params.get('missing', 42)).toBe(42);
        });

        it('returns undefined when key not found and no default', () => {
            const params = new ParamNormalizer({});
            expect(params.get('missing')).toBeUndefined();
        });

        it('handles multi-word snake_case to camelCase', () => {
            const params = new ParamNormalizer({ include_inactive_objects: true });
            expect(params.get('includeInactiveObjects')).toBe(true);
        });

        it('handles multi-word camelCase to snake_case', () => {
            const params = new ParamNormalizer({ includeInactiveObjects: true });
            expect(params.get('include_inactive_objects')).toBe(true);
        });

        it('handles consecutive capitals correctly', () => {
            const params = new ParamNormalizer({ includeHTMLTags: false });
            expect(params.get('include_h_t_m_l_tags')).toBe(false);
        });

        it('handles empty string as valid value', () => {
            const params = new ParamNormalizer({ name: '' });
            expect(params.get('name')).toBe('');
        });

        it('handles null as valid value', () => {
            const params = new ParamNormalizer({ value: null });
            expect(params.get('value')).toBeNull();
        });

        it('handles zero as valid value', () => {
            const params = new ParamNormalizer({ count: 0 });
            expect(params.get('count')).toBe(0);
        });
    });

    describe('getRequired()', () => {
        it('returns value when present', () => {
            const params = new ParamNormalizer({ required: 'value' });
            expect(params.getRequired('required')).toBe('value');
        });

        it('throws when parameter missing', () => {
            const params = new ParamNormalizer({});
            expect(() => params.getRequired('missing')).toThrow("Required parameter 'missing' is missing");
        });

        it('throws when parameter is null', () => {
            const params = new ParamNormalizer({ field: null });
            expect(() => params.getRequired('field')).toThrow("Required parameter 'field' is missing");
        });

        it('throws when parameter is empty string', () => {
            const params = new ParamNormalizer({ field: '' });
            expect(() => params.getRequired('field')).toThrow("Required parameter 'field' is missing");
        });

        it('throws custom error message', () => {
            const params = new ParamNormalizer({});
            expect(() => params.getRequired('field', 'Custom error')).toThrow('Custom error');
        });

        it('accepts zero as valid required value', () => {
            const params = new ParamNormalizer({ count: 0 });
            expect(params.getRequired('count')).toBe(0);
        });

        it('accepts false as valid required value', () => {
            const params = new ParamNormalizer({ flag: false });
            expect(params.getRequired('flag')).toBe(false);
        });
    });

    describe('getBool()', () => {
        it('returns boolean value as-is', () => {
            const params = new ParamNormalizer({ flag: true });
            expect(params.getBool('flag')).toBe(true);
        });

        it.each(['true', 'TRUE'])('converts string "%s" to true', (input) => {
            const params = new ParamNormalizer({ flag: input });
            expect(params.getBool('flag')).toBe(true);
        });

        it.each(['false', 'no', 'yes', ''])('converts string "%s" to false', (input) => {
            const params = new ParamNormalizer({ flag: input });
            expect(params.getBool('flag')).toBe(false);
        });

        it.each([
            { label: 'missing key with default false', params: {}, key: 'missing', defaultVal: undefined, expected: false },
            { label: 'missing key with default true', params: {}, key: 'missing', defaultVal: true, expected: true },
            { label: 'null value with default false', params: { flag: null }, key: 'flag', defaultVal: undefined, expected: false },
        ])('returns $expected for $label', ({ params: raw, key, defaultVal, expected }) => {
            const params = new ParamNormalizer(raw);
            expect(params.getBool(key, defaultVal)).toBe(expected);
        });
    });

    describe('getInt()', () => {
        it('returns number value as-is', () => {
            const params = new ParamNormalizer({ count: 42 });
            expect(params.getInt('count')).toBe(42);
        });

        it('parses string number', () => {
            const params = new ParamNormalizer({ count: '42' });
            expect(params.getInt('count')).toBe(42);
        });

        it('parses negative numbers', () => {
            const params = new ParamNormalizer({ offset: '-10' });
            expect(params.getInt('offset')).toBe(-10);
        });

        it('parses zero', () => {
            const params = new ParamNormalizer({ value: '0' });
            expect(params.getInt('value')).toBe(0);
        });

        it('returns default for invalid string', () => {
            const params = new ParamNormalizer({ count: 'abc' });
            expect(params.getInt('count', 99)).toBe(99);
        });

        it.each([
            { label: 'missing with default', params: {}, key: 'missing', defaultVal: 10, expected: 10 },
            { label: 'missing without default', params: {}, key: 'missing', defaultVal: undefined, expected: undefined },
            { label: 'null with default', params: { count: null }, key: 'count', defaultVal: 5, expected: 5 },
        ])('returns $expected for $label', ({ params: raw, key, defaultVal, expected }) => {
            const params = new ParamNormalizer(raw);
            expect(params.getInt(key, defaultVal)).toBe(expected);
        });

        it('truncates float to integer', () => {
            const params = new ParamNormalizer({ value: '3.14' });
            expect(params.getInt('value')).toBe(3);
        });

        it('handles hexadecimal strings as decimal', () => {
            const params = new ParamNormalizer({ value: '0x10' });
            expect(params.getInt('value')).toBe(0); // parseInt('0x10', 10) = 0
        });
    });

    describe('has()', () => {
        it('returns true for exact match', () => {
            const params = new ParamNormalizer({ field: 'value' });
            expect(params.has('field')).toBe(true);
        });

        it('returns true with snake_case when camelCase exists', () => {
            const params = new ParamNormalizer({ pageSize: 100 });
            expect(params.has('page_size')).toBe(true);
        });

        it('returns true with camelCase when snake_case exists', () => {
            const params = new ParamNormalizer({ page_size: 100 });
            expect(params.has('pageSize')).toBe(true);
        });

        it('returns false when key not found', () => {
            const params = new ParamNormalizer({});
            expect(params.has('missing')).toBe(false);
        });

        it.each([
            { label: 'null', value: null },
            { label: 'undefined', value: undefined },
        ])('returns true even when value is $label', ({ value }) => {
            const params = new ParamNormalizer({ field: value });
            expect(params.has('field')).toBe(true);
        });
    });

    describe('getRaw()', () => {
        it('returns objects without modification', () => {
            const obj = { x: 1, y: 2, z: 3 };
            const params = new ParamNormalizer({ position: obj });
            expect(params.getRaw('position')).toEqual(obj);
            expect(params.getRaw('position')).toBe(obj); // Same reference
        });
    });
});

describe('Result', () => {
    describe('Success', () => {
        it('creates successful result with correct properties', () => {
            const data = { name: 'test', id: 123 };
            const result = Result.Success(data);
            expect(result.isSuccess).toBe(true);
            expect(result.value).toEqual(data);
            expect(result.errorMessage).toBeNull();
        });
    });

    describe('Error', () => {
        it('creates error result', () => {
            const result = Result.Error<number>('Something went wrong');
            expect(result.isSuccess).toBe(false);
            expect(result.value).toBeNull();
            expect(result.errorMessage).toBe('Something went wrong');
        });
    });

    describe('getOrError()', () => {
        it('extracts value from successful result', () => {
            const result = Result.Success(42);
            const out: { value?: number } = {};
            const error = result.getOrError(out);

            expect(error).toBeNull();
            expect(out.value).toBe(42);
        });

        it('returns error object from failed result', () => {
            const result = Result.Error<number>('Failed');
            const out: { value?: number } = {};
            const error = result.getOrError(out);

            expect(error).toEqual({ error: 'Failed' });
            expect(out.value).toBeUndefined();
        });

        it('handles null value in success result', () => {
            const result = Result.Success(null);
            const out: { value?: null } = {};
            const error = result.getOrError(out);

            // null value is treated as error by getOrError
            expect(error).toEqual({ error: 'Unknown error' });
        });
    });
});
