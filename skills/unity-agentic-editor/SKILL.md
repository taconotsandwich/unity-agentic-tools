---
name: unity-agentic-editor
description: "Unity Editor bridge skill. Source of truth for every Unity Agentic Tools operation that requires a reachable live editor bridge, including the `editor` command group and `UnityAgenticTools.Create.*` / `UnityAgenticTools.Update.*` scene/prefab mutations."
allowed-tools:
  - "Bash(unity-agentic-tools editor *)"
argument-hint: "<subcommand and args>"
---

# Unity Agentic Editor

Use this skill for any Unity Agentic Tools operation that requires a reachable live editor bridge.

## Rules

- Use bridge commands only through CLI.
- Most editor behaviors route through `editor invoke` and static APIs under `UnityAgenticTools.Create.*`, `UnityAgenticTools.Update.*`, and `UnityAgenticTools.Util.*`.
- Use `UnityAgenticTools.Create.*` and `UnityAgenticTools.Update.*` here for scene/prefab mutations because they require the live editor bridge.
- Before UI interactions, run snapshots to obtain current refs:
  - `editor invoke UnityAgenticTools.Util.Hierarchy Snapshot` -> `@hN`
  - `editor invoke UnityAgenticTools.Util.UI Snapshot` -> `@uN`
- Re-snapshot after scene changes, play mode changes, or domain reload.

## Usage index

- `editor status`
- `editor invoke <type> <member> [args...]`
- `editor console-follow`
- `editor install`
- `editor uninstall`
- `editor list`
- `editor invoke UnityAgenticTools.Create.* ...`
- `editor invoke UnityAgenticTools.Update.* ...`

Base options on editor group:
- `-p, --project <path>`
- `--timeout <ms>`
- `--port <n>`

See `reference/commands-editor.md` for detailed usage, `UnityAgenticTools.Create.*` / `UnityAgenticTools.Update.*` targeting rules, and examples.
