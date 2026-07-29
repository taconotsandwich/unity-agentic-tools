import { describe, test, expect, beforeEach, afterEach } from 'vitest';
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
    const deadline = Date.now() + budget_ms;
    while (Date.now() < deadline) {
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
