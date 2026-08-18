import { describe, expect, it } from 'bun:test';
import { build_registry_list_params, build_registry_run_params } from '../src/registry-invoke';

function decode(args: string): string[] {
    return JSON.parse(args) as string[];
}

describe('build_registry_run_params', () => {
    it('always sends the allowRaw gate, so an omitted flag is not a missing argument', () => {
        const params = build_registry_run_params({ target: 'scene.hierarchy', command_args_json: '[]' });
        expect(params.type).toBe('UnityAgenticTools.Commands.Registry');
        expect(params.member).toBe('Run');
        expect(decode(params.args)).toEqual(['scene.hierarchy', '[]', 'false']);
    });

    it('keeps allowRaw third when raw invocation is requested', () => {
        const params = build_registry_run_params({
            target: 'UnityEditor.EditorApplication.ExecuteMenuItem',
            command_args_json: '["Assets/Refresh"]',
            allow_raw: true,
        });
        expect(decode(params.args)).toEqual([
            'UnityEditor.EditorApplication.ExecuteMenuItem',
            '["Assets/Refresh"]',
            'true',
        ]);
    });

    it('appends set after allowRaw rather than in its place', () => {
        const params = build_registry_run_params({
            target: 'query.object',
            command_args_json: '["@h1"]',
            set: 'enabled=false',
        });
        expect(decode(params.args)).toEqual(['query.object', '["@h1"]', 'false', 'enabled=false']);
    });
});

describe('build_registry_list_params', () => {
    it('sends an empty query as an empty string, not a dropped argument', () => {
        expect(decode(build_registry_list_params('').args)).toEqual(['', 'false']);
    });

    it('passes the raw flag through', () => {
        expect(decode(build_registry_list_params('scene', true).args)).toEqual(['scene', 'true']);
    });
});
