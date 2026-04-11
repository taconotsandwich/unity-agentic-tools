---
name: unity-agentic-tools
description: "Unity umbrella skill. Source of truth for all Unity Agentic Tools operations that do not require a reachable live editor bridge."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<non-editor command and args>"
---

# Unity Agentic Tools (Umbrella)

CLI: `unity-agentic-tools <command>`

**CRITICAL: Use the CLI for ALL Unity operations. NEVER manually read, edit, write, or grep Unity files (.unity, .prefab, .asset, .mat, .anim, .controller, .meta, ProjectSettings/) using Read, Edit, Write, or Grep tools. NEVER manually edit Unity C# scripts or Editor bridge code. The CLI handles YAML parsing, GUID preservation, and safe editing. Manual file access will break things.**

All commands accept `-j`/`--json` for structured output.

## Single source of truth routing

This umbrella skill is authoritative for operations that do not require a reachable live editor bridge:
- `read ...`
- small in-place `update ...` value edits
- `delete ...`
- top-level utilities: `search`, `grep`, `clone`, `docs`, `version`, `setup`, `cleanup`, `status`

If the operation requires a reachable live editor bridge, load `unity-agentic-editor` instead.

## Boot sequence

Run `unity-agentic-tools setup -p <project>` before first use. Run `unity-agentic-tools status` to check readiness.

1. `unity-agentic-tools --help`
2. `unity-agentic-tools status`
3. If first run: `unity-agentic-tools setup -p <project>`
4. Use this skill when the operation does not require a reachable live editor bridge. Load `unity-agentic-editor` when it does.

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

## Update commands (authoritative)

See `reference/commands-update.md` for full usage and options.

This section covers only `update` operations that do not require a reachable live editor bridge.
Top-level `update` is intentionally limited to in-place value edits such as scalar, color, reference, importer, and default-value changes.
Scene / prefab mutation moved to `unity-agentic-tools editor invoke UnityAgenticTools.Update.* ...` under `unity-agentic-editor`.

## Delete commands (authoritative)

See `reference/commands-delete.md` for full usage and options.

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
2. Choose by dependency:
   - if the operation does not require a reachable live editor bridge, use `unity-agentic-tools`
   - if the operation does require a reachable live editor bridge, use `unity-agentic-editor`
3. Re-read and verify (`read ...`)

See `reference/workflows.md` for end-to-end checklists.

`unity-agentic-editor` owns the invoke-based bridge surface: `editor status`, `editor invoke`, `editor console-follow`, `editor list`, `editor install`, `editor uninstall`.

## Troubleshooting

- **`get text/value @hN`**: `@hN` is hierarchy ref. `get text`/`get value` need UI refs (`@uN` from `ui-snapshot`). Use `get position`/`get active`/`get component` for hierarchy refs
- **Editor bridge won't connect**: Ensure Unity is open, check `editor status`, re-run `editor install` (or `editor --project <path> install`)
- **`scene-open` fails**: Use Assets-relative path (`Assets/Scenes/Main.unity`). Run `editor invoke UnityEditor.AssetDatabase Refresh` first for newly created scenes
- **Loaded edit protection error**: If editor is connected and target `.unity`/`.prefab` is currently loaded/open, pass `--bypass-loaded-protection` to force file-based edits
