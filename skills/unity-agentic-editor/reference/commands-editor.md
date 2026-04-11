# editor command reference

Authoritative reference for `unity-agentic-tools editor ...`.

## Base usage

```bash
unity-agentic-tools editor [options] <subcommand>
```

Base options:
- `-p, --project <path>`: Unity project path (default cwd)
- `--timeout <ms>`: RPC timeout (default `10000`)
- `--port <n>`: Override bridge port

## Required setup

1. `unity-agentic-tools editor install -p <project>`
2. Open project in Unity and wait for compile/import
3. `unity-agentic-tools editor status -p <project>`

## Command matrix

| Command | Purpose |
|---------|---------|
| `editor status` | Check bridge connection |
| `editor list` | List available top/editor commands |
| `editor invoke <type> <member> [args...]` | Invoke static method/property |
| `editor console-follow` | Stream logs in real time |
| `editor install` | Install bridge package |
| `editor uninstall` | Remove bridge package |

## Detailed usage

### `editor status`

No subcommand-specific options.

### `editor list`

Options:
- `--scope <scope>`: `all|editor|top` (default `all`)
- `--show-options`: include option metadata
- `--show-args`: include positional arg metadata
- `--show-desc`: include descriptions

### `editor invoke <type> <member> [args...]`

Options:
- `--args <json>`: JSON array of arguments (overrides positional args)
- `--set <value>`: set writable static property instead of reading/calling
- `--no-wait`: return immediately

Examples:

```bash
unity-agentic-tools editor invoke UnityEditor.AssetDatabase Refresh
unity-agentic-tools editor invoke UnityEditor.EditorApplication isCompiling
unity-agentic-tools editor invoke UnityEditor.EditorApplication ExecuteMenuItem "File/Save"
```

### `editor console-follow`

Options:
- `-t, --type <type>`: `Log|Warning|Error|Assert|Exception`
- `--duration <ms>`: auto-stop after duration (`0` means unlimited)

### `editor install`

Options:
- `-p, --project <path>`: target Unity project path

### `editor uninstall`

Options:
- `-p, --project <path>`: target Unity project path

## Ref and snapshot guidance

For interactive UI and hierarchy workflows, use `editor invoke` against the built-in bridge APIs:

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Util.Hierarchy Snapshot "[99,false]"
unity-agentic-tools editor invoke UnityAgenticTools.Util.UI Snapshot
```

Snapshot-first pattern:
- `editor invoke UnityAgenticTools.Util.Hierarchy Snapshot ...` -> `@hN`
- `editor invoke UnityAgenticTools.Util.UI Snapshot` -> `@uN`

Then query or interact through invoke calls such as:
- `editor invoke UnityAgenticTools.Util.Hierarchy Query "[\"@h1\",\"active\"]"`
- `editor invoke UnityAgenticTools.Util.UI Query "[\"@u1\",\"text\"]"`
- `editor invoke UnityAgenticTools.Util.UI Interact "[\"@u1\",\"click\"]"`

Re-snapshot after scene changes, play mode changes, or domain reload.

## Editor-only scene / prefab mutation APIs

Use these through `editor invoke` only. These belong under `unity-agentic-editor` because they require a reachable live editor bridge.

### Create Namespaces

Use `unity-agentic-tools editor invoke <type> <Member> --args '<json array>'` with the appropriate create type:
- `UnityAgenticTools.Create.Scenes`
- `UnityAgenticTools.Create.Prefabs`
- `UnityAgenticTools.Create.Assets`
- `UnityAgenticTools.Create.Project`

Members:
- `Scene(assetPath, includeDefaults = false)`
- `PrefabVariant(sourcePrefabPath, outputPath, variantName = "")`
- `ScriptableObject(assetPath, script, initialValuesJson = "")`
- `Meta(scriptPath)`
- `Build(scenePath, position = -1)`
- `Material(assetPath, shaderGuid, materialName = "")`
- `Package(name, version)`
- `InputActions(assetPath, name)`
- `Animation(assetPath, clipName = "", sampleRate = 60, loopTime = false)`
- `Animator(assetPath, controllerName = "", layerName = "Base Layer")`
- `Prefab(assetPath, name = "")`
- `GameObject(assetPath, name, parentPath = "")`
- `Component(assetPath, gameObjectPath, componentType)`
- `ComponentCopy(assetPath, sourceGameObjectPath, sourceComponentType, sourceComponentIndex, targetGameObjectPath)`
- `PrefabInstance(assetPath, prefabPath, parentPath = "", instanceName = "", localPosX = 0, localPosY = 0, localPosZ = 0)`

Examples:

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Scene --args '["Assets/Scenes/NewLevel.unity","false"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabVariant --args '["Assets/Prefabs/Base.prefab","Assets/Prefabs/BaseVariant.prefab","Base Variant"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets ScriptableObject --args '["Assets/Data/Enemy.asset","EnemyConfig","{\"health\":100}"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Meta --args '["Assets/Scripts/TestScript.cs"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Build --args '["Assets/Scenes/Main.unity","0"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Material --args '["Assets/Materials/Floor.mat","0000000000000000f000000000000000","Floor"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Package --args '["com.unity.cinemachine","2.9.7"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets InputActions --args '["Assets/Input/NewActions.inputactions","NewActions"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animation --args '["Assets/Animations/New.anim","NewAnim","60","true"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animator --args '["Assets/Animators/New.controller","NewController","Base Layer"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs Prefab --args '["Assets/Prefabs/Enemy.prefab","Enemy"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes GameObject --args '["Assets/Scenes/Main.unity","EnemyRoot","Gameplay"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Component --args '["Assets/Scenes/Main.unity","EnemyRoot","BoxCollider"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes ComponentCopy --args '["Assets/Scenes/Main.unity","Templates/Enemy","BoxCollider",0,"EnemyRoot"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabInstance --args '["Assets/Scenes/Boot.unity","Assets/Prefabs/AppRoot.prefab","","AppRoot",0,0,0]'
```

### Update Namespaces

Use `unity-agentic-tools editor invoke <type> <Member> --args '<json array>'` with the appropriate update type:
- `UnityAgenticTools.Update.Objects`
- `UnityAgenticTools.Update.Serialized`
- `UnityAgenticTools.Update.Prefabs`

Members:
- `GameObject(assetPath, gameObjectPath, propertyPath, value)`
- `Component(assetPath, gameObjectPath, componentType, componentIndex, propertyPath, value)`
- `Transform(assetPath, gameObjectPath, position = "", rotation = "", scale = "")`
- `Parent(assetPath, gameObjectPath, newParentPath = "")`
- `Array(assetPath, gameObjectPath, componentType, componentIndex, arrayProperty, action, payloadJson = "")`
- `Batch(assetPath, editsJson)`
- `BatchComponents(assetPath, editsJson)`
- `SiblingIndex(assetPath, gameObjectPath, index)`
- `ManagedReference(assetPath, gameObjectPath, componentType, componentIndex, fieldPath, typeName, initialValuesJson = "", append = false)`
- `PrefabUnpack(assetPath, prefabInstancePath, mode = "OutermostRoot")`
- `PrefabOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath, value)`
- `PrefabBatchOverrides(assetPath, editsJson)`
- `PrefabManagedReference(assetPath, gameObjectPath, componentType, componentIndex, fieldPath, typeName, initialValuesJson = "", append = false)`
- `PrefabRemoveOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath)`
- `PrefabRemoveComponent(assetPath, gameObjectPath, componentType, componentIndex)`
- `PrefabRestoreComponent(assetPath, gameObjectPath, componentType, componentIndex)`
- `PrefabRemoveGameObject(assetPath, gameObjectPath)`
- `PrefabRestoreGameObject(assetPath, gameObjectPath)`

Examples:

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Transform --args '["Assets/Scenes/Main.unity","Player","1,2,3","0,90,0","1,1,1"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized BatchComponents --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabOverride --args '["Assets/Scenes/Boot.unity","AppRoot","Transform","0","m_LocalPosition.x","7"]'
```

### Targeting rules

- `assetPath` must be asset-relative, for example `Assets/Scenes/Main.unity` or `Assets/Prefabs/Enemy.prefab`
- `gameObjectPath` and `parentPath` are slash-delimited hierarchy paths such as `Root/Child/Leaf`
- component selection uses `gameObjectPath + componentType + componentIndex`
- duplicate hierarchy paths fail explicitly; there is no best-effort guessing
- batch methods accept a single JSON string because `editor invoke` arguments are scalar
- `UnityAgenticTools.Create.*` / `UnityAgenticTools.Update.*` require a reachable live editor bridge. There is no file fallback
