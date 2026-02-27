---
name: unity-agentic-tools
description: "Unity project tools for reading, creating, editing, and deleting GameObjects, components, scenes, prefabs, materials, animations, build settings, and project configuration in Unity YAML files (.unity, .prefab, .asset, .mat, .anim, .controller). Also provides live Unity Editor control: play mode, UI interaction, input simulation, screenshots, test running, and console access. Use when working with Unity projects or controlling a running Unity Editor. Can read C# scripts but cannot author them."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<read|create|update|delete|editor|search|grep|...>"
---

# Unity Agentic Tools

CLI: `unity-agentic-tools <command>` -- 125 commands across 4 CRUD groups, live editor bridge, and top-level utilities.

Run `unity-agentic-tools setup -p <project>` before first use. Run `unity-agentic-tools status` to check readiness.

## Core workflow: inspect before edit

1. **Read** the target to find object names and fileIDs
2. **Mutate** with the appropriate create/update/delete command
3. **Verify** by re-reading the target

Use `--properties` only when component values are needed -- omit it for structure-only output (saves tokens). Use `--summary` on large scenes. Use batch commands (`update batch`, `update batch-components`) for multiple edits in one operation.

## Command groups

**read** (21 commands) -- Scene hierarchy, GameObjects, components, assets, materials, animations, dependencies, settings, build config, prefab overrides, scripts, logs, meta files, manifests, input actions.
See `reference/commands-read.md`

**create** (14 commands) -- GameObjects, scenes, prefab variants, ScriptableObjects, components, materials, build entries, packages, input actions, animations, animators, prefabs.
See `reference/commands-create.md`

**update** (28 commands) -- Properties, transforms, settings, tags, layers, sorting layers, parent hierarchy, build settings, arrays, batch edits, materials, meta, animations, animators, sibling index, input actions, animation curves, animator states, plus 7 prefab subcommands (unpack, override, remove-override, remove-component, restore-component, remove-gameobject, restore-gameobject).
See `reference/commands-update.md`

**delete** (5 commands) -- GameObjects, components, build entries, prefab instances, packages.
See `reference/commands-delete.md`

**utilities** (8 commands) -- search, grep, clone, version, docs, setup, cleanup, status. Also: setting aliases for `read settings`/`update settings`.
See `reference/commands-utilities.md`

**editor** (49 commands) -- Live Unity Editor integration via WebSocket bridge.
See `reference/commands-editor.md`

## Editor bridge essentials

Install: `editor install <project>` -- adds UPM package to Unity project.

**Snapshot-then-interact pattern**: Run `hierarchy-snapshot` or `ui-snapshot` to register compact refs (`@hN` for hierarchy, `@uN` for UI elements). Then use refs in `get`, `ui-click`, `ui-fill`, `ui-toggle`, `ui-slider`, `ui-select`, `ui-scroll`, `input-key/mouse/touch/action`, and other commands.

Refs invalidate on: scene change, play mode transition, domain reload. Re-snapshot to refresh.

Input simulation (`input-key`, `input-mouse`, `input-touch`, `input-action`) requires the Input System package. Legacy Input is read-only.

UI walking covers both uGUI (Canvas/Selectable) and UI Toolkit (UIDocument/VisualElement), including TMP variants.

## Common patterns

- `-c <type>` on `read gameobject` filters to specific component types
- `search <project> -n "pattern"` for cross-file GameObject search
- `grep <project> "regex"` for raw text search across project files
- `docs <query>` searches indexed Unity documentation
- GUID cache (`.unity-agentic/`) maps script GUIDs to file paths -- run `setup` to create

See `reference/workflows.md` for multi-step checklists (project setup, inspect-edit-verify, prefab editing, UI testing, batch editing).

## Troubleshooting

- **"command not found"**: Install via `npm install -g unity-agentic-tools` or link locally with `cd unity-agentic-tools && npm link`
- **Native module errors**: Run `unity-agentic-tools status` to check. Rebuild with `bun run build:rust` if needed
- **Editor bridge won't connect**: Ensure Unity is open with the project, check `editor status`, re-run `editor install <project>` if needed
- **`read prefab`**: Does not exist. Use `read scene` -- it handles both `.unity` and `.prefab` files
- **`editor log`**: Does not exist. Use `editor console-logs` (live bridge) or `read log` (disk file)
- **`create gameobject` name**: Pass as positional arg (`create gameobject file.unity Foo`) or `--name Foo`
- **`get text/value @hN`**: `@hN` is a hierarchy ref. Use `@uN` (from `ui-snapshot`) for text/value queries. Use `get position`, `get active`, or `get component` for hierarchy refs
- **`scene-open` fails**: Use Assets-relative path (e.g., `Assets/Scenes/Main.unity`). Run `editor refresh` first for newly created scenes
