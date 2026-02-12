# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI providing token-efficient Unity file manipulation utilities for Claude Code.

**Core Structure:**
- `unity-agentic-tools/src/` - TypeScript source code
- `unity-agentic-tools/dist/` - Compiled JavaScript output (built by Bun)
- `unity-agentic-tools/test/` - TypeScript tests
- `.claude-plugin/` - Claude Code plugin manifest
- `doc-indexer/` - Documentation indexing module

## Quick Setup

**Claude Code:**
```bash
# Install from marketplace
/plugin marketplace add https://github.com/taconotsandwich/unity-agentic-tools
/plugin install unity-agentic-tools
```

Or develop locally:
```bash
ln -s $(pwd) ~/.claude/plugins/unity-agentic-tools
```

## Build/Test Commands

### Building
```bash
bun run build
```

### Running Tests
```bash
bun run test
```

### Watch Mode
```bash
bun run dev
```

## Code Style Guidelines

### TypeScript Style
- Use 4 spaces for indentation
- Maximum line length: 100 characters
- Use `interface` for object shapes
- Use `type` for unions/primitives
- Explicit return types for public methods

### Naming Conventions
- Classes/Interfaces: PascalCase (`UnityScanner`, `GameObject`)
- Functions/Methods: snake_case (`scan_scene`, `find_by_name`)
- Constants: UPPER_SNAKE_CASE (`MAX_CHUNK_SIZE`)
- Private methods: single underscore prefix (`_parse_object`)

### File Organization
- One class per file
- Export primary class
- Keep utilities separate

## CLI Commands Reference

All commands use `bun unity-agentic-tools/dist/cli.js <command>`:
- `read scene <file>` - List GameObject hierarchy (`--properties` for values, `--summary` for counts)
- `read gameobject <file> <id>` - Get single object by name or file ID (`-c <type>` for component filter)
- `read scriptable-object <file>` - Read .asset file
- `read settings <project> -s <name>` - Read project settings
- `read build <project>` - Read build settings
- `create gameobject|scene|component|build|...` - Create Unity objects
- `update gameobject|transform|component|build|prefab|...` - Modify properties
- `delete gameobject|component|build|prefab` - Remove objects
- `search <file> <pattern>` - Find GameObjects by name in a file
- `search <project> -n <pattern>` - Search across scenes/prefabs
- `grep <project> <regex>` - Regex search across project files
- `clone <file> <name>` - Duplicate a GameObject and its hierarchy
- `version <project>` - Read Unity project version
- `docs <query>` - Search Unity documentation (auto-indexes)

## Claude Code Integration

- Plugin manifest: `.claude-plugin/plugin.json`
- Hook handlers: `claude/hooks.json`
- Documentation: See docs/claude.md
