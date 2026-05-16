export function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
