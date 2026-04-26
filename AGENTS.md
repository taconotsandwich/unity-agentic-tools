# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI + native Rust package + Unity Editor bridge. The public surface is a compact command runner: `list`, `run`, `stream`, `install`, `uninstall`, and `status`.

## Quick Setup

**From source:**
```bash
bun install
bun run build:rust
bun run build
bun run build:unity-package
```

## Build/Test Commands

```bash
bun run build:rust        # Rebuild Rust native module (after .rs changes)
bun run build             # Build TypeScript
bun run build:unity-package # Compile Unity C# bridge package with dotnet
bun run test              # Unit tests (882 TS + 173 Rust)
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
- Classes/Interfaces: PascalCase (`UnityScanner`, `GameObject`)
- Functions/Methods: snake_case (`scan_scene`, `find_by_name`)
- Constants: UPPER_SNAKE_CASE (`MAX_CHUNK_SIZE`)

## Architecture

```
unity-agentic-tools/src/   TypeScript CLI source (Commander.js)
unity-agentic-tools/test/  Vitest tests (882 tests)
rust-core/                 Native Rust package via napi-rs (173 tests)
doc-indexer/               Documentation indexing module
unity-package/             Unity Editor bridge (C# UPM package)
tools/dotnet-unity-compile/ Dotnet compile harness for Unity package
```

- Workspaces: root package.json has `"workspaces": ["rust-core", "unity-agentic-tools", "doc-indexer"]`
- Public runner built in `cli.ts` with bridge transport in `editor-client.ts`
- Unity command discovery/execution lives in `unity-package/Editor/Commands`
- The CLI does not register legacy file/CRUD command groups

## Testing

- Run `bun run test` after any TypeScript or Rust change
- Run `bun run test:integration` for end-to-end CLI verification
- `test/fixtures/external/` is a git submodule -- CI needs `submodules: true`
- Unity YAML regex: always use `[ \t]*` (not `\s*`) between keys and values to avoid newline bleed
