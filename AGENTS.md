# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI providing token-efficient Unity file manipulation utilities. Supports multiple platforms (Claude Code, Gemini CLI).

**Core Structure:**
- `unity-yaml/src/` - TypeScript source code
- `unity-yaml/dist/` - Compiled JavaScript output
- `unity-yaml/test/` - TypeScript tests
- `commands/` - TOML command definitions for Gemini CLI
- `gemini-extension.json` - Gemini CLI extension manifest (at repository root)
- `claude/` - Claude Code plugin
- `gemini/` - Gemini CLI skill context

## Quick Setup

**Claude Code:**
```bash
cd claude
ln -s $(pwd) ~/.claude/plugins/unity-agentic-tools
```

**Gemini CLI:**
```bash
gemini extensions install git@github.com:taconotsandwich/unity-agentic-tools.git
```

## Build/Test/Lint Commands

### Building
```bash
cd unity-yaml
npm run build
```

### Running Tests
```bash
cd unity-yaml
npm test
```

### Linting
```bash
cd unity-yaml
npm run lint
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

All commands use `node unity-yaml/dist/cli.js`:
- `list <file>` - List GameObject hierarchy
- `find <file> <pattern>` - Find GameObjects
- `get <file> <object_id>` - Get GameObject details
- `inspect <file> [identifier]` - Inspect file or object
- `inspect-all <file>` - Inspect entire file

## Platform Integration

### Claude Code
Commands defined in `.claude-plugin/plugin.json`
Agent definitions in `claude/agents/`

### Gemini CLI
Extension config in `gemini-extension.json` (at repository root)
Commands in `commands/*.toml`
Skill context in `gemini/GEMINI.md`
