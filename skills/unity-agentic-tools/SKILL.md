---
name: unity-agentic-tools
description: "Use for Unity project automation via the unity-agentic-tools CLI and live Editor bridge: discover and run Unity commands (list/run/stream), install or troubleshoot the bridge, create/update/delete GameObjects, components, scenes, prefabs, and assets, query hierarchies and UI, run Play Mode tests, capture screenshots, and read console logs. Triggers: Unity Editor automation, scene or prefab edits, 'run Unity tests', 'check the Unity console', 'screenshot the game view'. Not for writing C# gameplay scripts or shaders; not for raw edits to .unity/.prefab/.asset YAML unless the user explicitly asks for raw file work."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<command and args>"
---

# Unity Agentic Tools

Use this skill for Unity Agentic Tools CLI setup, command discovery, command execution, live Editor bridge workflows, and high-level project automation.

**CRITICAL: Use the CLI command runner for Unity operations. Do not manually mutate Unity serialized files (`.unity`, `.prefab`, `.asset`, `.mat`, `.anim`, `.controller`, `.meta`, `ProjectSettings/`) unless the user explicitly asks for raw file work.**

## Command Surface

| Command | What it does |
|---------|-------------|
| `list [query]` | Discover built-in aliases, attributed project commands, and optional raw static APIs. `--brief` omits per-argument detail; `--raw` adds raw statics |
| `run <target> [args...]` | Execute a command alias or raw public static C# method/property through the Unity bridge |
| `stream [topic]` | Watch real-time bridge events over WebSocket |
| `install` | Install the Unity bridge package |
| `uninstall` | Remove the Unity bridge package |
| `cleanup` | Remove stale bridge state or rebuildable `.unity-agentic` caches |
| `status` | Check command runner and bridge reachability |

Commands emit compact single-line JSON by default; pass `--pretty` for indented output. Prefer `list <query> --brief` for discovery.

By default, `install` writes the GitHub package URL. For local bridge package development, use `install --local [path]`; existing `file:` dependencies are preserved unless `install --remote` is passed.

## Default Route

1. `unity-agentic-tools status -p <project>`
2. `unity-agentic-tools list <query> --brief -p <project>`
3. Inspect current state with `query.*`, `scene.hierarchy`, `ui.snapshot`, or screenshots.
4. `unity-agentic-tools run <target> ... -p <project>`
5. Verify with the matching query, snapshot, screenshot, tests, or console stream.

## Examples

```bash
unity-agentic-tools list scene --brief -p <project>
unity-agentic-tools run project.refresh -p <project>
unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>
unity-agentic-tools run create.gameobject Assets/Scenes/Main.unity EnemyRoot Gameplay -p <project>
unity-agentic-tools run update.transform Assets/Scenes/Main.unity Player 1,2,3 0,90,0 1,1,1 -p <project>
unity-agentic-tools stream console --type Error -p <project>
unity-agentic-tools cleanup --cache -p <project>
```

Use `--args '<json array>'` when one argument is structured JSON — see `reference/troubleshooting.md` "JSON Args" for the exact quoting pattern.

Raw public static APIs can be called directly when no alias or `[AgenticCommand]` wrapper exists.

```bash
unity-agentic-tools run UnityEditor.AssetDatabase.Refresh -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.ExecuteMenuItem "File/Save" -p <project>
```

## Project Commands

Do not add a new CLI command for each Unity operation. Expose project-specific behavior by adding `[AgenticCommand]` to public static methods/properties in Unity Editor C#:

```csharp
using UnityAgenticTools.Commands;

public static class BuildCommands
{
    [AgenticCommand("build.addressables", "Build Addressables content.")]
    public static object BuildAddressables(string profile)
    {
        return new { success = true, profile };
    }
}
```

Then use:

```bash
unity-agentic-tools list build --brief -p <project>
unity-agentic-tools run build.addressables Production -p <project>
```

## References

- `reference/live-editor-workflows.md`: live Editor setup, mutation, UI, and batch workflows
- `reference/command-reference.md`: generated alias reference with arg hints (`<required>` `[optional]`)
- `reference/troubleshooting.md`: bridge, timeouts, refs, JSON args, and verification

## Troubleshooting

Full detail lives in `reference/troubleshooting.md`. Quick pointers:

- **Bridge won't connect**: see "Bridge Not Reachable" (install, open Unity, wait for compile, status, cleanup).
- **Long builds time out**: `run` defaults to 60s; see "Long-running Commands" (`--timeout 1200000`, `--no-wait`).
- **Stale `@hN`/`@uN` refs**: re-run `scene.hierarchy` or `ui.snapshot`; see "Stale Refs".
- **Need console logs**: `unity-agentic-tools stream console --duration 5000 -p <project>`.
- **Need raw APIs**: `unity-agentic-tools list <type-or-namespace> --raw -p <project>`.
