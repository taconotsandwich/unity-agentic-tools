# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Compact Unity command runner and live Unity Editor bridge. The public CLI surface is `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.

The Claude Code plugin (hooks, skills, manifest) lives in a separate repo: [unity-agentic-tools-claude-plugin](https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin).

**Always use `bun` — never use `node`.**

## Build & Test

```bash
bun install           # Install all deps
bun run build         # Build TypeScript
bun run build:unity-package # Compile Unity C# bridge package with dotnet
bun run test          # Unit tests
bun run test:integration  # CLI integration tests (bash)
bun run test:integration:stress -- --project <path> --cycles 5  # play mode cycles, needs an open Editor
```

`test:integration:stress` and `test:integration:unity` need a real Unity Editor and are not run by CI. Run the stress suite after touching retry or transport behaviour in `editor-client.ts`; the bar is `transient_reads: 0`.

## Dev Setup

```bash
bun run setup-dev
```

`setup-dev` links the built CLI into Bun's global bin. If it reports that Bun's global bin is not on `PATH`, add the printed directory before relying on `unity-agentic-tools` by name.

`unity-agentic-tools install` defaults to the GitHub package URL. For local bridge package development, use `unity-agentic-tools install --local -p <project>`; `--local` auto-detects this checkout's `unity-package/`.

## Architecture

```
unity-agentic-tools/         TypeScript CLI + Vitest tests
unity-package/      Unity Editor bridge (C# UPM package)
tools/dotnet-unity-compile/ Dotnet compile harness for the Unity package
```

- Workspaces: root package.json has `"workspaces": ["unity-agentic-tools"]`

## Key Design Patterns

- **Bridge-first mutation**: Create/update/delete scene, prefab, asset, and GameObject operations run through Unity-side bridge commands, not local serialized-file mutation code.
- **Token Efficiency**: `inspect` without `--properties` returns structure only. Use `--properties` when component values are needed.
- **Unity YAML regex safety**: Always use `[ \t]*` (not `\s*`) between YAML keys and values — `\s` matches `\n` and causes cross-line capture bleed. Similarly, use `[^\n]*` (not `.*`) for value capture groups.

## CLI Structure

