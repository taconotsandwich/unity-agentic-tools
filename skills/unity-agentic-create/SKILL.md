---
name: unity-agentic-create
description: "Unity create commands. Authoritative usage for creating GameObjects, scenes, prefabs, components, ScriptableObjects, materials, builds, packages, input actions, animations, and animators."
allowed-tools:
  - "Bash(unity-agentic-tools create *)"
argument-hint: "<subcommand and args>"
---

# Unity Agentic Create

Use this skill for all `unity-agentic-tools create ...` commands.

## Rules

- Use CLI only. Do not manually edit Unity YAML files.
- Read before write when target context matters:
  - `read scene <file>` or `read gameobject <file> <object>` before creating into existing files.
- Re-read after mutation to verify.
- When editor bridge is connected and target `.unity`/`.prefab` is loaded/open, pass `--bypass-loaded-protection`.

## Usage index

- `create gameobject <file> [name]`
- `create scene <output_path>`
- `create prefab-variant <source_prefab> <output_path>`
- `create prefab-instance <scene_file> <prefab_path>`
- `create scriptable-object <output_path> <script>`
- `create meta <script_path>`
- `create component <file> <object_name> <component>`
- `create component-copy <file> <source_file_id> <target_object_name>`
- `create build <scene_path>`
- `create material <output_path>`
- `create package <name> <version>`
- `create input-actions <output_path> <name>`
- `create animation <output_path> [name]`
- `create animator <output_path> [name]`
- `create prefab <output_path> [name]`

See `reference/commands-create.md` for full options, defaults, and examples.
