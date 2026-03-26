---
name: unity-agentic-tools
description: "Unity project tools for reading, creating, editing, and deleting GameObjects, components, scenes, prefabs, materials, animations, build settings, and project configuration in Unity YAML files (.unity, .prefab, .asset, .mat, .anim, .controller). Also provides live Unity Editor control: play mode, UI interaction, input simulation, screenshots, test running, and console access. Use when working with Unity projects or controlling a running Unity Editor. Can read C# scripts but cannot author them."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<read|create|update|delete|editor|search|grep|...>"
---

# Unity Agentic Tools

CLI: `unity-agentic-tools <command>` -- 116 commands across 4 CRUD groups, live editor bridge, and utilities.

All commands accept `-j`/`--json` for structured output. Run `<command> --help` for full options.

Run `unity-agentic-tools setup -p <project>` before first use. Run `unity-agentic-tools status` to check readiness.

## Task routing

| I want to... | Command |
|--------------|---------|
| See what's in a scene/prefab | `read scene <file>` (handles both .unity and .prefab) |
| Find a GameObject by name | `search <file> <name>` or `search <project> -n "pattern"` |
| Read/edit component properties | `read gameobject <file> <name> --properties` then `update component` |
| Add a component to a GameObject | `create component <file> <object> <type>` |
| Edit a Material | `read material <file>` then `update material <file> --set prop=val` |
| Change project settings | `read settings <project> -s tags` then `update settings` |
| Work with prefab overrides | `read overrides` then `update prefab override` |
| Edit animations/animators | `read animation`/`read animator` then `update animation-curves`/`update animator-state` |
| Test a running Unity app | `editor play` then `ui-snapshot` then `ui-click @uN` |
| Find text across project files | `grep <project> "regex"` |
| Batch edit multiple objects | `update batch <file> '<json>'` |
| Manage build scenes | `read build` / `create build` / `update build` / `delete build` |

## Core workflow: inspect before edit

1. **Read** the target to find object names and fileIDs
2. **Mutate** with the appropriate create/update/delete command
3. **Verify** by re-reading the target

Use `--properties` only when component values are needed (saves tokens). Use `--summary` on large scenes. Use batch commands for multiple edits.

## Command groups

**read** (21) -- Scene hierarchy, GameObjects, components, assets, materials, animations, dependencies, settings, build, overrides, scripts, logs, meta, manifests, input actions. See `reference/commands-read.md`

**create** (14) -- GameObjects, scenes, prefab variants, ScriptableObjects, components, materials, builds, packages, input actions, animations, animators, prefabs. See `reference/commands-create.md`

**update** (31) -- Properties, transforms, settings, tags, layers, sorting layers, parent hierarchy, builds, arrays, batch edits, materials, meta, animations, animators, sibling index, input actions, animation curves, animator states, managed references, plus 9 prefab subcommands. See `reference/commands-update.md`

**delete** (5) -- GameObjects, components, build entries, prefab instances, packages. See `reference/commands-delete.md`

**utilities** (8) -- search, grep, clone, version, docs, setup, cleanup, status. Setting aliases for `read settings`/`update settings`. See `reference/commands-utilities.md`

**editor** (37) -- Live Unity Editor integration via WebSocket. See `reference/commands-editor.md`

## Editor bridge

Install: `editor install <project>`. All editor commands accept `--project <path>`, `--timeout <ms>`, `--port <n>`.

**Snapshot-then-interact**: Run `hierarchy-snapshot` or `ui-snapshot` to get compact refs (`@hN` for hierarchy, `@uN` for UI). Use refs in `get`, `ui-click`, `ui-fill`, `ui-toggle`, `ui-slider`, `ui-select`, `ui-scroll`, `input-*`, and other commands.

Refs invalidate on: scene change, play mode transition, domain reload. Re-snapshot to refresh.

See `reference/workflows.md` for multi-step checklists (project setup, inspect-edit-verify, prefab editing, UI testing, batch editing, animation editing).

## Troubleshooting

- **`get text/value @hN`**: `@hN` is hierarchy ref. `get text`/`get value` need UI refs (`@uN` from `ui-snapshot`). Use `get position`/`get active`/`get component` for hierarchy refs
- **Editor bridge won't connect**: Ensure Unity is open, check `editor status`, re-run `editor install <project>`
- **`scene-open` fails**: Use Assets-relative path (`Assets/Scenes/Main.unity`). Run `editor invoke UnityEditor.AssetDatabase Refresh` first for newly created scenes