- Public CLI uses a small top-level runner: `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, `status`.
- `list` and `run` call `UnityAgenticTools.Commands.Registry` through `editor.invoke`.
- `stream` opens a persistent WebSocket subscription and filters topics client-side.
- Command aliases and project `[AgenticCommand]` methods live on the C# side, not as new CLI subcommands.
- The CLI does not register legacy local file mutation command groups such as `read`, `create`, `update`, `delete`, `editor`, `clone`, `search`, `grep`, `docs`, `version`, or `setup`.

## CI / Release

- CI runs bun test + integration tests
- Git hooks live in `.githooks/` and are activated by `bun run hooks` (part of `setup-dev`), which sets `core.hooksPath`. Pre-commit runs type-check + tests; pre-push adds the integration suite. A fresh clone has them off until that script runs.
- Release triggered by pushing `v*.*.*` tag — runs tests, publishes to npm, creates GitHub Release
- `test/fixtures/external/` is a git submodule — test.yml needs `submodules: true` on checkout
- npm publish uses OIDC trusted publishing (--provenance) — no NPM_TOKEN secret needed
- Version sync: `scripts/sync-version.js` keeps unity-agentic-tools and unity-package in sync

## Gotchas

- Remote may have new commits — always `git pull --rebase` before push if rejected
- TagManager layers regex MUST stop at `m_SortingLayers:` boundary — greedy regex bleeds into sorting layers
- Build settings readers live in `build-version.ts` and `build-settings.ts`; local build-setting mutation helpers have been removed.
- dist/ is gitignored at root level — dist files are NOT committed
- **Regex `\s*` newline bleed**: In Unity YAML regex parsing, `\s*` between a YAML key and value will match newlines, causing the regex to capture data from subsequent lines. Always use `[ \t]*` for horizontal whitespace only, and `[^\n]*` (not `.*`) for value capture groups — this has caused critical bugs in both TypeScript and C# YAML parsing code.

## Editor Bridge (Live Unity Integration)

- **Architecture**: JSON-RPC 2.0 over WebSocket at `ws://localhost:{port}/unity-agentic`
- **C# package**: `unity-package/` is a UPM package (`com.unity-agentic-tools.editor-bridge`) with `[InitializeOnLoad]` server
- **Discovery**: Unity writes `.unity-agentic/editor.json` (port + PID); CLI reads it, validates PID alive
- **Zero deps**: Bun native WebSocket client, C# `TcpListener` + manual RFC 6455 framing
- **Port range**: 53782-53791 (scans for first available)
- **Domain reload safety**: Server stops on `beforeAssemblyReload`, restarts on `afterAssemblyReload`
- **Main thread dispatch**: `RunOnMainThread<T>()` queues actions via `ConcurrentQueue`, pumped by `EditorApplication.update`
- **Handler routing**: `IRequestHandler` interface with `MethodPrefix` property; `MessageDispatcher` does reflection-based discovery
- **Event streaming**: `EventBroadcaster` + `UnityEventBridge` broadcast play mode changes and log messages to all connected clients
- **Install**: `unity-agentic-tools install` adds the bridge package to manifest.json (defaults project to cwd; use `--project <path>` when needed). Default installs use the GitHub package URL. Use `--local [path]` for local bridge package development; existing `file:` dependencies are preserved unless `--remote` is passed.
- **Transport**: `editor-client.ts` exports `call_editor()` (single request/response), `stream_editor()` (persistent connection for events), and `read_editor_readiness()` (one `editor.bridge.getInfo` probe, used by `status`)
- **Retry classification**: `get_action_semantics()` reads the real target out of `params` — the CLI always sends `method: 'editor.invoke'`, so matching on dotted JSON-RPC method names silently never fires. Reads and play mode transitions retry `-32000`/`-32002`/`-32003`/`-32010`; other commands retry only `-32002`/`-32010`, because `-32000`/`-32003` mean the request may already be executing and a replay could double-apply it
- **Reload tolerance**: retries are bounded by a 30s wall-clock deadline (`RELOAD_TOLERANCE_MS`), not a retry count — a count cannot express "survive a domain reload", and the unreachable window scales with project size (measured 4-7s). The deadline is only extended while the Editor PID is provably alive, so a closed Editor still fails fast. Accepted trade-off: Unity alive with a permanently dead bridge server waits the full 30s. An explicit `retries` option is a hard cap that opts out
- **Stream reconnects**: `stream_editor()` reconnects on the same 30s budget with backoff, re-running discovery each attempt (discovery is unavailable for the whole reload window, so a single miss is normal). Failures surface through `on_error`; `stream` prints them and exits non-zero rather than sitting connected to nothing
- **Play mode honesty**: `PlayMode.Enter/Exit` return `requested` plus a live-queried `state`/`isPlaying`. Unity applies the change over several frames and entering play mode reloads the domain, so the response never asserts the requested state. Callers gate on `play.state`
- **Ref system**: `RefManager.cs` maintains `@hN` (hierarchy) and `@uN` (UI) ref registries. Refs created by `hierarchy-snapshot`/`ui-snapshot`, cleared on scene change, play mode transition, or domain reload
- **UI walking**: `UIWalker.cs` walks both uGUI (Canvas/Selectable) and UI Toolkit (UIDocument/VisualElement) trees. TMP variants accessed via reflection to avoid hard dependency
- **Wait conditions**: `WaitConditionRunner.cs` pumps conditions via `EditorApplication.update` with timeout support
- **Input System**: `InputHandler.cs` uses `#if ENABLE_INPUT_SYSTEM` conditional compilation. Legacy Input returns honest error (read-only API)
- **Annotated screenshots**: `ScreenshotHandler.cs` `annotated` action captures via RenderTexture, composites numbered pixel-art labels, returns element refs

## Skills

- The repo ships one unified skill at `skills/unity-agentic-tools` for CLI setup, command discovery, command execution, live bridge workflows, scene and prefab mutation, UI testing, screenshots, tests, logs, and troubleshooting.
- **Generated command reference**: run `bun run generate:agent-guidance` after changing Unity command aliases so `skills/unity-agentic-tools/reference/command-reference.md` stays in sync with `Registry.cs`.
- **Sync to global install**: `bun run sync-skill` copies the skill (SKILL.md, `reference/`, `scripts/`) to `~/.claude/skills/`.
- **Verification**:
  - `bun skills/unity-agentic-tools/scripts/check-setup.mjs`

## Code Style

- 4 spaces indentation
- Functions: snake_case, Classes: PascalCase, Constants: UPPER_SNAKE_CASE
- Explicit return types for public methods
