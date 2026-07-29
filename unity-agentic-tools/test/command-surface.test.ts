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
        expect(help).toContain('run [options] <target> [args...]');
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
