# Unity Agentic Tools

A compact CLI and Unity Editor bridge for inspecting and changing Unity projects through one small command runner surface: `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.

## Features

- **Small Command Surface** - Discover with `list`, execute with `run`, and watch live bridge events with `stream`.
- **Unity Script Execution** - Run built-in aliases, attributed project commands, or raw public static C# methods/properties.
- **Live Editor Bridge** - WebSocket transport to a running Unity Editor for scene, prefab, UI, play mode, screenshots, tests, and console access.
- **Project Editor Script Commands** - Add `[AgenticCommand]` to public static editor methods/properties and expose them without adding new CLI tools.
- **Built-In Unity Operations** - Create, update, delete, and query scenes, prefabs, assets, GameObjects, components, UI refs, and test results through one runner.
- **Bridge-First Mutation** - Unity project changes go through the Editor bridge; the npm package no longer ships local serialized-file mutation helpers.
- **Real-Time Console Watch** - `stream console` follows Unity logs over WebSocket, with topic and log-type filtering.
- **Reload-Tolerant Reads** - Domain reloads take the bridge down for seconds at a time. Reads and play mode transitions wait that window out while the Editor is alive, instead of failing.

## Installation

### npm

```bash
npm install -g unity-agentic-tools
```

### skills

```bash
npx skills install taconotsandwich/unity-agentic-tools
npx skills add "./skills/unity-agentic-tools" -g --copy
```

The repo ships one unified `unity-agentic-tools` skill for CLI setup, command discovery, bridge workflows, scene and prefab mutation, UI testing, screenshots, tests, logs, and troubleshooting. Run `bun run generate:agent-guidance` after changing Unity command aliases so the skill command reference stays in sync with `Registry.cs`.

### From Source

```bash
git clone --recurse-submodules https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun run setup-dev
```

`setup-dev` links the built CLI into Bun's global bin and enables the repo's git hooks. If it reports that Bun's global bin is not on `PATH`, add the printed directory before relying on `unity-agentic-tools` by name.

The `--recurse-submodules` flag matters: `test/fixtures/external` is a submodule containing a real Unity project that several tests read from. If you already cloned without it, run `git submodule update --init --recursive`.

## CLI Usage

Base usage:

```bash
unity-agentic-tools [options] <command>
```

Visible top-level commands:

| Command | Purpose |
|---------|---------|
| `list [query]` | List runnable Unity commands and project script commands |
| `run <target> [args...]` | Run a named command alias or raw public static C# method/property |
| `stream [topic]` | Stream bridge events over WebSocket |
| `install` | Install the Unity bridge package into a project |
| `uninstall` | Remove the Unity bridge package from a project |
| `cleanup` | Remove stale bridge state or rebuildable `.unity-agentic` caches |
| `status` | Report command runner and bridge reachability, and what the Editor is busy with |

### Setup

Install the bridge package into a Unity project, then open the project in Unity and wait for compilation/import to finish.

```bash
unity-agentic-tools install -p /path/to/UnityProject
unity-agentic-tools status -p /path/to/UnityProject
```

When the bridge answers, `status` also reports readiness inside `bridge`:

```json
{"runtime":"bun","version":"0.6.1","project_path":"...","bridge":{
 "port":53782,"pid":95468,"version":"0.1.0","source":"lockfile","reachable":true,
 "readiness":{"is_playing":false,"is_paused":false,"is_compiling":false,"is_updating":false,
 "is_playmode_transitioning":false,"is_reloading":false,"is_stable":true}}}
