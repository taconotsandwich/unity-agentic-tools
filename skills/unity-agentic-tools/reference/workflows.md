# Workflows

Runner-first checklists for common Unity tasks. The CLI surface is `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`.

## 1. New Project Setup

1. `unity-agentic-tools install -p <project_path>` - install the Unity bridge package.
2. Open the project in Unity and wait for import/compile.
3. `unity-agentic-tools status -p <project_path>` - verify bridge reachability.
4. `unity-agentic-tools list -p <project_path>` - confirm the command registry responds.

If status reports stale lockfiles, run `unity-agentic-tools cleanup -p <project_path>` and re-check status.

## 2. Inspect-Run-Verify

1. Discover: `unity-agentic-tools list <query> -p <project>`.
2. Inspect state:
   - `unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>`
   - `unity-agentic-tools run query.object Assets/Scenes/Main.unity Player -p <project>`
   - `unity-agentic-tools run query.assets "t:Prefab" -p <project>`
3. Mutate with `unity-agentic-tools run <alias> ... -p <project>`.
4. Verify with the matching `query.*`, `scene.hierarchy`, `ui.snapshot`, or screenshot command.
5. Watch logs when useful: `unity-agentic-tools stream console --duration 5000 -p <project>`.

## 3. Scene / Prefab Mutation

Use this for GameObjects, components, prefab instances, parenting, sibling order, overrides, and unpacking.

1. `unity-agentic-tools status -p <project>` - confirm the bridge is connected.
2. `unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>` - inspect current structure.
3. Choose the alias:
   - create path: `create.*`
   - update path: `update.*`
   - delete path: `delete.*`
4. Use asset-relative targets and hierarchy paths:
   - asset: `Assets/Scenes/Main.unity`
   - GameObject: `Root/Child`
   - component selector: `gameObjectPath + componentType + componentIndex`
5. Verify with `query.scene`, `query.object`, `scene.hierarchy`, or a targeted UI/screenshot command.

## 4. Prefab Editing

1. `unity-agentic-tools run query.scene Assets/Scenes/Boot.unity -p <project>` - find prefab instance paths.
2. Use `update.prefab.*` aliases for live prefab mutations.
3. Verify with `query.scene`, `query.object`, and live editor checks when you need Unity to validate the instance.

## 5. Editor Bridge UI Testing

1. `unity-agentic-tools status -p <project>` - confirm bridge connection.
2. `unity-agentic-tools run play.enter -p <project>` - enter play mode.
3. `unity-agentic-tools run scene.hierarchy -p <project>` - get `@hN` refs for scene objects.
4. `unity-agentic-tools run ui.snapshot -p <project>` - get `@uN` refs for interactive UI elements.
5. `unity-agentic-tools run screenshot.annotated Temp/annotated.png -p <project>` - capture annotated game view.
6. Interact with UI:
   - `unity-agentic-tools run ui.interact @uN click -p <project>`
   - `unity-agentic-tools run ui.interact @uN fill text -p <project>`
   - `unity-agentic-tools run ui.interact @uN toggle -p <project>`
7. `unity-agentic-tools stream console --duration 2000 -p <project>` - check runtime logs.
8. `unity-agentic-tools run play.exit -p <project>` - exit play mode.

Refs (`@hN`, `@uN`) invalidate on scene change, play mode transition, or domain reload. Re-run `scene.hierarchy` / `ui.snapshot` to refresh.

## 6. Batch Editing

1. Search targets with `query.scene`, `query.object`, or `query.assets`.
2. Construct the JSON payload:
   - `update.batch`: `[{"gameObjectPath":"...","propertyPath":"...","value":"..."}]`
   - `update.batch-components`: `[{"gameObjectPath":"...","componentType":"...","componentIndex":0,"propertyPath":"...","value":"..."}]`
3. Execute:
   - `unity-agentic-tools run update.batch --args '["Assets/Scenes/Main.unity","<json>"]' -p <project>`
   - `unity-agentic-tools run update.batch-components --args '["Assets/Scenes/Main.unity","<json>"]' -p <project>`
4. Verify with `query.object` or `query.scene`.
