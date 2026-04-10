---
name: unity-agentic-tools
description: "Unity umbrella skill. Source of truth for setup, routing, read commands, and top-level utilities (search/grep/clone/docs/version/setup/cleanup/status). For mutations and editor actions, load specialized skills: unity-agentic-create, unity-agentic-update, unity-agentic-delete, unity-agentic-editor."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<read|search|grep|clone|docs|version|setup|cleanup|status>"
---

# Unity Agentic Tools (Umbrella)

CLI: `unity-agentic-tools <command>`

**CRITICAL: Use the CLI for ALL Unity operations. NEVER manually read, edit, write, or grep Unity files (.unity, .prefab, .asset, .mat, .anim, .controller, .meta, ProjectSettings/) using Read, Edit, Write, or Grep tools. NEVER manually edit Unity C# scripts or Editor bridge code. The CLI handles YAML parsing, GUID preservation, and safe editing. Manual file access will break things.**

All commands accept `-j`/`--json` for structured output.

## Single source of truth routing

This umbrella skill is authoritative for:
- setup and readiness checks
- `read` commands
- top-level utilities: `search`, `grep`, `clone`, `docs`, `version`, `setup`, `cleanup`, `status`

For other command groups, load the dedicated skill:
- `create ...` -> `unity-agentic-create`
- `update ...` -> `unity-agentic-update`
- `delete ...` -> `unity-agentic-delete`
- `editor ...` -> `unity-agentic-editor`

Do not use this file as fallback documentation for create/update/delete/editor details.

## Boot sequence

Run `unity-agentic-tools setup -p <project>` before first use. Run `unity-agentic-tools status` to check readiness.

1. `unity-agentic-tools --help`
2. `unity-agentic-tools status`
3. If first run: `unity-agentic-tools setup -p <project>`
4. Load the specialized skill for the command group you need.

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

## Read commands (authoritative)

See `reference/commands-read.md` for full usage and options.

Core usage:

| Command | What it does |
|---------|-------------|
| `read scene <file>` | Hierarchy view for `.unity` / `.prefab` |
| `read gameobject <file> <object_id>` | One object, optional component filter |
| `read component <file> <file_id>` | One component by fileID |
| `read asset <file>` | Generic Unity YAML asset read |
| `read material <file>` | Material summary/properties |
| `read dependencies <file>` | Outbound GUID dependencies |
| `read dependents <guid>` | Reverse dependency lookup |
| `read settings` | Project settings by alias/name |
| `read build` / `read scenes` | Build settings scene list |
| `read overrides <file> <prefab_instance>` | Prefab overrides |
| `read script <file>` / `read scripts` | Type extraction + registry search |
| `read meta <file>` | Importer settings |
| `read animation <file>` / `read animator <file>` | Animation/Animator inspection |
| `read manifest` | Package manifest inspection |
| `read input-actions <file>` | InputActions inspection |

## Utilities (authoritative)

See `reference/commands-utilities.md` for full usage and options.

| Command | What it does |
|---------|-------------|
| `search <path> [pattern]` | GameObject search in file or project |
| `grep <pattern>` | Regex search across project files |
| `clone <file> <object_name>` | Duplicate GameObject hierarchy |
| `docs <query>` | Search indexed Unity docs |
| `version` | Read Unity version |
| `setup` | Initialize `.unity-agentic` state |
| `cleanup` | Remove `.unity-agentic` state |
| `status` | Health and configuration report |

## Workflow rule

Inspect before mutate:
1. Read target state (`read ...`)
2. Load specialized mutation skill (`create`/`update`/`delete`)
3. Re-read and verify (`read ...`)

See `reference/workflows.md` for end-to-end checklists.

For editor workflows, load `unity-agentic-editor`.
Use the invoke-based bridge surface there: `editor status`, `editor invoke`, `editor console-follow`, `editor list`, `editor install`, `editor uninstall`.

## Troubleshooting

- **Invalid `@hN`/`@uN` refs**: refs are snapshot-scoped. Re-run `editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot` or `editor invoke UnityAgenticTools.API.UIAPI Snapshot` after scene/play-mode changes.
- **Editor bridge won't connect**: Ensure Unity is open, check `editor status`, re-run `editor install` (or `editor --project <path> install`)
- **`SceneAPI.Open` fails**: use Assets-relative path (`Assets/Scenes/Main.unity`). Run `editor invoke UnityEditor.AssetDatabase Refresh` first for newly created scenes.
- **Loaded edit protection error**: If editor is connected and target `.unity`/`.prefab` is currently loaded/open, pass `--bypass-loaded-protection` to force file-based edits
