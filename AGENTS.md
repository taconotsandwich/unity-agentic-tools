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

## Testing

- Run `bun run test` after any TypeScript change
- Run `bun run test:integration` for end-to-end CLI verification
- `test/fixtures/external/` is a git submodule -- CI needs `submodules: true`
- Unity YAML regex: always use `[ \t]*` (not `\s*`) between keys and values to avoid newline bleed
