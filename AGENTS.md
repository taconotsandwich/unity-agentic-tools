# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI + native Rust backend providing token-efficient Unity file manipulation utilities. 79 commands across 3 command groups (`read`, `update`, `delete`), a live editor bridge (37 subcommands), and 8 top-level utilities.

## Quick Setup

**From source:**
```bash
bun install && bun run build:rust && bun run build
```

## Build/Test Commands

```bash
bun run build:rust        # Rebuild Rust native module (after .rs changes)
bun run build             # Build TypeScript
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
rust-core/                 Native Rust module via napi-rs (173 tests)
doc-indexer/               Documentation indexing module
unity-package/             Unity Editor bridge (C# UPM package)
```

- Workspaces: root package.json has `"workspaces": ["rust-core", "unity-agentic-tools", "doc-indexer"]`
- Groups built in `cmd-read.ts`, `cmd-update.ts`, `cmd-delete.ts`
- Editor bridge: `cmd-editor.ts` (CLI) + `editor-client.ts` (WebSocket transport)
- Scanner: `scanner.ts` tries `../native/index.js` first, falls back to workspace `require('unity-file-tools')`

## Testing

- Run `bun run test` after any TypeScript or Rust change
- Run `bun run test:integration` for end-to-end CLI verification
- `test/fixtures/external/` is a git submodule -- CI needs `submodules: true`
- Unity YAML regex: always use `[ \t]*` (not `\s*`) between keys and values to avoid newline bleed
