# Live Editor Workflows

Use these workflows when Unity is open and the bridge should be reachable.

## Setup

Fresh project: `unity-agentic-tools install -p <project>`, open Unity, wait for import/compile, then `unity-agentic-tools status -p <project>`. For stale locks or unreachable bridges, follow "Bridge Not Reachable" in `troubleshooting.md`.

## Inspect-Run-Verify

1. Discover: `unity-agentic-tools list <query> --brief -p <project>`.
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
7. Wait for the effect instead of sleeping and re-snapshotting:
   - `unity-agentic-tools run wait.for ui @uN -p <project>` blocks until the ref'd element is active (`ui-gone` for the reverse)
   - `unity-agentic-tools run wait.for log "" "" "saved" -p <project>` blocks until a console message containing "saved" arrives
8. `unity-agentic-tools run logs.tail 20 error -p <project>`
9. `unity-agentic-tools run play.exit -p <project>`

`wait.for` takes `<condition> [refStr] [name] [text] [timeout] [ms]`; conditions are `ui`, `ui-gone`, `scene`, `log`, `compile`, and `delay`. `logs.tail` takes `[count] [type] [contains] [includeStackTrace]` and pulls from the buffered console, so it needs no open stream; keep `stream console --duration <ms>` for watching logs continuously.

Refs such as `@hN` and `@uN` invalidate on scene change, play mode transition, or domain reload. Re-run `scene.hierarchy` or `ui.snapshot` to refresh.

### Play Mode Transitions

`play.enter` and `play.exit` report what the Editor is doing when they return, not the state you asked for. `requested` names the intent; `state` and `isPlaying` are queried live:

```json
{"success":true,"requested":"Playing","state":"Stopped","isPlaying":false}
```

Unity applies the change over several frames, and entering play mode reloads the domain, so both directions return before the transition lands. Gate on `play.state`, never on the transition response:

```bash
unity-agentic-tools run play.state -p <project>
```

No manual sleep is needed between step 2 and step 3 — reads issued during a transition wait it out on their own. They will just be slow (seconds, not milliseconds).

`scene.hierarchy` caps output at 500 nodes and `ui.snapshot` at 300 elements by default; a capped response carries `"truncated": true`. Pass a larger trailing max argument (or `0` for unlimited) to lift the cap, e.g. `run scene.hierarchy 99 false 0`.

## Batch Editing

Batch aliases (`update.batch`, `update.batch-components`) take the edit list as a JSON string argument. Pass it positionally in single quotes and let the CLI encode the outer array:

```bash
unity-agentic-tools run update.batch Assets/Scenes/Main.unity '[{"gameObjectPath":"Player","propertyPath":"m_Name","value":"Hero"}]' -p <project>
```

See "JSON Args" in `troubleshooting.md` for why this beats the equivalent `--args` form, and for the one case that still needs `--args`.

### CLI Batch

`run --batch` is the other batching axis: many commands in one CLI process, instead of many edits in one command. It takes a JSON array of `[target, ...args]` items, runs them sequentially, and stops at the first failure:

```bash
unity-agentic-tools run --batch '[["create.gameobject","Assets/Scenes/Main.unity","Enemy"],["create.component","Assets/Scenes/Main.unity","Enemy","BoxCollider"]]' -p <project>
```

Use `update.batch` when many property edits target one scene or prefab; use `run --batch` when a sequence of different commands belongs to one step. Batch items cannot use `--raw` targets.
