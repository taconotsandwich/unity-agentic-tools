# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Claude Code plugin providing token-efficient CLI tools for parsing, analyzing, and editing Unity YAML files (scenes, prefabs, assets). Uses a native Rust backend (napi-rs) for high-performance parsing.

**Always use `bun` — never use `node`.**

## Build & Test

```bash
bun install           # Install all deps (workspaces resolve native module)
bun run build:rust    # Build Rust native module
bun run build         # Build TypeScript
bun run test          # Unit tests
bun run test:integration  # CLI integration tests (bash)
```

## Architecture

```
.claude-plugin/     Plugin manifest (autodiscovers commands/, skills/)
commands/           Slash commands for Claude Code
skills/             Agent skills (unity-yaml parsing instructions)
hooks/              Event handlers (detect_unity.js, pre/post validation)
unity-yaml/         TypeScript CLI + Vitest tests
rust-core/          Native Rust module (napi-rs)
doc-indexer/        Documentation indexing module
```

## Key Design Patterns

- **Native Module via npm**: Published as `unity-file-tools` — a single package shipping all platform binaries. `bun install` auto-downloads. Workspace link resolves in dev.
- **Safe YAML Editing**: `editor.ts` preserves GUIDs, comments, class IDs. Uses temp files for atomic writes.
- **GUID Cache**: `setup.ts` creates `.unity-agentic/` mapping script GUIDs to file paths.
- **Token Efficiency**: `inspect` without `--properties` returns structure only. Use `--properties` when component values are needed.

## Code Style

- 4 spaces indentation
- Functions: snake_case, Classes: PascalCase, Constants: UPPER_SNAKE_CASE
- Explicit return types for public methods
