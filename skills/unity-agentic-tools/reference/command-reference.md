# Command Reference

Generated from `unity-package/Editor/Commands/Registry.cs`.

These aliases run without `--raw`. Any target not listed here is a raw public static C# member, which `run` refuses unless `--raw` is passed and logs a warning in the Unity console when it accepts. Argument hints: `<required>` `[optional]`.

## project

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `project.refresh` | `UnityEditor.AssetDatabase.Refresh` | Refresh the Unity AssetDatabase. |
| `project.save-assets` | `UnityEditor.AssetDatabase.SaveAssets` | Save modified project assets. |
| `project.build.add <scenePath> [position]` | `UnityAgenticTools.Create.Project.Build` | Add a scene to build settings. |
| `project.package.add <name> <version>` | `UnityAgenticTools.Create.Project.Package` | Add or update a package dependency. |

## scene

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `scene.open <scenePath> [additive]` | `UnityAgenticTools.Util.Scene.Open` | Open a scene in the Unity Editor. |
| `scene.save` | `UnityAgenticTools.Util.Scene.Save` | Save every open scene. |
| `scene.hierarchy [maxDepth] [includeInactive] [maxNodes] [scenePath]` | `UnityAgenticTools.Util.Hierarchy.Snapshot` | Return a hierarchy snapshot of every loaded scene, or one named scene. |
| `scene.query <refStr> <query> [type]` | `UnityAgenticTools.Util.Hierarchy.Query` | Query a hierarchy ref from a snapshot. |

## query

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `query.assets [filter] [foldersCsv] [maxResults]` | `UnityAgenticTools.Query.Assets.Find` | Find assets with Unity AssetDatabase filters. |
| `query.asset <assetPath>` | `UnityAgenticTools.Query.Assets.Info` | Inspect basic AssetDatabase metadata for an asset path. |
| `query.scene [assetPath] [maxDepth] [includeInactive]` | `UnityAgenticTools.Query.Scene.Hierarchy` | Inspect hierarchy data for an asset path, or for every loaded scene. |
| `query.object <assetPath> <gameObjectPath>` | `UnityAgenticTools.Query.Scene.Object` | Inspect one GameObject in a scene or prefab asset. |

## create

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `create.scene <assetPath> [includeDefaults]` | `UnityAgenticTools.Create.Scenes.Scene` | Create a scene asset. |
| `create.gameobject <assetPath> <name> [parentPath]` | `UnityAgenticTools.Create.Scenes.GameObject` | Create a GameObject in a scene or prefab. |
| `create.component <assetPath> <gameObjectPath> <componentType>` | `UnityAgenticTools.Create.Scenes.Component` | Add a component to a GameObject. |
| `create.component-copy <assetPath> <sourceGameObjectPath> <sourceComponentType> <sourceComponentIndex> <targetGameObjectPath>` | `UnityAgenticTools.Create.Scenes.ComponentCopy` | Copy a component between GameObjects. |
| `create.prefab <assetPath> [name]` | `UnityAgenticTools.Create.Prefabs.Prefab` | Create a prefab asset. |
| `create.prefab-instance <assetPath> <prefabPath> [parentPath] [instanceName] [localPosX] [localPosY] [localPosZ]` | `UnityAgenticTools.Create.Prefabs.PrefabInstance` | Instantiate a prefab into a scene. |
| `create.prefab-variant <sourcePrefabPath> <outputPath> [variantName]` | `UnityAgenticTools.Create.Prefabs.PrefabVariant` | Create a prefab variant. |
| `create.scriptable-object <assetPath> <script> [initialValuesJson]` | `UnityAgenticTools.Create.Assets.ScriptableObject` | Create a ScriptableObject asset. |
| `create.meta <scriptPath>` | `UnityAgenticTools.Create.Assets.Meta` | Create a meta file for an asset. |
| `create.material <assetPath> <shaderGuid> [materialName]` | `UnityAgenticTools.Create.Assets.Material` | Create a material asset. |
| `create.input-actions <assetPath> <name>` | `UnityAgenticTools.Create.Assets.InputActions` | Create an Input Actions asset. |
| `create.animation <assetPath> [clipName] [sampleRate] [loopTime]` | `UnityAgenticTools.Create.Assets.Animation` | Create an AnimationClip asset. |
| `create.animator <assetPath> [controllerName] [layerName]` | `UnityAgenticTools.Create.Assets.Animator` | Create an AnimatorController asset. |

