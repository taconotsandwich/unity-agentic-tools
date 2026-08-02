import { describe, test, expect } from 'vitest';
import { parse_batch_spec, run_batch, type BatchItem } from '../src/batch';
import type { RpcResponse } from '../src/types';

function ok_response(result: unknown): RpcResponse {
    return { jsonrpc: '2.0', id: 'test', result };
}

function error_response(code: number, message: string): RpcResponse {
    return { jsonrpc: '2.0', id: 'test', error: { code, message } };
}

describe('parse_batch_spec', () => {
    test('rejects invalid JSON', () => {
        expect(() => parse_batch_spec('not-json')).toThrow('not valid JSON');
    });

    test('rejects non-array JSON', () => {
        expect(() => parse_batch_spec('{"target":"scene.save"}')).toThrow('non-empty JSON array');
    });

    test('rejects an empty batch', () => {
        expect(() => parse_batch_spec('[]')).toThrow('non-empty JSON array');
    });

    test('rejects an item that is not an array', () => {
        expect(() => parse_batch_spec('["scene.save"]')).toThrow('item 0 must be a non-empty array');
    });

    test('rejects an empty item', () => {
        expect(() => parse_batch_spec('[["scene.hierarchy"],[]]')).toThrow('item 1 must be a non-empty array');
    });

    test('rejects a non-string target', () => {
        expect(() => parse_batch_spec('[[42,"arg"]]')).toThrow('item 0 must start with a command target string');
    });

    test('preserves JSON arg types', () => {
        const items = parse_batch_spec('[["update.component","Assets/S.unity","Player",{"speed":5},3,true]]');
        expect(items).toEqual([
            {
                target: 'update.component',
                args: ['Assets/S.unity', 'Player', { speed: 5 }, 3, true],
            },
        ]);
    });

    test('accepts a target with no args', () => {
        expect(parse_batch_spec('[["scene.hierarchy"]]')).toEqual([
            { target: 'scene.hierarchy', args: [] },
        ]);
    });
});

describe('run_batch', () => {
    test('runs items in order and reports full success', async () => {
        const invoked: string[] = [];
        const outcome = await run_batch(
            [
                { target: 'query.assets', args: ['t:Prefab'] },
                { target: 'scene.hierarchy', args: [] },
            ],
            (item: BatchItem) => {
                invoked.push(item.target);
                return Promise.resolve(ok_response({ echoed: item.target }));
            },
        );

        expect(invoked).toEqual(['query.assets', 'scene.hierarchy']);
        expect(outcome).toEqual({
            success: true,
            completed: 2,
            total: 2,
            results: [
                { target: 'query.assets', result: { echoed: 'query.assets' } },
                { target: 'scene.hierarchy', result: { echoed: 'scene.hierarchy' } },
            ],
        });
    });

    test('stops at the first rpc error and skips the rest', async () => {
        const invoked: string[] = [];
        const outcome = await run_batch(
            [
                { target: 'create.gameobject', args: ['Assets/S.unity', 'Enemy'] },
                { target: 'create.component', args: ['Assets/S.unity', 'Enemy', 'BoxCollider'] },
                { target: 'scene.save', args: [] },
            ],
            (item: BatchItem) => {
                invoked.push(item.target);
                if (item.target === 'create.component') {
                    return Promise.resolve(error_response(-32603, 'Component type not found'));
                }
                return Promise.resolve(ok_response({ success: true }));
            },
        );

        expect(invoked).toEqual(['create.gameobject', 'create.component']);
        expect(outcome.success).toBe(false);
        expect(outcome.completed).toBe(1);
        expect(outcome.total).toBe(3);
        expect(outcome.results).toEqual([
            { target: 'create.gameobject', result: { success: true } },
            { target: 'create.component', error: 'Component type not found', code: -32603 },
        ]);
    });

    test('treats a success:false payload as a failure and stops', async () => {
        const invoked: string[] = [];
        const outcome = await run_batch(
            [
                { target: 'wait.for', args: ['ui', '@u1'] },
                { target: 'ui.interact', args: ['@u1', 'click'] },
            ],
            (item: BatchItem) => {
                invoked.push(item.target);
                return Promise.resolve(ok_response({ success: false, timedOut: true }));
            },
        );

        expect(invoked).toEqual(['wait.for']);
        expect(outcome.success).toBe(false);
        expect(outcome.completed).toBe(0);
        expect(outcome.results).toEqual([
            {
                target: 'wait.for',
                result: { success: false, timedOut: true },
                error: 'Command reported failure',
            },
        ]);
    });
});
