# Claude Code - Unity Agentic Tools

## Overview

The Unity Agentic Tools plugin provides token-efficient file operations and documentation search for Unity projects. 76 CLI commands across CRUD groups + utilities.

## Usage

Interaction is handled through the `unity-agentic-tools` CLI.

### Core Commands

Always use `bun` to run the CLI:
`bun unity-agentic-tools/dist/cli.js <command> [args]`

### Read
- **read scene** `<file>` - List GameObject hierarchy (`--properties` for values, `--summary` for counts, `--filter-component`)
- **read gameobject** `<file> <id>` - Get single object by name or file ID (`-c <type>` for component filter)
- **read asset** `<file>` - Read any Unity YAML asset file (`--raw` to skip mesh auto-decode)
- **read material** `<file>` - Structured material properties (`--summary`)
- **read settings** `<project> -s <name>` - Project settings (aliases: tags, physics, quality, time, build, etc.)
- **read build** `<project>` - Build scene list
- **read dependencies** `<file>` - Asset GUID dependencies (`--recursive`)
- **read dependents** `<project> <guid>` - Reverse dependency lookup
- **read unused** `<project>` - Detect unused assets
- **read overrides** `<file> <instance>` - PrefabInstance overrides
- **read component** `<file> <file_id>` - Single component by fileID
- **read reference** `<file> <file_id>` - Trace fileID references
- **read script** `<file>` - C# types from .cs file or DLL
- **read scripts** - List types from registry (`--name`, `--kind`, `--source`)
- **read log** - Unity Editor.log (`--errors`, `--warnings`, `--compile-errors`)
- **read meta** `<file>` - .meta importer settings
- **read animation** `<file>` - AnimationClip data (`--summary`, `--paths`, `--curves`)
- **read animator** `<file>` - AnimatorController data (`--summary`, `--parameters`, `--states`)
- **read manifest** `<project>` - List packages from manifest.json (`--search`)
- **read input-actions** `<file>` - Input Actions file (`--summary`, `--maps`, `--actions`, `--bindings`)

### Create
- **create gameobject/scene/component/component-copy/prefab-variant/scriptable-object/meta/material/build/package/input-actions/animation/animator/prefab**

### Update
- **update gameobject/component/transform/scriptable-object** - Modify properties
- **update settings/tag/layer/sorting-layer** - Project settings
- **update parent/build/array/batch/batch-components** - Hierarchy and bulk ops
- **update material/meta/animation/animator** - Asset-specific editing
- **update sibling-index/input-actions/animation-curves/animator-state** - Additional editing
- **update prefab** unpack/override/remove-override/remove-component/restore-component/remove-gameobject/restore-gameobject

### Delete
- **delete gameobject/component/build/prefab/package** - Remove objects

### Utilities
- **search** `<path> [pattern]` - Find GameObjects (file or project-wide)
- **grep** `<project> <regex>` - Regex search across project files
- **clone** `<file> <name>` - Duplicate a GameObject and its hierarchy
- **version** `<project>` - Read Unity project version
- **docs** `<query>` - Search Unity documentation (auto-indexes)
- **setup/cleanup/status** - Project configuration management

## Agents

- **Unity Scene Scanner**: Specialized in discovery and hierarchy listing.
- **Unity Asset Analyst**: Specialized in deep inspection and documentation search.
- **Unity File Editor**: Specialized in making safe YAML modifications.

## Development

```bash
bun run build:rust     # Rebuild Rust native module
bun run build          # Build TypeScript
bun run test           # Unit tests (871 TS + 173 Rust)
```
