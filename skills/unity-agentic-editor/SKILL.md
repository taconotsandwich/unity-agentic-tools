---
name: unity-agentic-editor
description: "Unity Editor bridge skill. Source of truth for live Unity workflows through the top-level `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status` commands."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<bridge command and args>"
---

# Unity Agentic Editor

Use this skill for any Unity Agentic Tools operation that requires a reachable live editor bridge.

## Rules

- Use bridge behavior through the top-level CLI: `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.
- Prefer broad aliases such as `create.gameobject`, `update.transform`, `query.scene`, `ui.snapshot`, and `tests.run`.
- Use raw public static C# targets only when no alias or `[AgenticCommand]` wrapper exists.
- Do not add a new CLI command for each Unity operation; expose project-specific editor behavior with `[AgenticCommand]`.
- Before UI interactions, run snapshots to obtain current refs:
  - `run scene.hierarchy` -> `@hN`
  - `run ui.snapshot` -> `@uN`
- Re-snapshot after scene changes, play mode changes, or domain reload.

## Usage Index

```bash
unity-agentic-tools status -p <project>
unity-agentic-tools install -p <project>
unity-agentic-tools list <query> -p <project>
unity-agentic-tools run <target> [args...] -p <project>
unity-agentic-tools stream console -p <project>
unity-agentic-tools uninstall -p <project>
unity-agentic-tools cleanup -p <project>
```

Useful aliases:

- `project.refresh`
- `scene.open`, `scene.save`, `scene.hierarchy`, `scene.query`
- `query.assets`, `query.asset`, `query.scene`, `query.object`
- `create.*`
- `update.*`
- `delete.*`
- `play.*`
- `ui.*`
- `input.*`
- `screenshot.*`
- `tests.*`

Common options:

- `-p, --project <path>`
- `--timeout <ms>`
- `--port <n>`
- `--args <json>` on `run`
- `--set <value>` on `run`
- `--duration <ms>` on `stream`

See `reference/commands-editor.md` for detailed usage, targeting rules, and examples.
