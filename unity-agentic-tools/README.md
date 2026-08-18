# unity-agentic-tools

A compact command runner for AI agents and scripts that need to inspect, change, and verify a project through an already-running Unity Editor.

The CLI requires Bun 1.0 or newer. Its bridge package declares Unity 2022.3 as its minimum Editor version. The tool does not install Unity Editors or modules, manage licenses, or replace a CI build service; `install` installs only the UPM bridge into a project.

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

There are no additional top-level command groups or separate local serialized-file mutation surface. Unity operations are discovered with `list` and executed with `run`; unregistered public static C# members are available only through the explicit `--raw` escape hatch.

## Domain Reloads

Script edits and entering play mode reload Unity's domain, which takes the bridge down for seconds at a time. Recognized built-in read aliases and the `play.enter`, `play.exit`, `play.pause`, and `play.step` commands wait that window out automatically — up to 30s, and only while the Unity process is still alive — so expect a slow call rather than a failure. Project `[AgenticCommand]` targets and most raw getters use conservative command semantics unless they match a recognized built-in target. `stream` reconnects on the same budget and reports `Stream lost: ...` if it cannot.

Ordinary mutation commands are deliberately not retried across a reload: the request may already be executing on Unity's main thread, and replaying it could apply it twice. Treat `Editor invoke was interrupted by a server transition ...` as "result unknown", check the side effects, then decide whether to re-run.

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

Structured arguments go positionally in single quotes — the CLI encodes the outer JSON array itself:

```bash
unity-agentic-tools run update.batch Assets/Scenes/Main.unity '[{"gameObjectPath":"Player","propertyPath":"m_Name","value":"Hero"}]' -p <project>
```

`--args '<json array>'` sends the same payload with the escaping done by hand. Reach for it only when an argument starts with `-`, which the option parser would otherwise claim.

Run dependent commands sequentially with `--batch`. Each item is `[target, ...args]`, and execution stops at the first failure:

```bash
unity-agentic-tools run --batch '[["create.gameobject","Assets/Scenes/Main.unity","EnemyRoot","Gameplay"],["update.transform","Assets/Scenes/Main.unity","Gameplay/EnemyRoot","1,2,3"]]' -p <project>
```

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

- Bun 1.0 or newer
- Unity 2022.3 or newer
- Unity Editor bridge package installed in the target project

## License

Apache-2.0
