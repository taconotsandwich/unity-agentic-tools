# Live Editor Workflows

Use these workflows when Unity is open and the bridge should be reachable.

## Setup

1. `unity-agentic-tools install -p <project>`
2. Open the project in Unity and wait for import/compile.
3. `unity-agentic-tools status -p <project>`
4. `unity-agentic-tools list -p <project>`

If status reports stale lockfiles, run `unity-agentic-tools cleanup -p <project>` and re-check status.

## Inspect-Run-Verify

1. Discover: `unity-agentic-tools list <query> -p <project>`.
2. Inspect:
   - `unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>`
   - `unity-agentic-tools run query.object Assets/Scenes/Main.unity Player -p <project>`
   - `unity-agentic-tools run query.assets "t:Prefab" -p <project>`
3. Mutate with `unity-agentic-tools run <alias> ... -p <project>`.
4. Verify with `query.*`, `scene.hierarchy`, `ui.snapshot`, screenshots, tests, or console logs.

## Scene And Prefab Mutation

Use this for GameObjects, components, prefab instances, parenting, sibling order, overrides, and unpacking.

1. `unity-agentic-tools status -p <project>`
2. `unity-agentic-tools run query.scene Assets/Scenes/Main.unity -p <project>`
3. Choose an alias:
   - create path: `create.*`
   - update path: `update.*`
   - delete path: `delete.*`
4. Use asset-relative targets and slash-delimited hierarchy paths.
5. Verify with `query.scene`, `query.object`, `scene.hierarchy`, or screenshots.

## UI Testing

1. `unity-agentic-tools status -p <project>`
2. `unity-agentic-tools run play.enter -p <project>`
3. `unity-agentic-tools run scene.hierarchy -p <project>`
4. `unity-agentic-tools run ui.snapshot -p <project>`
5. `unity-agentic-tools run screenshot.annotated Temp/annotated.png -p <project>`
6. Interact:
   - `unity-agentic-tools run ui.interact @uN click -p <project>`
   - `unity-agentic-tools run ui.interact @uN fill text -p <project>`
   - `unity-agentic-tools run ui.interact @uN toggle -p <project>`
7. `unity-agentic-tools stream console --duration 2000 -p <project>`
8. `unity-agentic-tools run play.exit -p <project>`

Refs such as `@hN` and `@uN` invalidate on scene change, play mode transition, or domain reload. Re-run `scene.hierarchy` or `ui.snapshot` to refresh.

## Batch Editing

Use `--args '<json array>'` when one command argument is itself structured JSON.

```bash
unity-agentic-tools run update.batch-components --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]' -p <project>
```
