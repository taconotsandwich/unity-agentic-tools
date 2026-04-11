interface CliOutputOptions {
    drop_keys?: string[];
    drop_null_keys?: string[];
}

export function to_cli_output(result: Record<string, unknown>, options: CliOutputOptions = {}): Record<string, unknown> {
    const output: Record<string, unknown> = { ...result };

    if (output.success === true) {
        delete output.success;
    }

    for (const key of options.drop_keys ?? []) {
        delete output[key];
    }

    for (const key of options.drop_null_keys ?? []) {
        if (output[key] === null) {
            delete output[key];
        }
    }

    for (const [key, value] of Object.entries(output)) {
        if (value === undefined) {
            delete output[key];
        }
    }

    return output;
}
