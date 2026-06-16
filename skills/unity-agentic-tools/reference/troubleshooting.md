# Troubleshooting

## Bridge Not Reachable

1. Run `unity-agentic-tools status -p <project>`.
2. If the package is missing, run `unity-agentic-tools install -p <project>`.
3. Open Unity and wait for import/compile.
4. If lock state is stale, run `unity-agentic-tools cleanup -p <project>`.
5. Re-run `unity-agentic-tools status -p <project>`.

Use `--port <n>` only when targeting a known bridge port manually.

## Long-running Commands (build, bake, reimport)

The `run` command defaults to a 60s WebSocket timeout. Builds, lighting bakes, AssetDatabase reimports, and platform switches commonly exceed it.

- **Raise the timeout** explicitly for known-long ops. 20 minutes is a safe ceiling for a first-time platform build on a cold project:

  ```bash
  unity-agentic-tools run build.windows --timeout 1200000 -p <project>
  ```

  The CLI forwards any non-default `--timeout` to the Unity side as a `_timeout` hint, so both ends use the same window.

- **CLI timeout does not cancel Unity work.** When the client-side timer fires, the CLI closes the socket and exits non-zero, but a synchronous `BuildPipeline.BuildPlayer` call already running on Unity's main thread keeps going to completion. The build artifact lands on disk, but the JSON response is dropped. Treat a `Timeout after Nms` error on a mutating command as "result unknown" and check the side effects (file on disk, scene state) before retrying.

- **Fire and forget with `--no-wait`.** Returns `{ queued: true }` immediately and lets Unity work in the background. Useful for very long ops where you'd rather poll than block:

  ```bash
  unity-agentic-tools run build.android --no-wait -p <project>
  unity-agentic-tools stream console -p <project>
  ```

- **The Unity main thread is single-threaded.** Stacked `run` calls queue on `_mainThreadQueue` and execute serially. Do not fire a second `run` while the first is still executing — it will sit in the queue and your client will time out before its turn comes up. Either wait for the first to return, or stream `editor.event.*` notifications until the first op signals completion.

- **Domain reloads cancel in-flight requests.** Any script edit, `.asmdef` change, or scripting-define adjustment triggers `OnBeforeAssemblyReload`, which tears down the bridge and orphans pending requests with the error `Editor invoke was interrupted by a server transition before its response could be delivered`. The bridge auto-restarts on `afterAssemblyReload`; just retry once `unity-agentic-tools status` reports reachable again.

## Stale Refs

Hierarchy refs (`@hN`) and UI refs (`@uN`) are temporary. Refresh them after:

- scene changes
- play mode transitions
- domain reloads
- object destruction
- UI rebuilds

Use:

```bash
unity-agentic-tools run scene.hierarchy -p <project>
unity-agentic-tools run ui.snapshot -p <project>
```

## Duplicate Hierarchy Paths

Duplicate paths fail explicitly. Query the scene, identify the exact hierarchy location, then use a unique path or ref-based workflow.

## JSON Args

Use `--args '<json array>'` when positional quoting becomes ambiguous or an argument is structured JSON.

```bash
unity-agentic-tools run update.batch --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"propertyPath\":\"m_Name\",\"value\":\"Hero\"}]"]' -p <project>
```

## Verification

After mutations:

- Check the command JSON for `success: false`.
- Re-query the target object or scene.
- Use `stream console --duration 5000` when Unity-side errors are possible.
- Use screenshots or tests for UI and play mode work.
