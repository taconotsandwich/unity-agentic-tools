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

## Installation

### npm

```bash
npm install -g unity-agentic-tools
```

### skills

```bash
npx skills install taconotsandwich/unity-agentic-tools
npx skills add "." --all -g --copy
```

Skill split:

- `unity-agentic-tools` -> primary CLI runner workflows
- `unity-agentic-editor` -> bridge-dependent `run`, `list`, `stream`, `install`, `uninstall`, and live Unity workflows

Recommended install flow:

```bash
npx skills add "./skills/unity-agentic-tools" -g --copy
npx skills add "./skills/unity-agentic-editor" -g --copy
```

### From Source

```bash
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun install
bun run build:rust
bun run build
bun run build:unity-package
```

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
| `status` | Report command runner and bridge reachability |

### Setup

Install the bridge package into a Unity project, then open the project in Unity and wait for compilation/import to finish.

```bash
unity-agentic-tools install -p /path/to/UnityProject
unity-agentic-tools status -p /path/to/UnityProject
```

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
rust-core/               Native Rust module package
doc-indexer/             Documentation indexing module
unity-package/           Unity Editor bridge C# UPM package
tools/dotnet-unity-compile/  Local .NET compile harness for the Unity package
```

## Development

Requires: Rust toolchain, Bun runtime, and a local Unity Editor install for `build:unity-package`.

```bash
bun run build:rust           # rebuild Rust native module
bun run build                # build TypeScript workspaces
bun run build:unity-package  # compile the Unity C# package with dotnet
bun run test                 # unit tests
bun run test:integration     # CLI integration tests
bun run type-check           # tsc --noEmit
```

The Unity package compile harness defaults to `/Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app`. Override with MSBuild properties when needed:

```bash
dotnet build tools/dotnet-unity-compile/UnityAgenticTools.UnityPackage.csproj -p:UnityApp=/path/to/Unity.app
```

### Testing npm package

```bash
cd unity-agentic-tools
mkdir -p native
cp ../rust-core/index.js ../rust-core/index.d.ts ../rust-core/*.node native/
npm publish --dry-run
rm -rf native
```

## License

Apache-2.0
