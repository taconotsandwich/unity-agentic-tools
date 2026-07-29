# Troubleshooting

## Bridge Not Reachable

1. Run `unity-agentic-tools status -p <project>`.
2. If the package is missing, run `unity-agentic-tools install -p <project>`.
3. Open Unity and wait for import/compile.
4. If lock state is stale, run `unity-agentic-tools cleanup -p <project>`.
5. Re-run `unity-agentic-tools status -p <project>`.

Use `--port <n>` only when targeting a known bridge port manually.

### Reading `status`

When the bridge answers, `status` adds a `readiness` block inside `bridge`:

```json
{"runtime":"bun","version":"0.6.1","project_path":"...","bridge":{
 "port":53782,"pid":95468,"version":"0.1.0","source":"lockfile","reachable":true,
 "readiness":{"is_playing":false,"is_paused":false,"is_compiling":false,"is_updating":false,
 "is_playmode_transitioning":false,"is_reloading":false,"is_stable":true}}}
```

- `reachable: true` with `is_stable: false` means the bridge is up but the Editor is busy. Wait; do not reinstall or clean up.
- `readiness_error` instead of `readiness` means the socket opened but the Editor did not answer in time. Same "busy" signal, harsher form.
- `reachable: false` means no socket at all: Unity closed, mid-reload, or the package is not installed.

A call issued while Unity is running but the bridge server is dead takes about 30s to fail, because the client cannot distinguish that from a slow domain reload. That wait is deliberate.

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

- **Domain reloads interrupt in-flight requests, but reads recover on their own.** Any script edit, `.asmdef` change, scripting-define adjustment, or *entering play mode* triggers `OnBeforeAssemblyReload`, which tears the bridge down for roughly 4-7s on a large project. Read commands (`scene.hierarchy`, `scene.query`, `query.*`, `ui.snapshot`, `ui.query`, `play.state`, `input.map`, `tests.results`) and the `play.*` transitions (`enter`, `exit`, `pause`, `step`) wait that window out automatically, for up to 30s and only while the Unity process is provably alive. Expect a slow call, not a failure.

- **Mutating commands do not silently retry a reload.** Codes `-32000` (server restarting) and `-32003` (closed before response) mean the request may already be executing on Unity's main thread, so replaying it could apply it twice. Only `-32002` (connect refused) and `-32010` (discovery unavailable) are retried for mutations, because neither reaches the Editor. A mutation interrupted mid-flight returns `Editor invoke was interrupted by a server transition before its response could be delivered` — treat that as "result unknown", check the side effects, then decide whether to re-run.

## Stream Drops

`stream` reconnects by itself when the bridge goes away, so a domain reload mid-stream is not a reason to restart the command — events resume on the far side. Reconnects are bounded by wall clock (30s from the drop), not by an attempt count.

If it cannot get back, it fails loudly rather than sitting connected to nothing:

```json
{"success":false,"error":"Stream lost: could not reconnect within 30000ms"}
```

and exits non-zero. A rejected subscription (`Subscription rejected: ...`) is reported the same way. A stream that goes quiet without either message is Unity being quiet, not the CLI hiding an error.

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
