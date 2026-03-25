# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Token-efficient CLI tools for parsing, analyzing, and editing Unity YAML files (scenes, prefabs, assets). Uses a native Rust backend (napi-rs) for high-performance parsing.

The Claude Code plugin (hooks, skills, manifest) lives in a separate repo: [unity-agentic-tools-claude-plugin](https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin).

**Always use `bun` — never use `node`.**

## Build & Test

```bash
bun install           # Install all deps (workspaces resolve native module)
bun run build:rust    # Build Rust native module
bun run build         # Build TypeScript
bun run test          # Unit tests (882 TS + 173 Rust)
bun run test:integration  # CLI integration tests (bash)
```

## Dev Setup

```bash
cd unity-agentic-tools && npm link   # Register unity-agentic-tools CLI globally (one-time)
```

## Architecture

```
unity-agentic-tools/         TypeScript CLI + Vitest tests
rust-core/          Native Rust module (napi-rs)
doc-indexer/        Documentation indexing module
unity-package/      Unity Editor bridge (C# UPM package)
```

- Workspaces: root package.json has `"workspaces": ["rust-core", "unity-agentic-tools", "doc-indexer"]`
- `rust-core` is workspace-only (not published to npm) — its `unity-file-tools` name is used internally for napi build

## Key Design Patterns

- **Native Module via npm**: Single package `unity-agentic-tools` published from `unity-agentic-tools/` directory. `files`: `["dist", "native", "README.md", "LICENSE"]`. `native/` directory created at publish time by CI — contains napi-rs loader (index.js) + platform .node binaries.
- **Safe YAML Editing**: `editor.ts` preserves GUIDs, comments, class IDs. Uses temp files for atomic writes.
- **GUID Cache**: `setup.ts` creates `.unity-agentic/` mapping script GUIDs to file paths.
- **Token Efficiency**: `inspect` without `--properties` returns structure only. Use `--properties` when component values are needed.
- **Scanner loading**: `scanner.ts` tries `../native/index.js` first (published npm), falls back to `require('unity-file-tools')` (workspace dev).
- **Rust inspect API**: `inspect_all` returns NAPI struct (`SceneInspection`) — can't filter fields dynamically, must set to None before returning. `inspect` (single) returns `serde_json::Value` — flexible field filtering via `build_detail_output`. Properties always extracted in Rust (`extract_single_component_with_config`), stripped later if not needed.
- **Unity YAML regex safety**: Always use `[ \t]*` (not `\s*`) between YAML keys and values — `\s` matches `\n` and causes cross-line capture bleed. Similarly, use `[^\n]*` (not `.*`) for value capture groups.
- **`.Array` suffix handling**: Unity's API exposes arrays as `m_Foo.Array` but YAML contains `m_Foo:`. Strip `.Array` suffix before searching YAML content (see `unity-block.ts` array methods).
- **Mesh binary decode**: `read_asset` with `decode_mesh=true` (default) auto-decodes Mesh assets (class 43). Replaces hex `_typelessdata` with structured `vertices` array and `IndexBuffer` with integer array. Supports multi-stream vertex layouts. Graceful fallback: sets `_mesh_decode_skipped` with reason if decode fails (e.g., external `.resource` storage). Use `--raw` flag to preserve hex.

## CLI Structure

- CLI uses 4 CRUD group commands: `create`, `read`, `update`, `delete` (each with noun subcommands)
- Group commands built in separate files: `cmd-create.ts`, `cmd-read.ts`, `cmd-update.ts`, `cmd-delete.ts`
- Each exports a `build_<verb>_command()` returning a Commander.Command, wired via `program.addCommand()`
- `getScanner` passed as callback to `read` and `update` commands (lazy init stays in cli.ts)
- Non-CRUD utilities stay top-level: `search`, `grep`, `clone`, `docs`, `version`, `setup`, `cleanup`, `status`
- `update prefab` is a nested command group with 9 subcommands: `unpack`, `override`, `batch-overrides`, `managed-reference`, `remove-override`, `remove-component`, `restore-component`, `remove-gameobject`, `restore-gameobject`
- `editor` is a live bridge command group with 43 subcommands, built in `cmd-editor.ts`

### Command Counts (123 total)

