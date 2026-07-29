import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { call_editor, read_editor_readiness } from '../src/editor-client';
import {
    DEAD_PID,
    RELOAD_WINDOW_MS,
    install_mock_websocket,
    registry_run_params,
    restore_websocket,
    write_lockfile,
} from './editor-websocket-mock';

describe('call_editor', () => {
    let tmp_dir: string;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), 'editor-client-test-'));
    });

    afterEach(() => {
        restore_websocket();
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    test('recovers without editor.json and sends the request to the matching discovered bridge', async () => {
        install_mock_websocket({
            53784: {
                bridge_info: {
                    port: 53784,
                    pid: 1111,
                    version: '0.1.0',
                    project_path: join(tmp_dir, '..', 'other-project'),
                    project_name: 'other-project',
                },
                rpc_result: { ok: true, port: 53784 },
            },
            53785: {
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { ok: true, port: 53785 },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.playMode.getState',
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ ok: true, port: 53785 });
    });

    test('still allows explicit manual port fallback', async () => {
        install_mock_websocket({
            53786: {
                rpc_result: { ok: true, port: 53786 },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.playMode.getState',
            timeout: 100,
            port: 53786,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ ok: true, port: 53786 });
    });

    // The CLI always sends method 'editor.invoke' with the real target inside
    // params.args, so classification has to read the target out of args. An
    // earlier version matched on dotted method names that were never sent.
    test('read invokes keep retrying through temporary discovery loss', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { state: 'Playing' },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            timeout: 100,
            params: registry_run_params('scene.hierarchy'),
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ state: 'Playing' });
    });

    test('mutating invokes keep the shorter default recovery window', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            timeout: 100,
            params: registry_run_params('scene.save'),
        });

        expect(response.result).toBeUndefined();
        expect(response.error).toBeDefined();
    });

    // Entering play mode reloads the domain, which takes the server down for
    // longer than any of the fixed retry budgets. StopForReload leaves the
    // lockfile in place and the Unity process survives, so a live pid is the
    // signal that waiting is worthwhile.
    test('a live editor pid extends retries past the fixed count while it reloads', async () => {
        write_lockfile(tmp_dir, 53785, process.pid);

        install_mock_websocket({
            53785: {
                reachable_after_ms: RELOAD_WINDOW_MS,
                bridge_info: {
                    port: 53785,
                    pid: process.pid,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            timeout: 100,
            params: registry_run_params('scene.save'),
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });

    test('a dead editor pid fails fast instead of waiting out a reload', async () => {
        write_lockfile(tmp_dir, 53785, DEAD_PID);

        install_mock_websocket({
            53785: {
                reachable_after_ms: RELOAD_WINDOW_MS,
                bridge_info: {
                    port: 53785,
                    pid: DEAD_PID,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            timeout: 100,
            params: registry_run_params('scene.save'),
        });

        expect(response.error).toBeDefined();
    });

    test('an explicit retries option caps waiting even for a live editor', async () => {
        write_lockfile(tmp_dir, 53785, process.pid);

        install_mock_websocket({
            53785: {
                reachable_after_ms: RELOAD_WINDOW_MS,
                bridge_info: {
                    port: 53785,
                    pid: process.pid,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            timeout: 100,
            retries: 0,
            params: registry_run_params('scene.save'),
        });

        expect(response.error).toBeDefined();
    });

    test('command actions keep the shorter default recovery window', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.playMode.enter',
            timeout: 100,
        });

        expect(response.result).toBeUndefined();
        expect(response.error).toBeDefined();
        expect(response.error?.message).toContain('Autodiscovery could not find a matching Unity project bridge');
    });

    test('EditorApplication.isPlaying invoke gets transition-tolerant retries for play-mode entry', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            params: {
                type: 'UnityEditor.EditorApplication',
                member: 'isPlaying',
                set: 'true',
            },
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });

    test('EditorApplication.isPlaying invoke retries clean socket closes during play-mode entry', async () => {
        const config_dir = join(tmp_dir, '.unity-agentic');
        mkdirSync(config_dir, { recursive: true });
        writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
            port: 53785,
            pid: process.pid,
            version: '0.1.0',
        }), 'utf-8');

        install_mock_websocket({
            53785: {
                close_before_response_sequence: [false, true, false, false],
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            params: {
                type: 'UnityEditor.EditorApplication',
                member: 'isPlaying',
                set: 'true',
            },
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });

    test('UnityAgenticTools.Util.PlayMode.GetState invoke gets transition-tolerant retries during play-mode transition', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            params: {
                type: 'UnityAgenticTools.Util.PlayMode',
                member: 'GetState',
            },
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });

    test('Registry play aliases get transition-tolerant retries during play-mode transition', async () => {
        install_mock_websocket({
            53785: {
                reachable_sequence: [false, false, false, true, true, true],
                bridge_info: {
                    port: 53785,
                    pid: 2222,
                    version: '0.1.0',
                    project_path: tmp_dir,
                    project_name: 'editor-client-test',
                },
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            params: {
                type: 'UnityAgenticTools.Commands.Registry',
                member: 'Run',
                args: JSON.stringify(['play.enter', '[]']),
            },
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });

    test('UnityAgenticTools.Util.PlayMode.GetState invoke retries clean socket closes during play-mode transition', async () => {
        const config_dir = join(tmp_dir, '.unity-agentic');
        mkdirSync(config_dir, { recursive: true });
        writeFileSync(join(config_dir, 'editor.json'), JSON.stringify({
            port: 53785,
            pid: process.pid,
            version: '0.1.0',
        }), 'utf-8');

        install_mock_websocket({
            53785: {
                close_before_response_sequence: [false, true, false, false],
                rpc_result: { success: true },
            },
        });

        const response = await call_editor({
            project_path: tmp_dir,
            method: 'editor.invoke',
            params: {
                type: 'UnityAgenticTools.Util.PlayMode',
                member: 'GetState',
            },
            timeout: 100,
        });

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ success: true });
    });
});

describe('read_editor_readiness', () => {
    const READY_INFO: Record<string, unknown> = {
        port: 53785,
        pid: 2222,
        version: '0.1.0',
        project_path: '/tmp/project',
        is_playing: false,
        is_paused: false,
        is_compiling: true,
        is_updating: false,
        is_playmode_transitioning: false,
        is_reloading: false,
        is_stable: false,
    };

    afterEach(() => {
        restore_websocket();
    });

    test('reports what the editor is busy with', async () => {
        install_mock_websocket({ 53785: { bridge_info: READY_INFO } });

        const readiness = await read_editor_readiness(53785, 100);
        expect(readiness).toEqual({
            is_playing: false,
            is_paused: false,
            is_compiling: true,
            is_updating: false,
            is_playmode_transitioning: false,
            is_reloading: false,
            is_stable: false,
        });
    });

    test('names the missing field when the installed package predates it', async () => {
        const { is_stable: _omitted, ...older_info } = READY_INFO;
        install_mock_websocket({ 53785: { bridge_info: older_info } });

        const readiness = await read_editor_readiness(53785, 100);
        expect('error' in readiness).toBe(true);
        if ('error' in readiness) {
            expect(readiness.error).toContain('is_stable');
        }
    });

    test('reports an unanswered probe instead of inventing a state', async () => {
        install_mock_websocket({ 53785: { close_before_response: true } });

        const readiness = await read_editor_readiness(53785, 100);
        expect('error' in readiness).toBe(true);
    });
});
