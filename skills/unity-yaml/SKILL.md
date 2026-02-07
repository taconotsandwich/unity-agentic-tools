---
name: unity-yaml
description: "Parse, inspect, and edit Unity YAML files (.unity, .prefab, .asset) via native Rust CLI. Use instead of raw Read for Unity files. Not for C# or shaders. Requires /initial-install."
---

# Unity YAML CLI

CLI: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js <command>`

| Command | Usage |
|---------|-------|
| `list <file>` | GameObject hierarchy |
| `find <file> <pattern> [--exact]` | Search by name |
| `inspect <file> [id] [--properties]` | Structure (add `--properties` for values) |
| `get <file> <object_id> [--properties]` | Object by file ID |
| `edit <file> <name> <prop> <value>` | Modify property (preserves GUIDs) |
| `edit-transform <file> <id>` | Edit position/rotation/scale |
| `edit-component <file> <id> <prop> <value>` | Edit component by file ID |
| `create <file> <name>` | New GameObject |
| `add-component <file> <name> <component>` | Add component |
| `search-docs <query>` | Search Unity docs |

Always inspect before editing, verify after.
