# editor -- 6 commands

Live Unity Editor integration via WebSocket bridge. Requires `editor install` first (defaults project to cwd, or pass `--project <path>`).

All editor commands accept `--project <path>`, `--timeout <ms>`, `--port <n>`.

## Commands

| Command | What it does |
|---------|-------------|
| `editor status` | Check bridge connection |
| `editor invoke <type> <member> [args...]` | Call/read/set static API members through reflection |
| `editor console-follow` | Stream console logs in real-time |
| `editor list` | List available CLI commands (compact by default) |
| `editor install` | Add editor bridge UPM package (`--project <path>` optional; defaults to cwd) |
| `editor uninstall` | Remove editor bridge package (`--project <path>` optional; defaults to cwd) |

## invoke

Calls or reads any public static member of any Unity Editor type loaded in the current domain.

```bash
editor invoke UnityAgenticTools.API.PlayModeAPI Enter
editor invoke UnityAgenticTools.API.PlayModeAPI GetState
editor invoke UnityAgenticTools.API.SceneAPI Open "Assets/Scenes/L1.unity" false
editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot "[2,false]"
editor invoke UnityAgenticTools.API.UIAPI Wait "[\"delay\",null,null,null,1000,200]"
editor invoke UnityEditor.AssetDatabase Refresh
```

| Option | Effect |
|--------|--------|
| `[args...]` | Positional string arguments passed to the method |
| `--args <json>` | JSON array of arguments (overrides positional args) |
| `--set <value>` | Set a writable static property instead of reading it |
| `--no-wait` | Fire-and-forget mode |

Resolution order: static property getter, then static method call. Pass args to force method resolution when names overlap.

### Built-in bridge APIs

- `UnityAgenticTools.API.PlayModeAPI` -- `Enter`, `Exit`, `Pause`, `Step`, `GetState`
- `UnityAgenticTools.API.SceneAPI` -- `Save`, `Open`
- `UnityAgenticTools.API.HierarchyAPI` -- `Snapshot`, `Query`
- `UnityAgenticTools.API.UIAPI` -- `Snapshot`, `Interact`, `Query`, `Wait`
- `UnityAgenticTools.API.InputAPI` -- `Map`, `Key`, `Mouse`, `Touch`, `Action`
- `UnityAgenticTools.API.ScreenshotAPI` -- `Take`, `Annotated`
- `UnityAgenticTools.API.TestRunnerAPI` -- `Run`, `GetResults`

## console-follow

Streams `editor.console.logReceived` events.

| Option | Effect |
|--------|--------|
| `-t, --type <type>` | Filter by log type |
| `--duration <ms>` | Auto-stop after duration (0 = indefinite) |

## list

Returns JSON command metadata.

| Option | Effect |
|--------|--------|
| `--scope <scope>` | `all` (default), `editor`, or `top` |
| `--show-options` | Include command options |
| `--show-args` | Include command arguments |
| `--show-desc` | Include command descriptions |

Examples:

```bash
editor list
editor list --scope editor
editor list --scope all --show-options --show-args --show-desc
```

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Using old commands like `editor play`/`ui-click` | Use `editor invoke UnityAgenticTools.API.<API> <Member> [args]` |
| `scene-open /abs/path` | Use `editor invoke UnityAgenticTools.API.SceneAPI Open "Assets/Scenes/Main.unity" false` |
| stale refs (`@hN`, `@uN`) | Re-run `HierarchyAPI.Snapshot` or `UIAPI.Snapshot` before querying/interacting |
