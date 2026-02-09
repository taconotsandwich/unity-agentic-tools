---
name: unity-yaml
description: "Parse, inspect, and edit Unity YAML files (.unity, .prefab, .asset) via native Rust CLI. Use instead of raw Read for Unity files. Not for C# or shaders. Requires /initial-install."
---

# Unity YAML CLI

CLI: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js <command>`

## Inspection

| Command | Usage |
|---------|-------|
| `list <file>` | GameObject hierarchy (paginated: `--page-size`, `--cursor`, `--max-depth`) |
| `find <file> <pattern>` | Search by name (`--exact` for exact match) |
| `inspect <file> [id]` | Structure only; add `--properties` for values, `--verbose` for IDs |
| `inspect-all <file>` | Full file inspection (`--properties`, `--page-size`, `--cursor`) |
| `get <file> <id>` | Single object by file ID (`-c <type>` for specific component) |
| `read-asset <file>` | Read .asset file (ScriptableObject) with all properties |

## Editing

| Command | Usage |
|---------|-------|
| `edit <file> <name> <prop> <value>` | Edit property by object name |
| `edit-component <file> <file_id> <prop> <value>` | Edit any component by file ID (supports dotted paths) |
| `edit-transform <file> <id> -p x,y,z -r x,y,z -s x,y,z` | Edit position/rotation/scale |
| `edit-asset <file> <prop> <value>` | Edit first MonoBehaviour in .asset file |

## Creation

| Command | Usage |
|---------|-------|
| `create <file> <name>` | New GameObject (`-p <parent>` for hierarchy) |
| `create-scene <path>` | New .unity file (`--defaults` for Camera+Light) |
| `create-variant <source> <output>` | Prefab Variant from source prefab |
| `create-scriptable-object <path> <script>` | New .asset file for a script |
| `create-meta <script_path>` | Generate .meta file (MonoImporter) |

## Object Manipulation

| Command | Usage |
|---------|-------|
| `add-component <file> <name> <component>` | Add component (built-in or script) |
| `remove-component <file> <file_id>` | Remove component by file ID |
| `copy-component <file> <src_id> <target_name>` | Copy component to another object |
| `delete <file> <name>` | Delete GameObject and hierarchy |
| `duplicate <file> <name>` | Duplicate with hierarchy (`-n <new_name>`) |
| `unpack-prefab <file> <instance>` | Unpack PrefabInstance to standalone objects |
| `reparent <file> <name> <new_parent>` | Move under new parent ("root" for scene root) |

## Project Settings

| Command | Usage |
|---------|-------|
| `read-settings <project> -s <name>` | Read settings (tags, physics, quality, time) |
| `edit-settings <project> -s <name> --property <p> --value <v>` | Edit setting property |
| `edit-tag <project> add\|remove <tag>` | Add/remove tag |
| `edit-layer <project> <index> <name>` | Set named layer (3-31) |
| `edit-sorting-layer <project> add\|remove <name>` | Add/remove sorting layer |

## Project Search

| Command | Usage |
|---------|-------|
| `search <project> -n <pattern>` | Search across scenes/prefabs (`-c`, `-t`, `-l` filters) |
| `grep <project> <regex>` | Regex search across project files (`--type cs\|yaml\|all`) |

## Documentation

| Command | Usage |
|---------|-------|
| `search-docs <query>` | Search docs (auto-discovers + indexes on first use, `-s` summarize, `-c` compress) |
| `index-docs [path]` | Index docs (auto-discovers package + editor sources if no path given) |

Index stored per-project at `.unity-agentic/doc-index.json`. Re-indexes only when files change (mtime-based).

## Build Settings

| Command | Usage |
|---------|-------|
| `build-settings <project>` | Read scene list and build profiles |
| `build-add-scene <project> <scene>` | Add scene to build |
| `build-remove-scene <project> <scene>` | Remove scene from build |
| `build-enable-scene <project> <scene>` | Enable scene in build |
| `build-disable-scene <project> <scene>` | Disable scene in build |
| `build-move-scene <project> <scene> <index>` | Reorder scene in build list |
| `project-version <project>` | Read Unity project version |

## Setup

| Command | Usage |
|---------|-------|
| `setup` | Initialize tools for Unity project (`-p <path>`, `--index-docs`) |
| `cleanup` | Remove .unity-agentic files (`--all` for full removal) |
| `status` | Show config, GUID cache count, native module status |

Always inspect before editing, verify after.
