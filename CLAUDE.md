# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Claude Code plugin providing token-efficient CLI tools for parsing, analyzing, and editing Unity YAML files (scenes, prefabs, assets). Uses a native Rust backend (napi-rs) for high-performance parsing.

## Build & Test Commands

**Always use `bun` - never use `node`.**

```bash
# Install dependencies (run in each directory: root, unity-yaml, rust-core, doc-indexer)
bun install

# Build TypeScript (unity-yaml + doc-indexer)
bun run build

# Build Rust native module (requires Rust toolchain)
bun run build:rust

# Build everything (Rust + TypeScript)
bun run build:all

# Run unit tests
bun run test

# Run CLI integration tests (bash)
bun run test:integration

# Run tests with coverage
bun run test:coverage

# Type check without emitting
bun run type-check

# Watch mode during development
cd unity-yaml && bun run dev
```

## CLI Usage

All commands: `bun unity-yaml/dist/cli.js <command>`

```bash
# Inspect (recommended - complete info in one call)
bun unity-yaml/dist/cli.js inspect <path/to/file.unity>

# List hierarchy
bun unity-yaml/dist/cli.js list <file>

# Find GameObjects (fuzzy by default, use --exact for exact matching)
bun unity-yaml/dist/cli.js find <file> "Camera"

# Get by file ID
bun unity-yaml/dist/cli.js get <file> 1847675923

# Edit property (safe modification)
bun unity-yaml/dist/cli.js edit <file> <object> <property> <value>

# Setup GUID cache for a Unity project
bun unity-yaml/dist/cli.js setup --project <path/to/unity/project>

# Check status
bun unity-yaml/dist/cli.js status --project <path/to/unity/project>
```

## Architecture

```
.claude-plugin/     Plugin manifest (autodiscovers commands/, skills/, agents/)
commands/           Slash commands for Claude Code
skills/             Agent skills (unity-yaml parsing instructions)
agents/             Subagents: unity-scanner, unity-analyst, unity-editor
hooks/              Event handlers (detect_unity.js, pre/post validation)

unity-yaml/         TypeScript CLI
├── src/
│   ├── cli.ts      Command handler
│   ├── scanner.ts  Wrapper for Rust module (loads from host)
│   ├── binary-path.ts  Host binary location utilities
│   ├── editor.ts   Safe YAML property editing
│   ├── setup.ts    Project setup & GUID cache
│   └── types.ts    TypeScript interfaces
└── test/           Vitest unit tests + bash integration tests

rust-core/          Native Rust module (napi-rs)
├── src/
│   ├── lib.rs      NAPI exports
│   ├── scanner/    YAML parsing (regex-based)
│   └── indexer/    Doc indexing (future)
└── Cargo.toml      Dependencies: napi, memmap2, rayon, regex, serde

doc-indexer/        Documentation indexing module (future)
```

## Key Design Patterns

**Native Module on Host**: The native Rust binary is stored on the host machine at `~/.claude/unity-agentic-tools/bin/` rather than inside the plugin directory. This allows plugin updates without re-downloading binaries. `scanner.ts` loads the `.node` file directly from this location. Run `/initial-install` to download the binary for your platform.

**Native Module Required**: `scanner.ts` wraps the Rust module. If the native module isn't available, `UnityScanner` throws an error with installation instructions. Use `isNativeModuleAvailable()` to check before instantiating. There is no TypeScript fallback parser.

**Safe YAML Editing**: `editor.ts` preserves Unity file structure (GUIDs, comments, class IDs). Uses temp files for atomic writes.

**GUID Cache**: `setup.ts` creates `.unity-agentic/` in Unity projects mapping script GUIDs to file paths for component name resolution.

**Token Efficiency**: Use `inspect` for complete analysis in one call. Fuzzy matching is default to reduce search iterations.

## Code Style

- 4 spaces indentation
- Functions: snake_case (`scan_scene`, `find_by_name`)
- Classes/Interfaces: PascalCase (`UnityScanner`, `GameObject`)
- Constants: UPPER_SNAKE_CASE
- Explicit return types for public methods

## Testing

Unit tests use Vitest. Integration tests are bash scripts that test the full CLI.

```bash
# Run single test file
cd unity-yaml && bun test test/scanner.test.ts

# Run tests matching pattern
cd unity-yaml && bun test -t "should parse"
```

Tests skip gracefully when native Rust module is unavailable.
