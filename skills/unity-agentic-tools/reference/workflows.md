# Workflows

Multi-step checklists for common Unity tasks.

## 1. New project setup

1. `unity-agentic-tools setup -p <project_path>` -- creates `.unity-agentic/` with GUID cache
2. `unity-agentic-tools status` -- verify native module loaded, cache populated
3. `unity-agentic-tools editor install --project <project_path>` -- install editor bridge package
4. Open project in Unity, wait for import
5. `unity-agentic-tools editor status` -- verify bridge connection

## 2. Inspect-edit-verify

Standard read-before-write pattern for Unity files.

1. **Read** the target file:
   - `read scene <file>` for hierarchy overview
   - `read gameobject <file> <name> --properties` for one object
   - `read component <file> <fileID>` for a single serialized component
2. **Choose by dependency**:
   - if the operation does not require a reachable live editor bridge, stay in `unity-agentic-tools`
   - if the operation does require a reachable live editor bridge, switch to `unity-agentic-editor`
3. **Verify bridge availability** for editor-dependent mutations:
   - `editor status`
4. **Mutate**
5. **Verify** by re-reading the same target, and for prefab-instance correctness prefer live editor checks over YAML-only checks

When editor bridge is connected and a remaining file-based command edits a loaded `.unity`/`.prefab`, use `--bypass-loaded-protection` where supported.

## 3. Scene / prefab mutation workflow

Use this for GameObjects, components, prefab instances, parenting, sibling order, overrides, and unpacking.

1. `editor status` -- confirm bridge is connected
2. `read scene <file> --summary` or `read gameobject <file> <name>` -- inspect current structure
3. Choose the API:
   - create path: `editor invoke UnityAgenticTools.Create.* ...`
   - update path: `editor invoke UnityAgenticTools.Update.* ...`
4. Use asset-relative targets and hierarchy paths:
   - asset: `Assets/Scenes/Main.unity`
   - GameObject: `Root/Child`
   - component selector: `gameObjectPath + componentType + componentIndex`
5. Verify:
   - `read scene <file>`
   - `read gameobject <file> <name> --properties`
   - extra live editor checks via `editor invoke` if prefab instance validity matters

There is no file fallback for `UnityAgenticTools.Create.*` / `UnityAgenticTools.Update.*`, so these belong under `unity-agentic-editor`.

## 4. Prefab editing

1. `read scene <file> --summary` -- find prefab instance names
2. `read overrides <file> <instance_id>` -- inspect serialized overrides
3. Use `UnityAgenticTools.Update.Prefabs` for live prefab mutations:
   - `PrefabOverride`
   - `PrefabRemoveOverride`
   - `PrefabRemoveComponent`
   - `PrefabRestoreComponent`
   - `PrefabRemoveGameObject`
   - `PrefabRestoreGameObject`
   - `PrefabUnpack`
4. Verify with:
   - `read overrides <file> <instance_id>`
   - live editor checks when you need to confirm Unity actually accepted the instance

## 5. Editor bridge UI testing

End-to-end workflow for testing a running Unity application.

1. `editor status` -- confirm bridge is connected
2. `editor invoke UnityAgenticTools.Util.PlayMode Enter` -- enter play mode
3. `editor invoke UnityAgenticTools.Util.UI Wait "[\"scene\",null,\"<name>\",null,10000,0]"` -- wait for target scene to load
4. `editor invoke UnityAgenticTools.Util.Hierarchy Snapshot "[2,false]"` -- get `@hN` refs for scene objects
5. `editor invoke UnityAgenticTools.Util.UI Snapshot` -- get `@uN` refs for interactive UI elements
6. `editor invoke UnityAgenticTools.Util.Screenshot Annotated "[\"Temp/annotated.png\"]"` -- capture annotated game view
7. Interact with UI:
   - `editor invoke UnityAgenticTools.Util.UI Interact "[\"@uN\",\"click\"]"` -- click buttons
   - `editor invoke UnityAgenticTools.Util.UI Interact "[\"@uN\",\"fill\",\"text\"]"` -- fill input fields
   - `editor invoke UnityAgenticTools.Util.UI Interact "[\"@uN\",\"toggle\"]"` -- toggle checkboxes
   - `editor invoke UnityAgenticTools.Util.UI Interact "[\"@uN\",\"slider\",null,0.5]"` -- set slider values
   - `editor invoke UnityAgenticTools.Util.UI Interact "[\"@uN\",\"select\",null,0,\"Option\",false]"` -- select dropdown options
8. `editor invoke UnityAgenticTools.Util.UI Wait "[\"ui\",\"@uN\",null,null,10000,0]"` or `editor invoke UnityAgenticTools.Util.UI Wait "[\"log\",null,null,\"text\",10000,0]"`
9. `editor invoke UnityAgenticTools.Util.Screenshot Take "[\"Temp/result.png\",1]"` -- capture result state
10. `editor console-follow --duration 2000` -- check runtime logs
11. `editor invoke UnityAgenticTools.Util.PlayMode Exit` -- exit play mode

Refs (`@hN`, `@uN`) invalidate on scene change, play mode transition, or domain reload. Re-run `UnityAgenticTools.Util.Hierarchy Snapshot` / `UnityAgenticTools.Util.UI Snapshot` to refresh.

## 6. Batch editing

For applying the same change across many scene objects or components.

1. **Search** for targets:
   - `search <project> -n "pattern"` -- find matching objects across files
   - `search <file> "pattern"` -- find within a single file
2. **Construct** the JSON payload:
   - `UnityAgenticTools.Update.Serialized Batch`: `[{"gameObjectPath":"...","propertyPath":"...","value":"..."}]`
   - `UnityAgenticTools.Update.Serialized BatchComponents`: `[{"gameObjectPath":"...","componentType":"...","componentIndex":0,"propertyPath":"...","value":"..."}]`
3. **Execute**:
   - `editor invoke UnityAgenticTools.Update.Serialized Batch --args '["Assets/Scenes/Main.unity","<json>"]'`
   - `editor invoke UnityAgenticTools.Update.Serialized BatchComponents --args '["Assets/Scenes/Main.unity","<json>"]'`
4. **Verify**: Re-read affected objects to confirm changes

## 7. Animation editing

Read-modify-verify workflow for AnimationClips and AnimatorControllers.

1. **Read** the current state:
   - `read animation <file>` -- see curves, events, settings
   - `read animator <file> --states` -- see states per layer
   - `read animator <file> --transitions` -- see transitions with conditions
2. **Edit** in-place values at the top level:
   - `update animation <file> --set wrap-mode=2` -- change clip settings
   - `update animator <file> --set-default Speed=1.5` -- change existing parameter defaults
3. **Switch to the editor bridge** for structural animation/controller changes:
   - create new clips/controllers with `editor invoke UnityAgenticTools.Create.* ...`
   - use the editor bridge for scene/prefab graph mutations and other structural edits
4. **Verify** by re-reading:
   - `read animation <file>` -- confirm curves/keyframes
   - `read animator <file> --transitions` -- confirm transitions
