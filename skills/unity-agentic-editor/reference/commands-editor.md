# Unity bridge command reference

Authoritative reference for live Unity workflows through the compact top-level CLI.

## Base usage

```bash
unity-agentic-tools <command> [options]
```

Bridge-related commands:

| Command | Purpose |
|---------|---------|
| `status` | Report command runner and bridge reachability |
| `install` | Install the bridge package into a Unity project |
| `uninstall` | Remove the bridge package from a Unity project |
| `cleanup` | Remove stale bridge state or rebuildable `.unity-agentic` caches |
| `list [query]` | List built-in aliases, attributed project commands, and optional raw APIs |
| `run <target> [args...]` | Execute a command alias or raw public static C# method/property |
| `stream [topic]` | Stream real-time bridge events |

Common options:

- `-p, --project <path>`: Unity project path (default cwd)
- `--timeout <ms>`: RPC/WebSocket timeout
- `--port <n>`: Override bridge port

## Required setup

1. `unity-agentic-tools install -p <project>`
2. Open the project in Unity and wait for compile/import
3. `unity-agentic-tools status -p <project>`
4. `unity-agentic-tools list -p <project>`

## `list [query]`

Options:

- `--raw`: include raw public static methods/properties for matching types

Examples:

```bash
unity-agentic-tools list -p <project>
unity-agentic-tools list create -p <project>
unity-agentic-tools list UnityEditor.AssetDatabase --raw -p <project>
```

Built-in alias groups:

- `project.*`
- `scene.*`
- `query.*`
- `create.*`
- `update.*`
- `delete.*`
- `play.*`
- `ui.*`
- `input.*`
- `screenshot.*`
- `tests.*`

## `run <target> [args...]`

Options:

- `--args <json>`: JSON array of command arguments; use this when an argument itself is structured JSON
- `--set <value>`: set a writable static property
- `--no-wait`: return immediately

Examples:

```bash
unity-agentic-tools run project.refresh -p <project>
unity-agentic-tools run UnityEditor.AssetDatabase.Refresh -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.isCompiling -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.ExecuteMenuItem "File/Save" -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.isPaused --set true -p <project>
```

## `stream [topic]`

Topics:

| Topic | Events |
|-------|--------|
| `console` | Unity log events |
| `events` | Console, editor, play mode, pause, and test events |
| `playmode` | Play mode and pause state changes |
| `tests` | Unity test runner events |

Options:

- `-t, --type <type>`: console log type filter, one of `Log`, `Warning`, `Error`, `Assert`, `Exception`
- `--duration <ms>`: auto-stop after duration (`0` means unlimited)
- `--pretty`: pretty-print JSON events

Examples:

```bash
unity-agentic-tools stream console -p <project>
unity-agentic-tools stream console --type Error --duration 5000 -p <project>
unity-agentic-tools stream events --pretty -p <project>
unity-agentic-tools stream playmode -p <project>
unity-agentic-tools stream tests -p <project>
```

## Ref and Snapshot Guidance

For interactive UI and hierarchy workflows, use built-in aliases:

```bash
unity-agentic-tools run scene.hierarchy -p <project>
unity-agentic-tools run ui.snapshot -p <project>
```

Snapshot-first pattern:

- `run scene.hierarchy` returns hierarchy refs such as `@hN`
- `run ui.snapshot` returns UI refs such as `@uN`

Then query or interact:

```bash
unity-agentic-tools run scene.query @h1 active -p <project>
unity-agentic-tools run ui.query @u1 text -p <project>
unity-agentic-tools run ui.interact @u1 click -p <project>
```

Re-snapshot after scene changes, play mode changes, or domain reload.

## Create Commands

Use command aliases instead of raw `UnityAgenticTools.Create.*` invocations when possible.

