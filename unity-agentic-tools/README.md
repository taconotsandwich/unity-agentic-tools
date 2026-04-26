# unity-agentic-tools

Compact Unity Editor command runner for AI agents.

## Quick Start

```bash
npm install -g unity-agentic-tools
unity-agentic-tools install -p /path/to/UnityProject
unity-agentic-tools status -p /path/to/UnityProject
unity-agentic-tools list create -p /path/to/UnityProject
unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p /path/to/UnityProject
unity-agentic-tools stream console -p /path/to/UnityProject
unity-agentic-tools cleanup -p /path/to/UnityProject
```

## Command Surface

The CLI intentionally exposes seven broad commands:

| Command | Purpose |
|---------|---------|
| `list [query]` | Discover built-in aliases, attributed project commands, and optional raw static APIs |
| `run <target> [args...]` | Execute a command alias or raw public static C# method/property through the Unity bridge |
| `stream [topic]` | Watch real-time bridge events over WebSocket |
| `install` | Install the Unity bridge package |
| `uninstall` | Remove the Unity bridge package |
| `cleanup` | Remove stale bridge state or rebuildable `.unity-agentic` caches |
| `status` | Check command runner and bridge reachability |

There are no hidden file/CRUD commands.

## Examples

```bash
unity-agentic-tools list scene -p <project>
unity-agentic-tools run project.refresh -p <project>
unity-agentic-tools run scene.open Assets/Scenes/Main.unity false -p <project>
unity-agentic-tools run create.gameobject Assets/Scenes/Main.unity EnemyRoot Gameplay -p <project>
unity-agentic-tools run update.transform Assets/Scenes/Main.unity Player 1,2,3 0,90,0 1,1,1 -p <project>
unity-agentic-tools run delete.component Assets/Scenes/Main.unity Player BoxCollider 0 -p <project>
unity-agentic-tools stream console --type Error -p <project>
unity-agentic-tools cleanup --cache -p <project>
```

Use `--args '<json array>'` when an argument itself is structured JSON.

## Project Commands

Expose project-specific behavior by adding `[AgenticCommand]` to public static editor methods/properties:

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

Then run:

```bash
unity-agentic-tools list build -p <project>
unity-agentic-tools run build.addressables Production -p <project>
```

## Requirements

- Bun runtime
- Unity Editor bridge package installed in the target project

## License

Apache-2.0
