import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stream_editor } from '../src/editor-client';
import type { RpcEvent } from '../src/types';
import { install_mock_websocket, restore_websocket, write_lockfile } from './editor-websocket-mock';

const CONSOLE_EVENT: Record<string, unknown> = {
    jsonrpc: '2.0',
    method: 'editor.console.log',
    params: { message: 'hello', type: 'Log' },
};

async function wait_until(predicate: () => boolean, budget_ms: number): Promise<boolean> {
    const deadline = performance.now() + budget_ms;
    while (performance.now() < deadline) {
        if (predicate()) {
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return predicate();
}

describe('stream_editor', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'editor-stream-test-'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        restore_websocket();
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    test('a reconnect survives discovery being unavailable mid-reload', async () => {
        write_lockfile(tmp_dir, 53782, process.pid);
        install_mock_websocket({
            53782: {
                reload_window_ms: { start: 40, end: 900 },
                stream_event: CONSOLE_EVENT,
            },
        });

        const events: RpcEvent[] = [];
        const handle = await stream_editor({
            project_path: tmp_dir,
            method: 'editor.console.subscribe',
            timeout: 500,
            on_event: (event) => { events.push(event); },
        });

        try {
            // The second event can only arrive if the reconnect retried discovery
            // instead of abandoning the chain the first time it came back empty.
            expect(await wait_until(() => events.length >= 2, 5000)).toBe(true);
        } finally {
            handle.close();
        }
    }, 15000);

    test('a hung reconnect times out instead of stalling the stream', async () => {
        install_mock_websocket({
            53782: {
                reload_window_ms: { start: 40, end: 60 },
                hang_window_ms: { start: 100, end: 800 },
                stream_event: CONSOLE_EVENT,
            },
        });

        const events: RpcEvent[] = [];
        const handle = await stream_editor({
            project_path: tmp_dir,
            port: 53782,
            method: 'editor.console.subscribe',
            timeout: 200,
            on_event: (event) => { events.push(event); },
        });

        try {
            expect(await wait_until(() => events.length >= 2, 5000)).toBe(true);
        } finally {
            handle.close();
        }
    }, 15000);

    test('a rejected subscribe surfaces through on_error instead of going quiet', async () => {
        install_mock_websocket({
            53782: {
                rpc_error: { code: -32601, message: 'Method not found: editor.console.subscribe' },
            },
        });

        const errors: Error[] = [];
        const handle = await stream_editor({
            project_path: tmp_dir,
            port: 53782,
            method: 'editor.console.subscribe',
            timeout: 500,
            on_event: () => {},
            on_error: (error) => { errors.push(error); },
        });

        try {
            expect(await wait_until(() => errors.length > 0, 1000)).toBe(true);
            expect(errors[0]?.message).toContain('Subscription rejected');
            expect(errors[0]?.message).toContain('Method not found');
        } finally {
            handle.close();
        }
    });

    test('open-close flapping cannot reset the reconnect wall-clock deadline', async () => {
        let now = Date.now();
        const now_spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
        const sockets = install_mock_websocket({
            53782: {
                close_before_response: true,
            },
        });

        const errors: Error[] = [];
        const handle_promise = stream_editor({
            project_path: tmp_dir,
            port: 53782,
            method: 'editor.console.subscribe',
            timeout: 500,
            on_event: () => {},
            on_error: (error) => { errors.push(error); },
        });

        const handle = await handle_promise;
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(sockets[0]?.closed).toBe(true);
        now += 30_001;

        try {
            await new Promise((resolve) => setTimeout(resolve, 800));
            expect(errors).toHaveLength(1);
            expect(errors[0]?.message).toContain('could not reconnect within 30000ms');
        } finally {
            handle.close();
            now_spy.mockRestore();
        }
    });

    test('an open reconnect without a subscription response remains deadline-bounded', async () => {
        let now = Date.now();
        const now_spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
        const sockets = install_mock_websocket({
            53782: {
                reload_window_ms: { start: 40, end: 60 },
                omit_response_sequence: [false, true],
            },
        });

        const errors: Error[] = [];
        const handle = await stream_editor({
            project_path: tmp_dir,
            port: 53782,
            method: 'editor.console.subscribe',
            timeout: 250,
            on_event: () => {},
            on_error: (error) => { errors.push(error); },
        });

        try {
            expect(await wait_until(() => sockets[1]?.opened === true, 2000)).toBe(true);
            now += 30_001;
            expect(await wait_until(() => errors.length > 0, 1000)).toBe(true);
            expect(errors).toHaveLength(1);
            expect(errors[0]?.message).toContain('could not reconnect within 30000ms');
            expect(sockets[1]?.closed).toBe(true);
        } finally {
            handle.close();
            now_spy.mockRestore();
        }
    });

    test('close shuts the reconnected socket, not the original', async () => {
        const sockets = install_mock_websocket({
            53782: {
                reload_window_ms: { start: 40, end: 60 },
                stream_event: CONSOLE_EVENT,
            },
        });

        const events: RpcEvent[] = [];
        const handle = await stream_editor({
            project_path: tmp_dir,
            port: 53782,
            method: 'editor.console.subscribe',
            timeout: 500,
            on_event: (event) => { events.push(event); },
        });

        expect(await wait_until(() => events.length >= 2, 5000)).toBe(true);
        handle.close();

        const opened = sockets.filter((socket) => socket.opened);
        expect(opened.length).toBeGreaterThanOrEqual(2);
        expect(opened[opened.length - 1]?.closed).toBe(true);
    }, 15000);
});
