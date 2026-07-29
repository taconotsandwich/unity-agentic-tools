import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { ensure_gitignore_ignores_agentic_dir } from './gitignore';
import { ping_editor, request_editor_at_port } from './editor-transport';
import { is_record } from './util';
import type {
    EditorBridgeInfo,
    EditorConfig,
} from './types';

const BRIDGE_PORT_RANGE_START = 53782;
const BRIDGE_PORT_RANGE_END = 53791;
const LAST_KNOWN_CONFIG_FILE = 'editor.last.json';

const LAST_KNOWN_EDITOR_CONFIGS = new Map<string, EditorConfig>();

/**
 * Read and validate the editor bridge lockfile.
 * Returns the config if valid, or an object with an error string.
 */
export function read_editor_config(project_path: string): EditorConfig | { error: string } {
    const config_path = join(project_path, '.unity-agentic', 'editor.json');

    if (!existsSync(config_path)) {
        return { error: `Editor bridge not found at ${config_path}. Is the Unity Editor running with the bridge package installed?` };
    }

    let config: EditorConfig;
    try {
        const raw = readFileSync(config_path, 'utf-8');
        config = JSON.parse(raw) as EditorConfig;
    } catch (err: unknown) {
        return { error: `Failed to parse editor.json: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (typeof config.port !== 'number' || typeof config.pid !== 'number') {
        return { error: 'Invalid editor.json: missing port or pid' };
    }

    if (!is_pid_alive(config.pid)) {
        return { error: `Unity Editor process (PID ${config.pid}) is not running. The editor may have been closed.` };
    }

    return config;
}

/**
 * Resolve a usable bridge config.
 * Prefers the lockfile when valid, otherwise discovers a matching bridge by project identity.
 * Manual port selection remains an explicit escape hatch rather than the default fallback.
 */
export async function discover_editor_config(project_path: string, timeout_ms: number = 350): Promise<EditorConfig | { error: string }> {
    const normalized_project_path = normalize_project_path(project_path);
    const lockfile_result = read_editor_config(project_path);
    const preferred_ports: number[] = [];
    let cached_config = read_cached_editor_config(project_path, normalized_project_path)
        ?? LAST_KNOWN_EDITOR_CONFIGS.get(normalized_project_path);
    let stale_cached_port: number | undefined;

    if (!('error' in lockfile_result)) {
        preferred_ports.push(lockfile_result.port);

        const direct_ping = await ping_editor(lockfile_result.port, timeout_ms);
        if (direct_ping.reachable) {
            const resolved_config: EditorConfig = {
                ...lockfile_result,
                project_path: normalized_project_path,
                source: 'lockfile',
            };
            remember_editor_config(normalized_project_path, resolved_config);
            return resolved_config;
        }
    }

    if (cached_config) {
        preferred_ports.push(cached_config.port);

        const cached_ping = await ping_editor(cached_config.port, timeout_ms);
        if (cached_ping.reachable) {
            const resolved_config: EditorConfig = {
                ...cached_config,
                project_path: normalized_project_path,
                source: 'cached',
            };
            remember_editor_config(normalized_project_path, resolved_config);
            return resolved_config;
        }

        stale_cached_port = cached_config.port;
        forget_cached_editor_config(project_path, normalized_project_path);
        cached_config = undefined;
    }

    const discovered_infos = await discover_bridge_infos(timeout_ms, preferred_ports);
    const matching_bridge = discovered_infos.find((info) =>
        normalize_project_path(info.project_path) === normalized_project_path,
    );

    if (matching_bridge) {
        const resolved_config: EditorConfig = {
            port: matching_bridge.port,
            pid: matching_bridge.pid,
            version: matching_bridge.version,
            project_path: matching_bridge.project_path,
            source: 'discovered',
        };
        remember_editor_config(normalized_project_path, resolved_config);
        return resolved_config;
    }

    const discovered_projects = discovered_infos.map((info) => `${info.project_name ?? '(unknown)'}:${info.project_path}@${info.port}`);
    const discovered_clause = discovered_projects.length > 0
        ? ` Reachable bridges were found for different projects: ${discovered_projects.join(', ')}.`
        : ` No reachable bridge in ports ${BRIDGE_PORT_RANGE_START}-${BRIDGE_PORT_RANGE_END} identified project ${normalized_project_path}.`;
    const stale_cache_clause = stale_cached_port !== undefined
        ? ` Cached bridge port ${stale_cached_port} was also unreachable.`
        : '';
    const port_hint = ' Use --port <n> only if you need to target a specific bridge manually.';

    if (!('error' in lockfile_result)) {
        return {
            error: `Editor bridge lockfile pointed to port ${lockfile_result.port}, but it was unreachable and autodiscovery could not find a matching Unity project bridge.${stale_cache_clause}${discovered_clause}${port_hint}`,
        };
    }

    return {
        error: `${lockfile_result.error} Autodiscovery could not find a matching Unity project bridge.${stale_cache_clause}${discovered_clause}${port_hint}`,
    };
}

/**
 * A pid worth waiting on during a domain reload, from any source readable
 * without the Editor's cooperation.
 *
 * The lockfile is Unity-owned; the last-known cache is CLI-owned and outlives
 * it. Consulting both means an unreadable lockfile alone no longer decides
 * whether waiting out a reload is worthwhile. Returns 0 when no source knows.
 */
export function read_candidate_editor_pid(project_path: string): number {
    const lockfile_result = read_editor_config(project_path);
    if (!('error' in lockfile_result) && lockfile_result.pid > 0) {
        return lockfile_result.pid;
    }

    const cached = read_cached_editor_config(project_path, normalize_project_path(project_path));
    return cached && cached.pid > 0 ? cached.pid : 0;
}

/**
 * Read bridge identity directly from a known port.
 */
async function read_bridge_info(port: number, timeout_ms: number): Promise<EditorBridgeInfo | null> {
    const response = await request_editor_at_port({
        port,
        method: 'editor.bridge.getInfo',
        timeout: timeout_ms,
    });

    if (response.error) {
        return null;
    }

    return parse_bridge_info(response.result, port);
}

/**
 * Discover bridge identities by probing the known editor bridge port range.
 * Only bridges that can identify their owning Unity project are returned.
 */
async function discover_bridge_infos(timeout_ms: number, preferred_ports: number[] = []): Promise<EditorBridgeInfo[]> {
    const ports = new Set<number>();

    for (const port of preferred_ports) {
        if (Number.isInteger(port) && port >= BRIDGE_PORT_RANGE_START && port <= BRIDGE_PORT_RANGE_END) {
            ports.add(port);
        }
    }

    for (let port = BRIDGE_PORT_RANGE_START; port <= BRIDGE_PORT_RANGE_END; port += 1) {
        ports.add(port);
    }

    const results = await Promise.all(
        [...ports].map((port) => read_bridge_info(port, timeout_ms)),
    );

    return results.filter((result): result is EditorBridgeInfo => result !== null);
}

function parse_bridge_info(result: unknown, port: number): EditorBridgeInfo | null {
    if (!is_record(result)) {
        return null;
    }

    const project_path = typeof result.project_path === 'string' ? result.project_path : null;
    if (!project_path) {
        return null;
    }

    return {
        port,
        pid: typeof result.pid === 'number' ? result.pid : 0,
        version: typeof result.version === 'string' ? result.version : 'unknown',
        project_path,
        ...(typeof result.project_name === 'string' ? { project_name: result.project_name } : {}),
        ...(typeof result.unity_version === 'string' ? { unity_version: result.unity_version } : {}),
    };
}

function remember_editor_config(project_path: string, config: EditorConfig): void {
    const cached_config: EditorConfig = {
        port: config.port,
        pid: config.pid,
        version: config.version,
        project_path: config.project_path ?? project_path,
        source: config.source,
    };

    LAST_KNOWN_EDITOR_CONFIGS.set(project_path, cached_config);
    write_cached_editor_config(project_path, cached_config);
}

function forget_cached_editor_config(project_path: string, normalized_project_path: string): void {
    LAST_KNOWN_EDITOR_CONFIGS.delete(normalized_project_path);

    const config_path = join(project_path, '.unity-agentic', LAST_KNOWN_CONFIG_FILE);
    try {
        if (existsSync(config_path)) {
            unlinkSync(config_path);
        }
    } catch {
        // Cache cleanup is best-effort. Discovery must still proceed without it.
    }
}

function read_cached_editor_config(project_path: string, normalized_project_path: string): EditorConfig | undefined {
    const config_path = join(project_path, '.unity-agentic', LAST_KNOWN_CONFIG_FILE);
    if (!existsSync(config_path)) {
        return undefined;
    }

    try {
        const raw = readFileSync(config_path, 'utf-8');
        const parsed = JSON.parse(raw) as EditorConfig;
        if (typeof parsed.port !== 'number' || typeof parsed.pid !== 'number' || typeof parsed.version !== 'string') {
            return undefined;
        }

        return {
            port: parsed.port,
            pid: parsed.pid,
            version: parsed.version,
            project_path: parsed.project_path ?? normalized_project_path,
            source: 'cached',
        };
    } catch {
        return undefined;
    }
}

function write_cached_editor_config(project_path: string, config: EditorConfig): void {
    const config_dir = join(project_path, '.unity-agentic');
    const config_path = join(config_dir, LAST_KNOWN_CONFIG_FILE);

    try {
        mkdirSync(config_dir, { recursive: true });
        ensure_gitignore_ignores_agentic_dir(project_path);
        writeFileSync(config_path, JSON.stringify({
            port: config.port,
            pid: config.pid,
            version: config.version,
            project_path: config.project_path,
        }, null, 2));
    } catch {
        // Cache writes are best-effort. Discovery must still work without them.
    }
}

function normalize_project_path(project_path: string): string {
    const resolved_path = resolve(project_path);

    let normalized = resolved_path;
    try {
        normalized = typeof realpathSync.native === 'function'
            ? realpathSync.native(resolved_path)
            : realpathSync(resolved_path);
    } catch {
        normalized = resolved_path;
    }

    return process.platform === 'win32'
        ? normalized.toLowerCase()
        : normalized;
}

export function is_pid_alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        if (is_record(err) && err.code === 'EPERM') {
            return true;
        }

        return false;
    }
}
