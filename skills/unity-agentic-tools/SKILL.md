---
name: unity-agentic-tools
description: "Unity Agentic Tools umbrella skill. Source of truth for the compact top-level CLI command runner."
allowed-tools:
  - "Bash(unity-agentic-tools *)"
argument-hint: "<command and args>"
---

# Unity Agentic Tools

CLI: `unity-agentic-tools <command>`

**CRITICAL: Use the CLI command runner for Unity operations. Do not manually mutate Unity serialized files (`.unity`, `.prefab`, `.asset`, `.mat`, `.anim`, `.controller`, `.meta`, `ProjectSettings/`) unless the user explicitly asks for raw file work.**

The public command surface is intentionally small:

| Command | What it does |
|---------|-------------|
| `list [query]` | Discover built-in aliases, attributed project commands, and optional raw static APIs |
| `run <target> [args...]` | Execute a command alias or raw public static C# method/property through the Unity bridge |
| `stream [topic]` | Watch real-time bridge events over WebSocket |
| `install` | Install the Unity bridge package |
| `uninstall` | Remove the Unity bridge package |
| `cleanup` | Remove stale bridge state or rebuildable `.unity-agentic` caches |
| `status` | Check command runner and bridge reachability |

Commands emit structured JSON by default.

## Routing

1. `unity-agentic-tools status -p <project>`
2. `unity-agentic-tools list <query> -p <project>`
3. `unity-agentic-tools run <target> ... -p <project>`
4. `unity-agentic-tools stream console -p <project>` when live logs are useful

Use `unity-agentic-editor` for live editor workflows and the same top-level `run`/`list`/`stream` bridge surface.

## Common Runner Examples

```bash
unity-agentic-tools list scene -p <project>
unity-agentic-tools list create -p <project>
unity-agentic-tools run project.refresh -p <project>
unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>
unity-agentic-tools run create.gameobject Assets/Scenes/Main.unity EnemyRoot Gameplay -p <project>
unity-agentic-tools run update.transform Assets/Scenes/Main.unity Player 1,2,3 0,90,0 1,1,1 -p <project>
unity-agentic-tools stream console --type Error -p <project>
unity-agentic-tools cleanup --cache -p <project>
```

Use `--args '<json array>'` when one argument is structured JSON:

```bash
unity-agentic-tools run update.batch-components --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]' -p <project>
```

Raw public static APIs can be called directly:

```bash
unity-agentic-tools run UnityEditor.AssetDatabase.Refresh -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.isCompiling -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.ExecuteMenuItem "File/Save" -p <project>
```

## Project Script Commands

Expose project-specific behavior by adding `[AgenticCommand]` to public static methods/properties in Unity Editor C#:

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
unity-agentic-tools list build -p <project>
unity-agentic-tools run build.addressables Production -p <project>
```

## References

- `reference/workflows.md`: runner-first workflows

## Troubleshooting

- **Bridge won't connect**: Run `unity-agentic-tools install -p <project>`, open Unity, wait for compile/import, then run `unity-agentic-tools status -p <project>`.
- **Stale bridge state**: Run `unity-agentic-tools cleanup -p <project>` to clear stale lockfiles, or `cleanup --cache` for rebuildable caches.
- **Need available commands**: Run `unity-agentic-tools list <query> -p <project>`.
- **Need raw APIs**: Run `unity-agentic-tools list <type-or-namespace> --raw -p <project>`.
- **Need console logs**: Run `unity-agentic-tools stream console --duration 5000 -p <project>`.
