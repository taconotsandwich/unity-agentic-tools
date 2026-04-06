---
name: unity-agentic-editor
description: "Unity Editor bridge commands. Authoritative usage for live editor status, invoke API calls, console streaming, snapshots, UI actions, input simulation, screenshots, waits, and package install/uninstall."
allowed-tools:
  - "Bash(unity-agentic-tools editor *)"
argument-hint: "<subcommand and args>"
---

# Unity Agentic Editor

Use this skill for all `unity-agentic-tools editor ...` commands.

## Rules

- Use bridge commands only through CLI.
- Before UI interactions, run snapshots to obtain current refs:
  - `editor hierarchy-snapshot` -> `@hN`
  - `editor ui-snapshot` -> `@uN`
- Re-snapshot after scene changes, play mode changes, or domain reload.

## Usage index

- `editor status`
- `editor invoke <type> <member> [args...]`
- `editor console-follow`
- `editor install`
- `editor uninstall`
- `editor list`

Base options on editor group:
- `-p, --project <path>`
- `--timeout <ms>`
- `--port <n>`

See `reference/commands-editor.md` for detailed usage and examples.
