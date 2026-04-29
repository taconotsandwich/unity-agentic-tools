# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Compact Unity command runner, native Rust package, and live Unity Editor bridge. The public CLI surface is `list`, `run`, `diff`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.

The Claude Code plugin (hooks, skills, manifest) lives in a separate repo: [unity-agentic-tools-claude-plugin](https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin).

**Always use `bun` — never use `node`.**

## Build & Test

```bash
bun install           # Install all deps (workspaces resolve native module)
bun run build:rust    # Build Rust native module
bun run build         # Build TypeScript
bun run build:unity-package # Compile Unity C# bridge package with dotnet
bun run test          # Unit tests
bun run test:integration  # CLI integration tests (bash)
```

## Dev Setup

```bash
cd unity-agentic-tools && npm link   # Register unity-agentic-tools CLI globally (one-time)
```

## Architecture

```
unity-agentic-tools/         TypeScript CLI + Vitest tests
rust-core/          Native Rust package (napi-rs)
doc-indexer/        Documentation indexing module
unity-package/      Unity Editor bridge (C# UPM package)
tools/dotnet-unity-compile/ Dotnet compile harness for the Unity package
```

- Workspaces: root package.json has `"workspaces": ["rust-core", "unity-agentic-tools", "doc-indexer"]`
- `rust-core` is workspace-only (not published to npm) — its `unity-file-tools` name is used internally for napi build

## Key Design Patterns

- **Native Module via npm**: `rust-core` remains a workspace package and native build target for the npm side.
- **Bridge-first mutation**: Create/update/delete scene, prefab, asset, and GameObject operations run through Unity-side bridge commands, not local serialized-file mutation code.
- **Token Efficiency**: `inspect` without `--properties` returns structure only. Use `--properties` when component values are needed.
- **Scanner loading**: scanner internals are no longer registered as CLI commands.
- **Unity YAML regex safety**: Always use `[ \t]*` (not `\s*`) between YAML keys and values — `\s` matches `\n` and causes cross-line capture bleed. Similarly, use `[^\n]*` (not `.*`) for value capture groups.

## CLI Structure

- Public CLI uses a small top-level runner: `list`, `run`, `diff`, `stream`, `install`, `uninstall`, `cleanup`, `status`.
- `list` and `run` call `UnityAgenticTools.Commands.Registry` through `editor.invoke`.
- `diff` reports git changes for non-C# files by default.
- `stream` opens a persistent WebSocket subscription and filters topics client-side.
- Command aliases and project `[AgenticCommand]` methods live on the C# side, not as new CLI subcommands.
- The CLI does not register legacy local file mutation command groups such as `read`, `create`, `update`, `delete`, `editor`, `clone`, `search`, `grep`, `docs`, `version`, or `setup`.

## CI / Release

- CI has Rust toolchain, builds native module, runs cargo test + bun test + integration tests
- Pre-commit hook runs type-check + tests; pre-push runs full test suite + integration
- Release triggered by pushing `v*.*.*` tag — builds 4 platform binaries, runs tests, publishes to npm, creates GitHub Release
- `macos-13` runners deprecated — use `macos-15` + cross-compile (`--target x86_64-apple-darwin`) for Intel macOS
- `test/fixtures/external/` is a git submodule — test.yml needs `submodules: true` on checkout
- npm publish uses OIDC trusted publishing (--provenance) — no NPM_TOKEN secret needed
- Version sync: `scripts/sync-version.js` keeps unity-agentic-tools and rust-core in sync
- `unity-file-tools` moved from dependencies to devDependencies (workspace-only)

## Gotchas

- `napi build --platform` regenerates index.js with ALL platforms (not just our 4) — this is expected, don't trim it
- `tsc --noEmit` shows `import.meta` error for scanner.ts — this is expected (bun-only feature), doesn't block commits
- Remote may have new commits — always `git pull --rebase` before push if rejected
- TagManager layers regex MUST stop at `m_SortingLayers:` boundary — greedy regex bleeds into sorting layers
- Build settings readers live in `build-version.ts` and `build-settings.ts`; local build-setting mutation helpers have been removed.
- dist/ is gitignored at root level — dist files are NOT committed
- **Regex `\s*` newline bleed**: In both Rust and TypeScript, `\s*` between YAML key and value will match newlines, causing the regex to capture data from subsequent lines. Always use `[ \t]*` for horizontal whitespace only. This caused critical bugs in tag extraction (`gameobject.rs`) and name extraction (`mod.rs`).

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
- **Install**: `unity-agentic-tools install` adds git URL to manifest.json (defaults project to cwd; use `--project <path>` when needed); for dev, copy `unity-package/` into project's `Packages/`
- **Transport**: `editor-client.ts` exports `call_editor()` (single request/response) and `stream_editor()` (persistent connection for events)
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
