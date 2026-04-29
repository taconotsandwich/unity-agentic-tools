# Command Reference

Generated from `unity-package/Editor/Commands/Registry.cs`.

Use aliases before raw public static C# targets.

## project

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `project.refresh` | `UnityEditor.AssetDatabase.Refresh` | Refresh the Unity AssetDatabase. |
| `project.save-assets` | `UnityEditor.AssetDatabase.SaveAssets` | Save modified project assets. |
| `project.build.add` | `UnityAgenticTools.Create.Project.Build` | Add a scene to build settings. |
| `project.package.add` | `UnityAgenticTools.Create.Project.Package` | Add or update a package dependency. |

## scene

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `scene.open` | `UnityAgenticTools.Util.Scene.Open` | Open a scene in the Unity Editor. |
| `scene.save` | `UnityAgenticTools.Util.Scene.Save` | Save the active scene. |
| `scene.hierarchy` | `UnityAgenticTools.Util.Hierarchy.Snapshot` | Return a hierarchy snapshot for the active scene. |
| `scene.query` | `UnityAgenticTools.Util.Hierarchy.Query` | Query a hierarchy ref from a snapshot. |

## query

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `query.assets` | `UnityAgenticTools.Query.Assets.Find` | Find assets with Unity AssetDatabase filters. |
| `query.asset` | `UnityAgenticTools.Query.Assets.Info` | Inspect basic AssetDatabase metadata for an asset path. |
| `query.scene` | `UnityAgenticTools.Query.Scene.Hierarchy` | Inspect hierarchy data for the active scene or an asset path. |
| `query.object` | `UnityAgenticTools.Query.Scene.Object` | Inspect one GameObject in a scene or prefab asset. |

## create

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `create.scene` | `UnityAgenticTools.Create.Scenes.Scene` | Create a scene asset. |
| `create.gameobject` | `UnityAgenticTools.Create.Scenes.GameObject` | Create a GameObject in a scene or prefab. |
| `create.component` | `UnityAgenticTools.Create.Scenes.Component` | Add a component to a GameObject. |
| `create.component-copy` | `UnityAgenticTools.Create.Scenes.ComponentCopy` | Copy a component between GameObjects. |
| `create.prefab` | `UnityAgenticTools.Create.Prefabs.Prefab` | Create a prefab asset. |
| `create.prefab-instance` | `UnityAgenticTools.Create.Prefabs.PrefabInstance` | Instantiate a prefab into a scene. |
| `create.prefab-variant` | `UnityAgenticTools.Create.Prefabs.PrefabVariant` | Create a prefab variant. |
| `create.scriptable-object` | `UnityAgenticTools.Create.Assets.ScriptableObject` | Create a ScriptableObject asset. |
| `create.meta` | `UnityAgenticTools.Create.Assets.Meta` | Create a meta file for an asset. |
| `create.material` | `UnityAgenticTools.Create.Assets.Material` | Create a material asset. |
| `create.input-actions` | `UnityAgenticTools.Create.Assets.InputActions` | Create an Input Actions asset. |
| `create.animation` | `UnityAgenticTools.Create.Assets.Animation` | Create an AnimationClip asset. |
| `create.animator` | `UnityAgenticTools.Create.Assets.Animator` | Create an AnimatorController asset. |

## update

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `update.object` | `UnityAgenticTools.Update.Objects.GameObject` | Update a serialized GameObject property. |
| `update.component` | `UnityAgenticTools.Update.Objects.Component` | Update a serialized component property. |
| `update.transform` | `UnityAgenticTools.Update.Objects.Transform` | Update position, rotation, or scale. |
| `update.parent` | `UnityAgenticTools.Update.Objects.Parent` | Reparent a GameObject. |
| `update.sibling-index` | `UnityAgenticTools.Update.Objects.SiblingIndex` | Set a GameObject sibling index. |
| `update.array` | `UnityAgenticTools.Update.Serialized.Array` | Edit a serialized array property. |
| `update.batch` | `UnityAgenticTools.Update.Serialized.Batch` | Batch-edit GameObject serialized properties. |
| `update.batch-components` | `UnityAgenticTools.Update.Serialized.BatchComponents` | Batch-edit component serialized properties. |
| `update.managed-reference` | `UnityAgenticTools.Update.Serialized.ManagedReference` | Set or append a managed reference value. |
| `update.prefab.unpack` | `UnityAgenticTools.Update.Prefabs.PrefabUnpack` | Unpack a prefab instance. |
| `update.prefab.override` | `UnityAgenticTools.Update.Prefabs.PrefabOverride` | Set a prefab instance override. |
| `update.prefab.batch-overrides` | `UnityAgenticTools.Update.Prefabs.PrefabBatchOverrides` | Batch-edit prefab overrides. |
| `update.prefab.managed-reference` | `UnityAgenticTools.Update.Prefabs.PrefabManagedReference` | Set a managed reference prefab override. |
| `update.prefab.remove-override` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveOverride` | Remove a prefab override. |
| `update.prefab.remove-component` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveComponent` | Mark a prefab component as removed. |
| `update.prefab.restore-component` | `UnityAgenticTools.Update.Prefabs.PrefabRestoreComponent` | Restore a removed prefab component. |
| `update.prefab.remove-gameobject` | `UnityAgenticTools.Update.Prefabs.PrefabRemoveGameObject` | Mark a prefab GameObject as removed. |
| `update.prefab.restore-gameobject` | `UnityAgenticTools.Update.Prefabs.PrefabRestoreGameObject` | Restore a removed prefab GameObject. |

## delete

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `delete.gameobject` | `UnityAgenticTools.Delete.Objects.GameObject` | Delete a GameObject from a scene or prefab. |
| `delete.component` | `UnityAgenticTools.Delete.Objects.Component` | Delete a component from a GameObject. |
| `delete.asset` | `UnityAgenticTools.Delete.Assets.Asset` | Delete an asset and its meta file through AssetDatabase. |

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
| `ui.snapshot` | `UnityAgenticTools.Util.UI.Snapshot` | Return UI refs and metadata. |
| `ui.query` | `UnityAgenticTools.Util.UI.Query` | Query a UI ref. |
| `ui.interact` | `UnityAgenticTools.Util.UI.Interact` | Interact with a UI ref. |

## input

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `input.map` | `UnityAgenticTools.Util.Input.Map` | Inspect available input actions and legacy axes. |
| `input.key` | `UnityAgenticTools.Util.Input.Key` | Send a key input event. |
| `input.mouse` | `UnityAgenticTools.Util.Input.Mouse` | Send a mouse input event. |
| `input.touch` | `UnityAgenticTools.Util.Input.Touch` | Send a touch input event. |
| `input.action` | `UnityAgenticTools.Util.Input.Action` | Trigger an input action. |

## screenshot

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `screenshot.take` | `UnityAgenticTools.Util.Screenshot.Take` | Capture a Game view screenshot. |
| `screenshot.annotated` | `UnityAgenticTools.Util.Screenshot.Annotated` | Capture a screenshot with UI annotations. |

## tests

| Alias | Backing API | Purpose |
|-------|-------------|---------|
| `tests.run` | `UnityAgenticTools.Util.TestRunner.Run` | Run Unity tests. |
| `tests.results` | `UnityAgenticTools.Util.TestRunner.GetResults` | Read the latest Unity test results. |
