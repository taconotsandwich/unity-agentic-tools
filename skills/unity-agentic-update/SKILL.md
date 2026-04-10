---
name: unity-agentic-update
description: "Unity update commands. Authoritative usage for editing properties, transforms, settings, arrays, batch operations, materials, meta, animation, animator, input actions, managed references, and prefab overrides."
allowed-tools:
  - "Bash(unity-agentic-tools update *)"
argument-hint: "<subcommand and args>"
---

# Unity Agentic Update

Use this skill for all `unity-agentic-tools update ...` commands.

## Rules

- Use CLI only. Do not manually edit Unity YAML files.
- Always inspect first (`read ...`) to collect fileIDs, property paths, and current values.
- Re-read to verify after each mutation.
- When editor bridge is connected and target `.unity`/`.prefab` is loaded/open, pass `--bypass-loaded-protection`.

## Usage index

- `update gameobject <file> <object_name> <property> <value>`
- `update component <file> <file_id> <property> <value>`
- `update transform <file> <identifier>`
- `update scriptable-object <file> <property> <value>`
- `update settings`
- `update tag <action> <tag>`
- `update layer <index> <name>`
- `update sorting-layer <action> <name>`
- `update parent <file> <object_name> <new_parent>`
- `update build <scene_path>`
- `update array <file> <file_id> <array_property> <action> [args...]`
- `update batch <file> <edits_json>`
- `update batch-components <file> <edits_json>`
- `update material <file>`
- `update meta [file]`
- `update animation <file>`
- `update animation-curves <file>`
- `update animator <file>`
- `update animator-state <file>`
- `update sibling-index <file> <object_name> <index>`
- `update input-actions <file>`
- `update managed-reference <file> <component_id> <field_path> <type_name>`
- `update prefab ...` (9 subcommands)

See `reference/commands-update.md` for full options, formats, defaults, and examples.
