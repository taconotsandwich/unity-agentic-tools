import { describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

const repo_root = resolve(__dirname, '..');
const cli_path = resolve(repo_root, 'dist/cli.js');

interface RpcRequestLike {
    id: string;
    params?: Record<string, unknown>;
}

interface CliResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

function run_cli(args: string[]): string {
    return execFileSync('bun', [cli_path, ...args], {
        cwd: repo_root,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

function run_cli_async(args: string[]): Promise<CliResult> {
    return new Promise((resolve_result, reject_result) => {
        const child = spawn('bun', [cli_path, ...args], {
            cwd: repo_root,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });
        child.on('error', reject_result);
        child.on('close', (code) => {
            resolve_result({ code, stdout, stderr });
        });
    });
}

// NTFS has no POSIX permission bits, so mode & 0o111 is always 0 on Windows
// no matter how the file was built. Bun and npm generate .cmd shims there
// instead, which makes the exec bit meaningful only on POSIX.
const it_posix = process.platform === 'win32' ? it.skip : it;

describe('command runner surface', () => {
    it_posix('builds the CLI bin as executable for linked dev setup', () => {
        expect(statSync(cli_path).mode & 0o111).not.toBe(0);
    });

    it('shows the small top-level command surface in help', () => {
        const help = run_cli(['--help']);

        expect(help).toContain('list [options] [query]');
        expect(help).toContain('run [options] [target] [args...]');
        expect(help).toContain('stream [options] [topic]');
        expect(help).toContain('install [options]');
        expect(help).toContain('uninstall [options]');
        expect(help).toContain('cleanup [options]');
        expect(help).toContain('status [options]');
        expect(help).not.toContain('read ');
        expect(help).not.toContain('editor ');
    });

    it('documents local and remote bridge install modes', () => {
        const help = run_cli(['install', '--help']);

        expect(help).toContain('--local [path]');
        expect(help).toContain('--remote');
        expect(help).toContain('source checkout');
        expect(help).toContain('GitHub bridge package URL');
    });

    it('does not keep removed command groups registered', () => {
        for (const command of ['create', 'read', 'update', 'delete', 'editor', 'search', 'grep', 'clone', 'setup']) {
            try {
                run_cli([command]);
                expect.unreachable(`Expected ${command} to be removed`);
            } catch (err: unknown) {
                const execErr = err as { status?: number; exitCode?: number; stderr?: string; stdout?: string; message?: string };
                expect(execErr.status ?? execErr.exitCode).toBe(1);
                const output = `${execErr.stderr ?? ''}${execErr.stdout ?? ''}${execErr.message ?? ''}`;
                expect(output).toContain(`unknown command '${command}'`);
            }
        }
    });

    it('validates stream topics before opening a bridge connection', () => {
        try {
            run_cli(['stream', 'bad-topic', '--duration', '1']);
            expect.unreachable('Expected invalid topic failure');
        } catch (err: unknown) {
            const execErr = err as { status: number; stdout?: string };
            expect(execErr.status).toBe(1);
            const json = JSON.parse(execErr.stdout ?? '{}') as { success?: boolean; error?: string };
            expect(json.success).toBe(false);
            expect(json.error).toContain('Invalid stream topic');
        }
    });

    it('runs cleanup from the CLI without deleting durable config by default', () => {
        const temp_dir = mkdtempSync(resolve(tmpdir(), 'cleanup-cli-test-'));
        const agentic_dir = resolve(temp_dir, '.unity-agentic');
        mkdirSync(agentic_dir, { recursive: true });
        writeFileSync(resolve(agentic_dir, 'config.json'), '{}');
        writeFileSync(resolve(agentic_dir, 'editor.json'), '{}');
        writeFileSync(resolve(agentic_dir, 'editor.last.json'), '{}');

        try {
            const output = run_cli(['cleanup', '-p', temp_dir]);
            const json = JSON.parse(output) as { success?: boolean; modes?: string[]; files_removed?: string[] };
            expect(json.success).toBe(true);
            expect(json.modes).toEqual(['stale']);
            expect(json.files_removed).toContain('editor.json');
            expect(json.files_removed).toContain('editor.last.json');
            expect(existsSync(resolve(agentic_dir, 'config.json'))).toBe(true);
            expect(existsSync(resolve(agentic_dir, 'editor.json'))).toBe(false);
        } finally {
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('forwards --no-wait as no_wait in the bridge request', async () => {
        let received_params: Record<string, unknown> | undefined;
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    received_params = request.params;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { success: true },
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'run',
                'project.refresh',
                '--no-wait',
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(0);
            expect(result.stderr).toBe('');
            const json = JSON.parse(result.stdout) as { queued?: boolean };
            expect(json.queued).toBe(true);
            expect(received_params?.no_wait).toBe(true);
        } finally {
            server.stop(true);
        }
    });

    // Registry.Run takes allowRaw ahead of setValue because the args wire is a
    // JSON string array with no null to skip a set value with. Position matters,
    // and only an end-to-end payload check catches getting it wrong.
    it.each([
        { name: 'defaults allowRaw to false', args: [], expected: ['project.refresh', '[]', 'false'] },
        { name: 'sends allowRaw for --raw', args: ['--raw'], expected: ['project.refresh', '[]', 'true'] },
        {
            name: 'keeps a set value behind allowRaw',
            args: ['--raw', '--set', 'true'],
            expected: ['project.refresh', '[]', 'true', 'true'],
        },
    ])('$name in the Registry.Run payload', async ({ args, expected }) => {
        let received_params: Record<string, unknown> | undefined;
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    received_params = request.params;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { success: true },
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'run',
                'project.refresh',
                ...args,
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(0);
            expect(received_params?.member).toBe('Run');
            expect(JSON.parse(String(received_params?.args)) as string[]).toEqual(expected);
        } finally {
            server.stop(true);
        }
    });

    it.each([
        ['malformed JSON', '["unterminated'],
        ['a non-array value', '{"value":"argument"}'],
        ['an array containing a non-string', '["valid", 42]'],
    ])('rejects --args containing %s before connecting', (_label, value) => {
        try {
            run_cli(['run', 'project.refresh', '--args', value, '--port', '1', '--timeout', '100']);
            expect.unreachable('Expected invalid --args failure');
        } catch (err: unknown) {
            const exec_err = err as { status: number; stdout?: string };
            expect(exec_err.status).toBe(1);
            const json = JSON.parse(exec_err.stdout ?? '{}') as { success?: boolean; error?: string };
            expect(json.success).toBe(false);
            expect(json.error).toContain('expected a JSON array');
        }
    });

    it('forwards a JSON string array from --args-file without shell quoting', async () => {
        const temp_dir = mkdtempSync(resolve(tmpdir(), 'args-file-cli-test-'));
        const args_file = resolve(temp_dir, 'args with spaces.json');
        const command_args = [
            'Assets/Scenes/Main.unity',
            '[{"gameObjectPath":"Player","propertyPath":"m_Name","value":"Hero"}]',
            '-leading-value',
        ];
        writeFileSync(args_file, JSON.stringify(command_args), 'utf-8');

        let received_params: Record<string, unknown> | undefined;
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    received_params = request.params;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { success: true },
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'run',
                'update.batch',
                '--args-file',
                args_file,
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(0);
            expect(typeof received_params?.args).toBe('string');
            const registry_args = JSON.parse(String(received_params?.args)) as string[];
            expect(JSON.parse(registry_args[1]) as string[]).toEqual(command_args);
        } finally {
            server.stop(true);
            rmSync(temp_dir, { recursive: true, force: true });
        }
    });

    it('validates --args-file stdin before connecting', async () => {
        const result = await run_cli_async([
            'run',
            'project.refresh',
            '--args-file',
            '-',
            '--port',
            '1',
            '--timeout',
            '100',
        ], '{"not":"an array"}');

        expect(result.code).toBe(1);
        const json = JSON.parse(result.stdout) as { success?: boolean; error?: string };
        expect(json.success).toBe(false);
        expect(json.error).toContain('Invalid stdin');
        expect(json.error).toContain('expected a JSON array');
    });

    it('reports an unreadable --args-file before connecting', () => {
        const missing_file = resolve(tmpdir(), `missing-unity-args-${process.pid}.json`);

        try {
            run_cli(['run', 'project.refresh', '--args-file', missing_file, '--port', '1', '--timeout', '100']);
            expect.unreachable('Expected unreadable --args-file failure');
        } catch (err: unknown) {
            const exec_err = err as { status: number; stdout?: string };
            expect(exec_err.status).toBe(1);
            const json = JSON.parse(exec_err.stdout ?? '{}') as { success?: boolean; error?: string };
            expect(json.success).toBe(false);
            expect(json.error).toContain('Could not read args file');
        }
    });

    it('rejects multiple run argument sources', () => {
        try {
            run_cli(['run', 'project.refresh', 'positional', '--args', '[]']);
            expect.unreachable('Expected conflicting argument source failure');
        } catch (err: unknown) {
            const exec_err = err as { status: number; stdout?: string };
            expect(exec_err.status).toBe(1);
            const json = JSON.parse(exec_err.stdout ?? '{}') as { success?: boolean; error?: string };
            expect(json.success).toBe(false);
            expect(json.error).toContain('Use only one argument source');
        }
    });

    it('prints unreachable status and exits non-zero', async () => {
        const server = Bun.serve({
            port: 0,
            fetch() {
                return new Response('WebSocket disabled', { status: 400 });
            },
        });

        try {
            const result = await run_cli_async([
                'status',
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(1);
            const json = JSON.parse(result.stdout) as { bridge?: { reachable?: boolean; error?: string } };
            expect(json.bridge?.reachable).toBe(false);
            expect(json.bridge?.error).toBeTruthy();
        } finally {
            server.stop(true);
        }
    });

    it('keeps a reachable but busy bridge successful', async () => {
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            is_playing: false,
                            is_paused: false,
                            is_compiling: true,
                            is_updating: false,
                            is_playmode_transitioning: false,
                            is_reloading: false,
                            is_stable: false,
                        },
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'status',
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(0);
            const json = JSON.parse(result.stdout) as {
                bridge?: { reachable?: boolean; readiness?: { is_stable?: boolean; is_compiling?: boolean } };
            };
            expect(json.bridge?.reachable).toBe(true);
            expect(json.bridge?.readiness?.is_stable).toBe(false);
            expect(json.bridge?.readiness?.is_compiling).toBe(true);
        } finally {
            server.stop(true);
        }
    });

    it('reports a readiness error without marking a reachable bridge unreachable', async () => {
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {},
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'status',
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(0);
            const json = JSON.parse(result.stdout) as {
                bridge?: { reachable?: boolean; readiness_error?: string };
            };
            expect(json.bridge?.reachable).toBe(true);
            expect(json.bridge?.readiness_error).toContain('is_playing');
        } finally {
            server.stop(true);
        }
    });

    it('exits non-zero when the invoked command result reports failure', async () => {
        const server = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return undefined;
                }

                return new Response('Expected WebSocket upgrade', { status: 400 });
            },
            websocket: {
                message(ws, message) {
                    const request = JSON.parse(String(message)) as RpcRequestLike;
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            success: true,
                            result: {
                                success: false,
                                error: 'Asset not found at Assets/Missing.asset.',
                            },
                        },
                    }));
                },
            },
        });

        try {
            const result = await run_cli_async([
                'run',
                'delete.asset',
                'Assets/Missing.asset',
                '--port',
                String(server.port),
                '--timeout',
                '1000',
            ]);
            expect(result.code).toBe(1);
            expect(result.stderr).toBe('');
            const json = JSON.parse(result.stdout) as { result?: { success?: boolean; error?: string } };
            expect(json.result?.success).toBe(false);
            expect(json.result?.error).toContain('Asset not found');
        } finally {
            server.stop(true);
        }
    });
});