| Alias | Backing API |
|-------|-------------|
| `create.scene` | `UnityAgenticTools.Create.Scenes.Scene` |
| `create.gameobject` | `UnityAgenticTools.Create.Scenes.GameObject` |
| `create.component` | `UnityAgenticTools.Create.Scenes.Component` |
| `create.component-copy` | `UnityAgenticTools.Create.Scenes.ComponentCopy` |
| `create.prefab` | `UnityAgenticTools.Create.Prefabs.Prefab` |
| `create.prefab-instance` | `UnityAgenticTools.Create.Prefabs.PrefabInstance` |
| `create.prefab-variant` | `UnityAgenticTools.Create.Prefabs.PrefabVariant` |
| `create.scriptable-object` | `UnityAgenticTools.Create.Assets.ScriptableObject` |
| `create.meta` | `UnityAgenticTools.Create.Assets.Meta` |
| `create.material` | `UnityAgenticTools.Create.Assets.Material` |
| `create.input-actions` | `UnityAgenticTools.Create.Assets.InputActions` |
| `create.animation` | `UnityAgenticTools.Create.Assets.Animation` |
| `create.animator` | `UnityAgenticTools.Create.Assets.Animator` |
| `project.build.add` | `UnityAgenticTools.Create.Project.Build` |
| `project.package.add` | `UnityAgenticTools.Create.Project.Package` |

Examples:

```bash
unity-agentic-tools run create.scene Assets/Scenes/NewLevel.unity false -p <project>
unity-agentic-tools run create.gameobject Assets/Scenes/Main.unity EnemyRoot Gameplay -p <project>
unity-agentic-tools run create.component Assets/Scenes/Main.unity EnemyRoot BoxCollider -p <project>
unity-agentic-tools run create.prefab-instance Assets/Scenes/Boot.unity Assets/Prefabs/AppRoot.prefab "" AppRoot 0 0 0 -p <project>
unity-agentic-tools run create.scriptable-object Assets/Data/Enemy.asset EnemyConfig '{"health":100}' -p <project>
```

## Update Commands

| Alias | Purpose |
|-------|---------|
| `update.object` | Update a serialized GameObject property |
| `update.component` | Update a serialized component property |
| `update.transform` | Update position, rotation, or scale |
| `update.parent` | Reparent a GameObject |
| `update.sibling-index` | Set sibling order |
| `update.array` | Edit a serialized array |
| `update.batch` | Batch-edit GameObject properties |
| `update.batch-components` | Batch-edit component properties |
| `update.managed-reference` | Set or append a managed reference |
| `update.prefab.*` | Prefab unpack, override, remove, and restore operations |

Examples:

```bash
unity-agentic-tools run update.transform Assets/Scenes/Main.unity Player 1,2,3 0,90,0 1,1,1 -p <project>
unity-agentic-tools run update.component Assets/Scenes/Main.unity Player Camera 0 m_FieldOfView 55 -p <project>
unity-agentic-tools run update.batch-components --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]' -p <project>
unity-agentic-tools run update.prefab.override Assets/Scenes/Boot.unity AppRoot Transform 0 m_LocalPosition.x 7 -p <project>
```

## Delete Commands

```bash
unity-agentic-tools run delete.gameobject Assets/Scenes/Main.unity EnemyRoot -p <project>
unity-agentic-tools run delete.component Assets/Scenes/Main.unity EnemyRoot BoxCollider 0 -p <project>
unity-agentic-tools run delete.asset Assets/Temp/Old.asset -p <project>
```

## Targeting Rules

- `assetPath` must be asset-relative, for example `Assets/Scenes/Main.unity` or `Assets/Prefabs/Enemy.prefab`.
- `gameObjectPath` and `parentPath` are slash-delimited hierarchy paths such as `Root/Child/Leaf`.
- Component selection uses `gameObjectPath + componentType + componentIndex`.
- Duplicate hierarchy paths fail explicitly; there is no best-effort guessing.
- Batch methods accept a single JSON string; pass it through `--args`.
- Live aliases require a reachable bridge.

## Project Script Commands

Add `[AgenticCommand]` to public static editor methods/properties to expose project-specific behavior:

```csharp
using UnityAgenticTools.Commands;

public static class ProjectAutomation
{
    [AgenticCommand("qa.prepare-scene", "Prepare the current scene for QA.")]
    public static object PrepareScene(string scenePath)
    {
        return new { success = true, scenePath };
    }
}
```

Then run:

```bash
unity-agentic-tools list qa -p <project>
unity-agentic-tools run qa.prepare-scene Assets/Scenes/Main.unity -p <project>
```
