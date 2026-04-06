---
name: unity-agentic-delete
description: "Unity delete commands. Authoritative usage for deleting GameObjects, components, build entries, prefab instances, assets, and packages."
allowed-tools:
  - "Bash(unity-agentic-tools delete *)"
argument-hint: "<subcommand and args>"
---

# Unity Agentic Delete

Use this skill for all `unity-agentic-tools delete ...` commands.

## Rules

- Use CLI only. Do not manually edit Unity YAML files.
- Inspect target first (`read ...`) to avoid deleting the wrong object/component.
- Re-read after delete to verify result.
- When editor bridge is connected and target `.unity`/`.prefab` is loaded/open, pass `--bypass-loaded-protection`.

## Usage index

- `delete gameobject <file> <object_name>`
- `delete component <file_or_project> <component>`
- `delete build <scene_path>`
- `delete prefab <file> <prefab_instance>`
- `delete asset <file>`
- `delete package <name>`

See `reference/commands-delete.md` for full options, modes, and examples.
