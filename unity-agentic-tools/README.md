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

By default, `install` writes the GitHub package URL. For local bridge package development, use `unity-agentic-tools install --local [path]`; existing `file:` dependencies are preserved unless `unity-agentic-tools install --remote` is passed.

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
| `status` | Check command runner and bridge reachability, and what the Editor is busy with |

There are no hidden local serialized-file mutation commands or editor APIs.

## Domain Reloads

Script edits and entering play mode reload Unity's domain, which takes the bridge down for seconds at a time. Read commands and `play.enter`/`play.exit` wait that window out automatically — up to 30s, and only while the Unity process is still alive — so expect a slow call rather than a failure. `stream` reconnects on the same budget and reports `Stream lost: ...` if it cannot.

Mutating commands are deliberately not retried across a reload: the request may already be executing on Unity's main thread, and replaying it could apply it twice. Treat `Editor invoke was interrupted by a server transition ...` as "result unknown", check the side effects, then decide whether to re-run.

`play.enter` and `play.exit` report the state at the moment they return, not the requested one — `requested` names the intent, `state` and `isPlaying` are queried live. Gate on `play.state`.

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
