---
name: unity-agentic-tools
description: "Unity project tools for reading, creating, editing, and deleting GameObjects, components, scenes, prefabs, materials, animations, build settings, and project configuration in Unity YAML files (.unity, .prefab, .asset, .mat, .anim, .controller). Also provides live Unity Editor control: play mode, UI interaction, input simulation, screenshots, test running, and console access. Can read C# scripts but cannot author them. TRIGGER when: user mentions Unity, working directory contains Unity files (.unity, .prefab, .asset, .mat, .anim, .controller, .meta, ProjectSettings/), user asks about GameObjects, scenes, prefabs, components, materials, animations, or any Unity Editor interaction. Always load this skill before attempting Unity-related tasks."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<read|create|update|delete|editor|search|grep|...>"
---

# Unity Agentic Tools

CLI: `unity-agentic-tools <command>` -- 117 commands across 4 CRUD groups, live editor bridge, and utilities.

**CRITICAL: Use the CLI for ALL Unity operations. NEVER manually read, edit, write, or grep Unity files (.unity, .prefab, .asset, .mat, .anim, .controller, .meta, ProjectSettings/) using Read, Edit, Write, or Grep tools. NEVER manually edit Unity C# scripts or Editor bridge code. The CLI handles YAML parsing, GUID preservation, and safe editing. Manual file access will break things.**

All commands accept `-j`/`--json` for structured output.

**IMPORTANT: After loading this skill, ALWAYS run `unity-agentic-tools --help` first to see available commands and match the right command to your file type. Run `unity-agentic-tools <group> --help` (e.g. `read --help`) before using a subcommand you haven't used yet.**

Run `unity-agentic-tools setup -p <project>` before first use. Run `unity-agentic-tools status` to check readiness.

## Task routing

| I want to... | Command |
|--------------|---------|
| See what's in a scene/prefab | `read scene <file>` (handles both .unity and .prefab) |
| Find a GameObject by name | `search <file> <name>` or `search <project> -n "pattern"` |
| Read/edit component properties | `read gameobject <file> <name> --properties` then `update component` |
| Add a component to a GameObject | `create component <file> <object> <type>` |
| Edit a Material | `read material <file>` then `update material <file> --set prop=val` |
| Change project settings | `read settings -s tags` then `update settings` |
| Work with prefab overrides | `read overrides` then `update prefab override` |
| Edit animations/animators | `read animation`/`read animator` then `update animation-curves`/`update animator-state` |
| Test a running Unity app | `editor invoke UnityAgenticTools.API.PlayModeAPI Enter` then `editor invoke UnityAgenticTools.API.UIAPI Snapshot` then `editor invoke UnityAgenticTools.API.UIAPI Interact "[\"@uN\",\"click\"]"` |
| Find text across project files | `grep "regex"` |
| Batch edit multiple objects | `update batch <file> '<json>'` |
| Manage build scenes | `read build` / `create build` / `update build` / `delete build` |

## Core workflow: inspect before edit

1. **Read** the target to find object names and fileIDs
2. **Mutate** with the appropriate create/update/delete command
3. **Verify** by re-reading the target

Use `--properties` only when component values are needed (saves tokens). Use `--summary` on large scenes. Use batch commands for multiple edits.

## Command groups

**read** (21) -- Scene hierarchy, GameObjects, components, assets, materials, animations, dependencies, settings, build, overrides, scripts, logs, meta, manifests, input actions. See `reference/commands-read.md`

**create** (15) -- GameObjects, scenes, prefab variants, prefab instances, ScriptableObjects, components, materials, builds, packages, input actions, animations, animators, prefabs. See `reference/commands-create.md`

**update** (31) -- Properties, transforms, settings, tags, layers, sorting layers, parent hierarchy, builds, arrays, batch edits, materials, meta, animations, animators, sibling index, input actions, animation curves, animator states, managed references, plus 9 prefab subcommands. See `reference/commands-update.md`

**delete** (6) -- GameObjects, components, build entries, prefab instances, asset files (+ .meta), packages. See `reference/commands-delete.md`

**utilities** (8) -- search, grep, clone, version, docs, setup, cleanup, status. Setting aliases for `read settings`/`update settings`. See `reference/commands-utilities.md`

**editor** (6) -- Live Unity Editor integration via WebSocket using invoke/list/status model. See `reference/commands-editor.md`

## Editor bridge

Install: `editor install` (defaults to cwd project, or use `--project <path>`). All editor commands accept `--project <path>`, `--timeout <ms>`, `--port <n>`.

**Snapshot-then-interact**: Run `editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot` or `editor invoke UnityAgenticTools.API.UIAPI Snapshot` to get compact refs (`@hN` for hierarchy, `@uN` for UI). Use refs in `HierarchyAPI.Query`, `UIAPI.Query`, and `UIAPI.Interact`.

Refs invalidate on: scene change, play mode transition, domain reload. Re-snapshot to refresh.

See `reference/workflows.md` for multi-step checklists (project setup, inspect-edit-verify, prefab editing, UI testing, batch editing, animation editing).

## Troubleshooting

- **Invalid `@hN`/`@uN` refs**: refs are snapshot-scoped. Re-run `editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot` or `editor invoke UnityAgenticTools.API.UIAPI Snapshot` after scene/play-mode changes.
- **Editor bridge won't connect**: Ensure Unity is open, check `editor status`, re-run `editor install` (or `editor --project <path> install`)
- **`SceneAPI.Open` fails**: use Assets-relative path (`Assets/Scenes/Main.unity`). Run `editor invoke UnityEditor.AssetDatabase Refresh` first for newly created scenes.
- **Loaded edit protection error**: If editor is connected and target `.unity`/`.prefab` is currently loaded/open, pass `--bypass-loaded-protection` to force file-based edits
