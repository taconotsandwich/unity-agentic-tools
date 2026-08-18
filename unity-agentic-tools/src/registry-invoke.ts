// Every caller of the Unity command registry goes through here. The registry
// takes its arguments positionally, so a caller that builds them itself drifts
// silently the moment the signature grows a parameter: the stress harness kept
// sending [target, argsJson] after `run` added the allowRaw gate, and every
// raw invocation it made failed with -32603.
const REGISTRY_TYPE = 'UnityAgenticTools.Commands.Registry';

export interface RegistryInvokeParams extends Record<string, unknown> {
    type: string;
    member: string;
    args: string;
}

export interface RegistryRunRequest {
    target: string;
    command_args_json: string;
    allow_raw?: boolean;
    set?: string;
}

function bool_arg(value: boolean | undefined): string {
    return value === true ? 'true' : 'false';
}

export function build_registry_run_params(request: RegistryRunRequest): RegistryInvokeParams {
    const values = [request.target, request.command_args_json, bool_arg(request.allow_raw)];
    if (request.set !== undefined) {
        values.push(request.set);
    }
    return { type: REGISTRY_TYPE, member: 'Run', args: JSON.stringify(values) };
}

export function build_registry_list_params(query: string, allow_raw?: boolean): RegistryInvokeParams {
    return {
        type: REGISTRY_TYPE,
        member: 'List',
        args: JSON.stringify([query, bool_arg(allow_raw)]),
    };
}
