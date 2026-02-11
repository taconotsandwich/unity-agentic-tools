---
name: unity-agentic-tools
description: "Use when working with Unity projects, Unity YAML files (.unity, .prefab, .asset), or the unity-agentic-tools CLI tool. Covers parsing, inspecting, editing, searching, and testing Unity files via native Rust CLI. Use instead of raw Read for Unity files. Load this skill before any Unity-related task. Not for C# or shaders. Requires /initial-install."
---

# Unity YAML CLI

CLI: `unity-agentic-tools <command>`

## read — Read Unity files, settings, and build data

| Command | Usage |
|---------|-------|
| `read scene <file>` | GameObject hierarchy (paginated: `--page-size`, `--cursor`, `--max-depth`, `--summary`, `--properties`) |
| `read gameobject <file> <id>` | Single object by name or file ID (`-c <type>` filters components, `--properties` for values) |
| `read scriptable-object <file>` | Read .asset file (ScriptableObject) with all properties |
| `read settings <project> -s <name>` | Read settings (tags, physics, quality, time) |
| `read build <project>` | Read build settings (scene list, build profiles) |

## create — Create Unity objects

| Command | Usage |
|---------|-------|
| `create gameobject <file> <name>` | New GameObject (`-p <parent>` for hierarchy) |
| `create scene <path>` | New .unity file (`--defaults` for Camera+Light) |
| `create prefab-variant <source> <output>` | Prefab Variant from source prefab |
| `create scriptable-object <path> <script>` | New .asset file for a script |
| `create meta <script_path>` | Generate .meta file (MonoImporter) |
| `create component <file> <name> <component>` | Add component (built-in or script with `-p <project>`) |
| `create component-copy <file> <src_id> <target_name>` | Copy component to another object |
| `create build-scene <project> <scene>` | Add scene to build settings |

## update — Modify properties, transforms, settings

| Command | Usage |
|---------|-------|
| `update gameobject <file> <name> <prop> <value>` | Edit property by object name |
| `update component <file> <file_id> <prop> <value>` | Edit any component by file ID (supports dotted paths) |
| `update transform <file> <id> -p x,y,z -r x,y,z -s x,y,z` | Edit position/rotation/scale |
| `update scriptable-object <file> <prop> <value>` | Edit first MonoBehaviour in .asset file |
| `update settings <project> -s <name> --property <p> --value <v>` | Edit setting property |
| `update tag <project> add\|remove <tag>` | Add/remove tag |
| `update layer <project> <index> <name>` | Set named layer (3-31) |
| `update sorting-layer <project> add\|remove <name>` | Add/remove sorting layer |
| `update parent <file> <name> <new_parent>` | Move under new parent ("root" for scene root) |
| `update prefab <file> <instance>` | Unpack PrefabInstance to standalone objects |
| `update build-scene <project> <scene>` | Enable (`--enable`), disable (`--disable`), or move (`--move <idx>`) scene in build |

## delete — Remove objects and components

| Command | Usage |
|---------|-------|
| `delete gameobject <file> <name>` | Delete GameObject and hierarchy |
| `delete component <file> <file_id>` | Remove component by file ID |
| `delete build-scene <project> <scene>` | Remove scene from build settings |

## Top-level commands

| Command | Usage |
|---------|-------|
| `find <file> <pattern>` | Find GameObjects by name (`--exact` for exact match) |
| `search <project> -n <pattern>` | Search across scenes/prefabs (`-c`, `-t`, `-l` filters, `-m <n>` max matches) |
| `grep <project> <regex>` | Regex search across project files (`--type cs\|yaml\|all`) |
| `clone <file> <name>` | Duplicate a GameObject and its hierarchy (`-n <new_name>`) |
| `version <project>` | Read Unity project version |
| `docs <query>` | Search Unity docs (auto-indexes, `-s` summarize, `-c` compress) |
| `setup` | Initialize tools for Unity project (`-p <path>`, `--index-docs`) |
| `cleanup` | Remove .unity-agentic files (`--all` for full removal) |
| `status` | Show config, GUID cache count, native module status |

Doc index stored per-project at `.unity-agentic/doc-index.json`. Re-indexes only when files change (mtime-based).

Always inspect before editing, verify after.
