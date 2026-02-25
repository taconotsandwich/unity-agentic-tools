# Unity Agentic Tools - Agent Guidelines

This document provides essential guidelines for agentic coding tools working in this repository.

## Project Overview

TypeScript CLI + native Rust backend providing token-efficient Unity file manipulation utilities.

**Core Structure:**
- `unity-agentic-tools/src/` - TypeScript source code
- `unity-agentic-tools/test/` - Vitest tests (871 tests)
- `rust-core/` - Native Rust module via napi-rs (173 tests)
- `doc-indexer/` - Documentation indexing module

## Quick Setup

**Install CLI globally:**
```bash
bun add -g unity-agentic-tools
```

**From source:**
```bash
bun install && bun run build:rust && bun run build
```

## Build/Test Commands

```bash
bun run build:rust     # Rebuild Rust native module (after .rs changes)
bun run build          # Build TypeScript
bun run test           # Unit tests (871 TS + 173 Rust)
bun run test:integration  # CLI integration tests
```

## Code Style Guidelines

### TypeScript Style
- Use 4 spaces for indentation
- Use `interface` for object shapes, `type` for unions/primitives
- Explicit return types for public methods
- Never use `any` — use proper types, generics, or `unknown`

### Naming Conventions
- Classes/Interfaces: PascalCase (`UnityScanner`, `GameObject`)
- Functions/Methods: snake_case (`scan_scene`, `find_by_name`)
- Constants: UPPER_SNAKE_CASE (`MAX_CHUNK_SIZE`)

## CLI Commands Reference (76 commands)

All commands: `unity-agentic-tools <command> [args]`

### Top-Level Utilities
- `search <path> [pattern]` - Find GameObjects (file or project-wide, supports `--tag`, `--layer`, `--component`, `--exact`)
- `grep <project> <regex>` - Regex search across project files (`--type`, `--max`, `--context`)
- `clone <file> <name>` - Duplicate a GameObject and its hierarchy
- `version <project>` - Read Unity project version
- `docs <query>` - Search Unity documentation (auto-indexes)
- `setup -p <project>` - Initialize GUID cache and project data
- `cleanup -p <project>` - Remove cached data
- `status -p <project>` - Show current configuration

### Create (14 subcommands)
- `create gameobject <file> <name>` - New GameObject (`-p` for parent)
- `create scene <path>` - New .unity file (`-d` for defaults)
- `create prefab-variant <source> <output>` - Prefab Variant
- `create scriptable-object <output> <script>` - ScriptableObject .asset
- `create meta <script_path>` - Generate .meta file
- `create component <file> <name> <type>` - Add component to GameObject
- `create component-copy <file> <src_fid> <target>` - Copy component
- `create build <project> <scene>` - Add scene to build settings
- `create material <output>` - New Material (`--shader`, `--properties`)
- `create package <project> <name> <version>` - Add package to manifest.json
- `create input-actions <path> <name>` - Create blank .inputactions file
- `create animation <path> [name]` - Create blank .anim file
- `create animator <path> [name]` - Create blank .controller file
- `create prefab <file> <name>` - Create prefab from GameObject

### Read (21 subcommands)
- `read scene <file>` - GameObject hierarchy (`--properties`, `--summary`, `--page-size`, `--filter-component`)
- `read gameobject <file> <id>` - Single object by name/fileID (`-c` component filter, `-p` properties)
- `read asset <file>` - Any Unity YAML asset file (`--raw` to skip mesh auto-decode)
- `read scriptable-object` - (Deprecated: renamed to `read asset`)
- `read material <file>` - Structured material properties (`--summary`, `--project`)
- `read dependencies <file>` - Asset GUID dependencies (`--recursive`, `--unresolved`)
- `read dependents <project> <guid>` - Reverse dependency lookup
- `read unused <project>` - Detect unused assets
- `read settings <project> -s <name>` - Project settings (aliases: tags, physics, quality, time, build, etc.)
- `read build <project>` - Build scene list
- `read overrides <file> <instance>` - PrefabInstance overrides (`--flat`)
- `read component <file> <file_id>` - Single component by fileID
- `read reference <file> <file_id>` - Trace fileID references (`--direction`, `--depth`)
- `read script <file>` - C# types from .cs file or DLL
- `read scripts` - List types from registry (`--name`, `--namespace`, `--kind`, `--source`)
- `read log` - Unity Editor.log (`--errors`, `--warnings`, `--compile-errors`, `--since`, `--search`)
- `read meta <file>` - .meta importer settings
- `read animation <file>` - AnimationClip (`--summary`, `--paths`, `--curves`)
- `read animator <file>` - AnimatorController (`--summary`, `--parameters`, `--states`, `--transitions`)
- `read manifest <project>` - List packages from manifest.json (`--search`)
- `read input-actions <file>` - Input Actions file (`--summary`, `--maps`, `--actions`, `--bindings`)

### Update (28 subcommands)
- `update gameobject <file> <name> <prop> <value>` - Edit GameObject property
- `update component <file> <fid> <prop> <value>` - Edit component (dotted paths, array paths)
- `update transform <file> <id>` - Position/rotation/scale (`-p`, `-r`, `-s`)
- `update scriptable-object <file> <prop> <value>` - Edit .asset property
- `update settings <project> -s <name> --property <p> --value <v>` - Edit project settings
- `update tag <project> add|remove <tag>` - Manage tags
- `update layer <project> <index> <name>` - Set named layer (3-31)
- `update sorting-layer <project> add|remove <name>` - Manage sorting layers
- `update parent <file> <child> <parent>` - Reparent GameObject
- `update build <project> <scene>` - Enable/disable/move scene (`--enable`, `--disable`, `--move`)
- `update array <file> <fid> <prop> <action> [args...]` - Array insert/append/remove
- `update batch <file> <json>` - Batch edit GameObjects
- `update batch-components <file> <json>` - Batch edit components
- `update material <file>` - Edit material (`--set`, `--set-color`, `--set-texture`, `--shader`, `--keyword-add/remove`)
- `update meta [file]` - Edit .meta (`--set`, `--max-size`, `--compression`, `--batch`, `--dry-run`)
- `update animation <file>` - Edit AnimationClip (`--set`, `--add-event`, `--remove-event`)
- `update animator <file>` - Edit parameters (`--add-parameter`, `--type`, `--remove-parameter`, `--set-default`)
- `update sibling-index <file> <name> <index>` - Set sibling index of a GameObject
- `update input-actions <file>` - Edit Input Actions (add/remove maps, actions, bindings)
- `update animation-curves <file>` - Add, remove, or modify animation curves
- `update animator-state <file>` - Add/remove states and transitions
- `update prefab unpack|override|remove-override|remove-component|restore-component|remove-gameobject|restore-gameobject`

### Delete (5 subcommands)
- `delete gameobject <file> <name>` - Delete GameObject and hierarchy
- `delete component <file> <file_id>` - Remove component
- `delete build <project> <scene>` - Remove scene from build settings
- `delete prefab <file> <instance>` - Delete PrefabInstance
- `delete package <project> <name>` - Remove package from manifest.json

## Claude Code Integration

The Claude Code plugin (hooks, skills, manifest) lives in a separate repository:
https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin
