# unity-agentic-tools

Token-efficient CLI and library for parsing, analyzing, and editing Unity YAML files. Powered by a native Rust backend (napi-rs).

## Overview

Fast CLI for Unity scene, prefab, and asset files. Extracts GameObject hierarchies, components, properties, materials, animations, and project settings with minimal token output for AI agent consumption. Includes a live editor bridge (WebSocket/JSON-RPC) for play mode control, UI interaction, input simulation, and annotated screenshots.

## Quick Start

```bash
npm install -g unity-agentic-tools
unity-agentic-tools read scene MyScene.unity
unity-agentic-tools read gameobject MyScene.unity "Main Camera" -p
unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Transform --args '["Assets/Scenes/Main.unity","Main Camera","0,5,-10"]'
```

## Command Surface

Unsafe scene and prefab graph mutations no longer live under top-level `create` / `update`. Use the editor bridge instead:

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes GameObject --args '["Assets/Scenes/Main.unity","EnemyRoot","Gameplay"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabInstance --args '["Assets/Scenes/Boot.unity","Assets/Prefabs/AppRoot.prefab"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Component --args '["Assets/Scenes/Main.unity","Player","BoxCollider","0","m_IsTrigger","true"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized BatchComponents --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]'
```

Top-level CLI commands remain for file-safe asset and project mutations. `UnityAgenticTools.Create.*` / `UnityAgenticTools.Update.*` require a reachable live editor bridge; they do not fall back to handwritten YAML.

### Read (20)
`read scene` | `read gameobject` | `read asset` | `read scriptable-object` | `read material` | `read dependencies` | `read dependents` | `read unused` | `read settings` | `read build` | `read overrides` | `read component` | `read reference` | `read script` | `read scripts` | `read meta` | `read animation` | `read animator` | `read manifest` | `read input-actions`

### Create (0 top-level)
Creation is editor-only now. Use `unity-agentic-tools editor invoke UnityAgenticTools.Create.* ...`.

### Update (7 top-level)
`update scriptable-object` | `update settings` | `update layer` | `update material` | `update meta` | `update animation` | `update animator`

### Delete (6)
`delete gameobject` | `delete component` | `delete build` | `delete prefab` | `delete asset` | `delete package`

### Editor (6) -- Live Unity Bridge
`editor status` | `editor invoke` | `editor console-follow` | `editor list` | `editor install` | `editor uninstall`

### Utilities (8)
`search` | `grep` | `clone` | `version` | `docs` | `setup` | `cleanup` | `status`

Run any command with `--help` for full options.

## Loaded Edit Protection

When editor bridge is connected, file-based mutators that still edit `.unity`/`.prefab` files are soft-protected. If a remaining file-based command targets a loaded file, pass `--bypass-loaded-protection`.

This affects scene/prefab mutators including:
- `clone`
- `delete gameobject|component|prefab|asset`

Scene/prefab graph creation and mutation should now go through `editor invoke UnityAgenticTools.Create.* ...` or `UnityAgenticTools.Update.* ...`, not `--bypass-loaded-protection`.

If editor bridge is offline/unreachable, the remaining file-based operations behave the same as before, but `editor invoke UnityAgenticTools.Create.* ...` and `UnityAgenticTools.Update.* ...` cannot run.

## Editor-Only Scene / Prefab Mutation APIs

`UnityAgenticTools.Create.Scenes`
- `Scene(assetPath, includeDefaults = false)`
- `GameObject(assetPath, name, parentPath = "")`
- `Component(assetPath, gameObjectPath, componentType)`
- `ComponentCopy(assetPath, sourceGameObjectPath, sourceComponentType, sourceComponentIndex, targetGameObjectPath)`

`UnityAgenticTools.Create.Prefabs`
- `Prefab(assetPath, name = "")`
- `PrefabVariant(sourcePrefabPath, outputPath, variantName = "")`
- `PrefabInstance(assetPath, prefabPath, parentPath = "", instanceName = "", localPosX = 0, localPosY = 0, localPosZ = 0)`

`UnityAgenticTools.Create.Assets`
- `ScriptableObject(assetPath, script, initialValuesJson = "")`
- `Meta(scriptPath)`
- `Material(assetPath, shaderGuid, materialName = "")`
- `InputActions(assetPath, name)`
- `Animation(assetPath, clipName = "", sampleRate = 60, loopTime = false)`
- `Animator(assetPath, controllerName = "", layerName = "Base Layer")`

`UnityAgenticTools.Create.Project`
- `Build(scenePath, position = -1)`
- `Package(name, version)`

`UnityAgenticTools.Update.Objects`
- `GameObject(assetPath, gameObjectPath, propertyPath, value)`
- `Component(assetPath, gameObjectPath, componentType, componentIndex, propertyPath, value)`
- `Transform(assetPath, gameObjectPath, position = "", rotation = "", scale = "")`
- `Parent(assetPath, gameObjectPath, newParentPath = "")`
- `SiblingIndex(assetPath, gameObjectPath, index)`

`UnityAgenticTools.Update.Serialized`
- `Array(assetPath, gameObjectPath, componentType, componentIndex, arrayProperty, action, payloadJson = "")`
- `Batch(assetPath, editsJson)`
- `BatchComponents(assetPath, editsJson)`
- `ManagedReference(assetPath, gameObjectPath, componentType, componentIndex, fieldPath, typeName, initialValuesJson = "", append = false)`

`UnityAgenticTools.Update.Prefabs`
- `PrefabUnpack(assetPath, prefabInstancePath, mode = "OutermostRoot")`
- `PrefabOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath, value)`
- `PrefabBatchOverrides(assetPath, editsJson)`
- `PrefabManagedReference(assetPath, gameObjectPath, componentType, componentIndex, fieldPath, typeName, initialValuesJson = "", append = false)`
- `PrefabRemoveOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath)`
- `PrefabRemoveComponent(assetPath, gameObjectPath, componentType, componentIndex)`
- `PrefabRestoreComponent(assetPath, gameObjectPath, componentType, componentIndex)`
- `PrefabRemoveGameObject(assetPath, gameObjectPath)`
- `PrefabRestoreGameObject(assetPath, gameObjectPath)`

## Requirements

- Bun runtime
- Native Rust module (included in npm package, or build from source with `bun run build:rust`)

## Troubleshooting

### Slow on large scenes

The Rust backend may not be installed. Run `bun install` in the project root to resolve the native module.

### Script names show as GUIDs

The GUID cache hasn't been built for your project. Run `unity-agentic-tools setup -p <project_path>`.

### Parse errors on custom assets

Some asset types with non-standard YAML may not parse correctly. Open an issue with a sample file.

## License

Apache-2.0
