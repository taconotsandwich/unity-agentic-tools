# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI + Unity Editor bridge. The public surface is a compact command runner: `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.

## Quick Setup

**From source:**
```bash
bun install
bun run build
bun run build:unity-package
```

## Build/Test Commands

```bash
bun run build             # Build TypeScript
bun run build:unity-package # Compile Unity C# bridge package with dotnet
bun run test              # Unit tests
bun run test:integration  # CLI integration tests
bun run type-check        # tsc --noEmit
```

Opt-in, needs a real Editor, not run by CI:

```bash
bun run test:integration:unity  -- --unity-bin <path>          # headless Editor validation
bun run test:integration:stress -- --project <path> --cycles 5 # play mode cycles against an open Editor
```

## Code Style Guidelines

### TypeScript
- 4 spaces indentation
- `interface` for object shapes, `type` for unions/primitives
- Explicit return types for public methods
- Never use `any` -- use proper types, generics, or `unknown`

### Naming Conventions
- Classes/Interfaces: PascalCase (`HierarchyNodeRef`, `EditorConfig`)
- Functions/Methods: snake_case (`call_editor`, `find_unity_project_root`)
- Constants: UPPER_SNAKE_CASE (`UNITY_CLASS_IDS`)

## Architecture

```
unity-agentic-tools/src/   TypeScript CLI source (Commander.js)
unity-agentic-tools/test/  Vitest tests
unity-package/             Unity Editor bridge (C# UPM package)
tools/dotnet-unity-compile/ Dotnet compile harness for Unity package
```

- Workspaces: root package.json has `"workspaces": ["unity-agentic-tools"]`
- Public runner built in `cli.ts` with bridge transport in `editor-client.ts`
- Unity command discovery/execution lives in `unity-package/Editor/Commands`
- The CLI does not register legacy local file mutation command groups
- Retry classification lives in `editor-client.ts`: `get_action_semantics` reads the real target out of `params` (every call ships as `editor.invoke`, so matching on the JSON-RPC method name does not work), and the retryable-code sets differ per action kind. Reads and play mode transitions tolerate `-32000`/`-32003`; mutations must not, because those codes mean the request may already be running

## Testing

- Run `bun run test` after any TypeScript change
- Run `bun run test:integration` for end-to-end CLI verification
- Run `bun run test:integration:stress` after touching retry or transport behaviour; the bar is `transient_reads: 0` across repeated play mode cycles
- `test/fixtures/external/` is a git submodule -- CI needs `submodules: true`
- Unity YAML regex: always use `[ \t]*` (not `\s*`) between keys and values to avoid newline bleed