```

`reachable: true` with `is_stable: false` means the bridge is up but the Editor is busy — wait rather than reinstall.

By default, `install` writes the GitHub package URL. For local bridge package development, use `unity-agentic-tools install --local -p /path/to/UnityProject`; existing `file:` dependencies are preserved unless `--remote` is passed.

The bridge starts automatically via `[InitializeOnLoad]` and writes connection info to `.unity-agentic/editor.json`.

### Cleanup

`cleanup` is conservative by default. It removes stale bridge lock state without deleting the whole `.unity-agentic` directory.

```bash
unity-agentic-tools cleanup -p /path/to/UnityProject
unity-agentic-tools cleanup --cache -p /path/to/UnityProject
unity-agentic-tools cleanup --all -p /path/to/UnityProject
```

### Discover

```bash
unity-agentic-tools list
unity-agentic-tools list scene
unity-agentic-tools list create
unity-agentic-tools list UnityEditor.AssetDatabase --raw
```

`list` returns JSON with the command name, backing C# type/member, source, and description. Built-in aliases include `project.*`, `scene.*`, `query.*`, `create.*`, `update.*`, `delete.*`, `play.*`, `ui.*`, `input.*`, `screenshot.*`, and `tests.*`.

### Run

Run broad command aliases:

```bash
unity-agentic-tools run project.refresh
unity-agentic-tools run scene.open Assets/Scenes/Main.unity false
unity-agentic-tools run query.scene Assets/Scenes/Main.unity
unity-agentic-tools run create.gameobject Assets/Scenes/Main.unity EnemyRoot Gameplay
unity-agentic-tools run update.transform Assets/Scenes/Main.unity Player 1,2,3 0,90,0 1,1,1
unity-agentic-tools run delete.component Assets/Scenes/Main.unity Player BoxCollider 0
```

Use `--args` when an argument itself is structured JSON:

```bash
unity-agentic-tools run update.batch-components --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]'
```

Run raw public static C# APIs without adding a CLI command:

```bash
unity-agentic-tools run UnityEditor.AssetDatabase.Refresh
unity-agentic-tools run UnityEditor.EditorApplication.isCompiling
unity-agentic-tools run UnityEditor.EditorApplication.ExecuteMenuItem "File/Save"
```

Read or set static properties:

```bash
unity-agentic-tools run UnityEditor.EditorApplication.isPaused
unity-agentic-tools run UnityEditor.EditorApplication.isPaused --set true
```

### Stream

`stream` is for real-time WebSocket watch workflows. It subscribes to the Unity bridge event stream and prints JSON events as they arrive.

```bash
unity-agentic-tools stream
unity-agentic-tools stream console --type Error
unity-agentic-tools stream events --pretty
unity-agentic-tools stream playmode --duration 10000
unity-agentic-tools stream tests
```

Topics:

| Topic | Events |
|-------|--------|
| `console` | Unity log events, optionally filtered with `--type Log|Warning|Error|Assert|Exception` |
| `events` | Console, editor state, play mode, pause, and test events |
| `playmode` | Play mode and pause state changes |
| `tests` | Unity test runner events |

### Project Commands

Project editor scripts can join the same command runner with an attribute:

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
unity-agentic-tools list build
unity-agentic-tools run build.addressables Production
```

## Project Structure

```
unity-agentic-tools/     TypeScript CLI + tests
unity-package/           Unity Editor bridge C# UPM package
tools/dotnet-unity-compile/  Local .NET compile harness for the Unity package
```

## Development

Requires: Bun runtime, and — for `build:unity-package` only — a local Unity Editor install plus the .NET SDK.

```bash
bun run build                # build the TypeScript CLI
bun run build:unity-package  # compile the Unity C# package with dotnet
bun run test                 # unit tests
bun run test:integration     # CLI integration tests
bun run type-check           # tsc --noEmit
bun run check:classids       # Unity ClassID drift check (needs network)
bun run hooks                # enable the repo's git hooks
```

Two suites are opt-in and not run by CI, alongside `build:unity-package`:

- `bun run test:integration:unity` runs headless Editor validation and needs a Unity executable via `--unity-bin` or `UNITY_BIN`.
- `bun run test:integration:stress` drives play mode enter/exit cycles against an *open* Editor and reports per-call latency and failures by JSON-RPC error code. Run it when changing retry or transport behaviour in `unity-agentic-tools/src/editor-client.ts`.

```bash
bun run test:integration:stress -- --project /path/to/UnityProject --cycles 5
```

The Unity package compile script uses `UNITY_APP` when set, otherwise it discovers installed Unity Hub editors. You can also request a specific Hub version with `UNITY_EDITOR_VERSION`:

```bash
UNITY_APP=/path/to/Unity.app bun run build:unity-package
UNITY_EDITOR_VERSION=6000.4.0f1 bun run build:unity-package
```

### Testing npm package

```bash
cd unity-agentic-tools
npm publish --dry-run
```

## License

Apache-2.0