## update

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `update.object <assetPath> <gameObjectPath> <propertyPath> <value>` | `UnityAgenticTools.Update.Objects.GameObject` | Update a serialized GameObject property. |
| `update.component <assetPath> <gameObjectPath> <componentType> <componentIndex> <propertyPath> <value>` | `UnityAgenticTools.Update.Objects.Component` | Update a serialized component property. |
| `update.transform <assetPath> <gameObjectPath> [position] [rotation] [scale]` | `UnityAgenticTools.Update.Objects.Transform` | Update position, rotation, or scale. |
| `update.parent <assetPath> <gameObjectPath> [newParentPath]` | `UnityAgenticTools.Update.Objects.Parent` | Reparent a GameObject. |
| `update.sibling-index <assetPath> <gameObjectPath> <index>` | `UnityAgenticTools.Update.Objects.SiblingIndex` | Set a GameObject sibling index. |
| `update.array <assetPath> <gameObjectPath> <componentType> <componentIndex> <arrayProperty> <action> [payloadJson]` | `UnityAgenticTools.Update.Serialized.Array` | Edit a serialized array property. |
| `update.batch <assetPath> <editsJson>` | `UnityAgenticTools.Update.Serialized.Batch` | Batch-edit GameObject serialized properties. |
| `update.batch-components <assetPath> <editsJson>` | `UnityAgenticTools.Update.Serialized.BatchComponents` | Batch-edit component serialized properties. |
| `update.managed-reference <assetPath> <gameObjectPath> <componentType> <componentIndex> <fieldPath> <typeName> [initialValuesJson] [append]` | `UnityAgenticTools.Update.Serialized.ManagedReference` | Set or append a managed reference value. |
| `update.prefab.unpack <assetPath> <prefabInstancePath> [mode]` | `UnityAgenticTools.Update.Prefabs.PrefabUnpack` | Unpack a prefab instance. |
| `update.prefab.override <assetPath> <gameObjectPath> <componentType> <componentIndex> <propertyPath> <value>` | `UnityAgenticTools.Update.Prefabs.PrefabOverride` | Set a prefab instance override. |
| `update.prefab.batch-overrides <assetPath> <editsJson>` | `UnityAgenticTools.Update.Prefabs.PrefabBatchOverrides` | Batch-edit prefab overrides. |
| `update.prefab.managed-reference <assetPath> <gameObjectPath> <componentType> <componentIndex> <fieldPath> <typeName> [initialValuesJson] [append]` | `UnityAgenticTools.Update.Prefabs.PrefabManagedReference` | Set a managed reference prefab override. |
| `update.prefab.remove-override <assetPath> <gameObjectPath> <componentType> <componentIndex> <propertyPath>` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveOverride` | Remove a prefab override. |
| `update.prefab.remove-component <assetPath> <gameObjectPath> <componentType> <componentIndex>` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveComponent` | Mark a prefab component as removed. |
| `update.prefab.restore-component <assetPath> <gameObjectPath> <componentType> <componentIndex>` | `UnityAgenticTools.Update.Prefabs.PrefabRestoreComponent` | Restore a removed prefab component. |
| `update.prefab.remove-gameobject <assetPath> <gameObjectPath>` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveGameObject` | Mark a prefab GameObject as removed. |
| `update.prefab.restore-gameobject <assetPath> <gameObjectPath>` | `UnityAgenticTools.Update.Prefabs.PrefabRestoreGameObject` | Restore a removed prefab GameObject. |

## delete

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `delete.gameobject <assetPath> <gameObjectPath>` | `UnityAgenticTools.Delete.Objects.GameObject` | Delete a GameObject from a scene or prefab. |
| `delete.component <assetPath> <gameObjectPath> <componentType> [componentIndex]` | `UnityAgenticTools.Delete.Objects.Component` | Delete a component from a GameObject. |
| `delete.asset <assetPath>` | `UnityAgenticTools.Delete.Assets.Asset` | Delete an asset and its meta file through AssetDatabase. |

## play

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `play.enter` | `UnityAgenticTools.Util.PlayMode.Enter` | Enter play mode. |
| `play.exit` | `UnityAgenticTools.Util.PlayMode.Exit` | Exit play mode. |
| `play.pause` | `UnityAgenticTools.Util.PlayMode.Pause` | Toggle pause state. |
| `play.step` | `UnityAgenticTools.Util.PlayMode.Step` | Step one frame in play mode. |
| `play.state` | `UnityAgenticTools.Util.PlayMode.GetState` | Read play mode state. |

## ui

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `ui.snapshot [maxElements]` | `UnityAgenticTools.Util.UI.Snapshot` | Return UI refs and metadata. |
| `ui.query <refStr> <query>` | `UnityAgenticTools.Util.UI.Query` | Query a UI ref. |
| `ui.interact <refStr> <action> [text] [value] [option] [byIndex] [direction] [amount]` | `UnityAgenticTools.Util.UI.Interact` | Interact with a UI ref. |

## wait

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `wait.for <condition> [refStr] [name] [text] [timeout] [ms]` | `UnityAgenticTools.Util.UI.Wait` | Wait for a condition: ui, ui-gone, scene, log, compile, delay. |

## input

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `input.map [filter] [includeLegacyAxes]` | `UnityAgenticTools.Util.Input.Map` | Inspect available input actions and legacy axes. |
| `input.key <key> [mode]` | `UnityAgenticTools.Util.Input.Key` | Send a key input event. |
| `input.mouse <x> <y> [mode]` | `UnityAgenticTools.Util.Input.Mouse` | Send a mouse input event. |
| `input.touch <x> <y> [mode]` | `UnityAgenticTools.Util.Input.Touch` | Send a touch input event. |
| `input.action <name> [value]` | `UnityAgenticTools.Util.Input.Action` | Trigger an input action. |

## screenshot

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `screenshot.take <outputPath> <superSize>` | `UnityAgenticTools.Util.Screenshot.Take` | Capture a Game view screenshot. |
| `screenshot.annotated <outputPath>` | `UnityAgenticTools.Util.Screenshot.Annotated` | Capture a screenshot with UI annotations. |

## tests

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `tests.run [mode] [filter]` | `UnityAgenticTools.Util.TestRunner.Run` | Run Unity tests. |
| `tests.results` | `UnityAgenticTools.Util.TestRunner.GetResults` | Read the latest Unity test results. |

## logs

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `logs.tail [count] [type] [contains] [includeStackTrace]` | `UnityAgenticTools.Bridge.Handlers.ConsoleHandler.GetLogs` | Read recent console logs (pull, no streaming). |
| `logs.clear` | `UnityAgenticTools.Bridge.Handlers.ConsoleHandler.Clear` | Clear the Unity console and the captured log buffer. |
