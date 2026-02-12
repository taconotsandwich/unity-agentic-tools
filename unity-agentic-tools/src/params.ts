/**
 * Parameter normalization utility for handling LLM-generated parameter inconsistencies.
 * Provides bidirectional snake_case/camelCase fallback inspired by CoPlay's ToolParams.
 */

export class ParamNormalizer {
    private params: Record<string, any>;

    constructor(params: Record<string, any>) {
        this.params = params || {};
    }

    /**
     * Get parameter with case-insensitive fallback.
     * Tries exact match first, then opposite case.
     */
    get(key: string, defaultValue?: any): any {
        if (key in this.params) return this.params[key];

        const alt = this.toOppositeCase(key);
        if (alt in this.params) return this.params[alt];

        return defaultValue;
    }

    /**
     * Get required parameter or throw descriptive error.
     */
    getRequired(key: string, errorMsg?: string): any {
        const value = this.get(key);
        if (value === undefined || value === null || value === '') {
            throw new Error(errorMsg || `Required parameter '${key}' is missing`);
        }
        return value;
    }

    /**
     * Get boolean with string coercion ("true" -> true).
     */
    getBool(key: string, defaultValue = false): boolean {
        const value = this.get(key);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        return String(value).toLowerCase() === 'true';
    }

    /**
     * Get integer with string parsing and validation.
     */
    getInt(key: string, defaultValue?: number): number | undefined {
        const value = this.get(key);
        if (value === undefined || value === null) return defaultValue;
        const parsed = parseInt(String(value), 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Check if parameter exists (with case fallback).
     */
    has(key: string): boolean {
        return key in this.params || this.toOppositeCase(key) in this.params;
    }

    /**
     * Get raw value (for objects/arrays) with case fallback.
     */
    getRaw(key: string): any {
        return this.get(key);
    }

    private toOppositeCase(str: string): string {
        if (str.includes('_')) {
            // snake_case -> camelCase
            return str.replace(/_([a-z])/gi, (_, c) => c.toUpperCase());
        } else {
            // camelCase -> snake_case
            return str.replace(/([A-Z])/g, (match) => '_' + match.toLowerCase());
        }
    }
}

/**
 * Result type for parameter validation operations.
 */
export class Result<T> {
    constructor(
        public readonly isSuccess: boolean,
        public readonly value: T | null,
        public readonly errorMessage: string | null
    ) {}

    static Success<T>(value: T): Result<T> {
        return new Result(true, value, null);
    }

    static Error<T>(message: string): Result<T> {
        return new Result(false, null, message);
    }

    /**
     * Extract value or return error response object.
     */
    getOrError(outValue: { value?: T }): { error: string } | null {
        if (this.isSuccess && this.value !== null) {
            outValue.value = this.value;
            return null;
        }
        return { error: this.errorMessage || 'Unknown error' };
    }
}