- **Top-level**: clone, search, grep, version, docs, setup, cleanup, status (8)
- **create**: gameobject, scene, prefab-variant, scriptable-object, meta, component, component-copy, build, material, package, input-actions, animation, animator, prefab (14)
- **read**: scene, gameobject, asset, scriptable-object, material, dependencies, dependents, unused, settings, build, overrides, component, reference, target, script, scripts, log, meta, animation, animator, manifest, input-actions (22)
- **update**: gameobject, component, transform, scriptable-object, settings, tag, layer, sorting-layer, parent, build, array, batch, batch-components, material, meta, animation, animator, sibling-index, input-actions, animation-curves, animator-state, managed-reference + prefab subgroup (9) (31)
- **delete**: gameobject, component, build, prefab, package (5)
- **editor**: status, play, stop, pause, step, play-state, save, scene-open, console-logs, console-clear, console-follow, screenshot, tests-run, install, uninstall, hierarchy-snapshot, ui-snapshot, input-map, get (text/value/active/position/component), ui-click, ui-fill, ui-type, ui-toggle, ui-slider, ui-select, ui-scroll, ui-focus, input-key, input-mouse, input-touch, input-action, wait, invoke (43)

### Setting Aliases

`read settings` and `update settings` accept these aliases via `SETTING_ALIASES` in `settings.ts`:
- tags/tagmanager -> TagManager
- physics/dynamics -> DynamicsManager
- quality -> QualitySettings
- time -> TimeManager
- input -> InputManager
- audio -> AudioManager
- editor -> EditorSettings
- graphics -> GraphicsSettings
- physics2d -> Physics2DSettings
- player/project -> ProjectSettings
- navmesh -> NavMeshAreas
- build/editorbuild -> EditorBuildSettings

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

- **`native/` dir shadows workspace builds**: If `unity-agentic-tools/native/` exists (CI publish artifact), `scanner.ts` strategy 1 loads from it instead of the workspace-linked `rust-core/`. After `build:rust`, copy updated `.node`/`index.js`/`index.d.ts` into `native/` or delete the dir.
- `napi build --platform` regenerates index.js with ALL platforms (not just our 4) — this is expected, don't trim it
- `tsc --noEmit` shows `import.meta` error for scanner.ts — this is expected (bun-only feature), doesn't block commits
- Remote may have new commits — always `git pull --rebase` before push if rejected
- TagManager layers regex MUST stop at `m_SortingLayers:` boundary — greedy regex bleeds into sorting layers
- Build settings merged into unity-agentic-tools: `build-version.ts`, `build-settings.ts`, `build-editor.ts`
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
- **Install**: `editor install <project>` adds git URL to manifest.json; for dev, copy `unity-package/` into project's `Packages/`
- **Transport**: `editor-client.ts` exports `call_editor()` (single request/response) and `stream_editor()` (persistent connection for events)
- **Ref system**: `RefManager.cs` maintains `@hN` (hierarchy) and `@uN` (UI) ref registries. Refs created by `hierarchy-snapshot`/`ui-snapshot`, cleared on scene change, play mode transition, or domain reload
- **UI walking**: `UIWalker.cs` walks both uGUI (Canvas/Selectable) and UI Toolkit (UIDocument/VisualElement) trees. TMP variants accessed via reflection to avoid hard dependency
- **Wait conditions**: `WaitConditionRunner.cs` pumps conditions via `EditorApplication.update` with timeout support
- **Input System**: `InputHandler.cs` uses `#if ENABLE_INPUT_SYSTEM` conditional compilation. Legacy Input returns honest error (read-only API)
- **Annotated screenshots**: `ScreenshotHandler.cs` `annotated` action captures via RenderTexture, composites numbered pixel-art labels, returns element refs

## Skills

- The `unity-agentic-tools` skill is installed globally at `~/.claude/skills/unity-agentic-tools`
- Skill source files live in `skills/unity-agentic-tools/` within this repo
- **Sync to global install**: `bun run sync-skill` copies SKILL.md, reference files, and scripts to `~/.claude/skills/`
- **Structure**: SKILL.md is a navigation hub (~80 lines); detailed command tables live in `reference/` files (loaded on demand by Claude)
- **Verification**: `node skills/unity-agentic-tools/scripts/check-setup.mjs` checks binary and native module availability

## Code Style

- 4 spaces indentation
- Functions: snake_case, Classes: PascalCase, Constants: UPPER_SNAKE_CASE
- Explicit return types for public methods
