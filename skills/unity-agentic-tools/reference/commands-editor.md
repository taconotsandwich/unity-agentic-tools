# editor -- 37 commands

Live Unity Editor integration via WebSocket bridge. Requires `editor install <project>` first.

All editor commands accept `--project <path>`, `--timeout <ms>`, `--port <n>`.

- [Discovery and snapshots](#discovery-and-snapshots)
- [State queries](#state-queries)
- [UI interaction](#ui-interaction)
- [Input simulation](#input-simulation)
- [Observation](#observation)
- [Play mode and console](#play-mode-and-console)
- [Scene and asset management](#scene-and-asset-management)
- [Package management](#package-management)

## Discovery and snapshots

| Command | What it does |
|---------|-------------|
| `editor hierarchy-snapshot` | Scene hierarchy with `@hN` refs |
| `editor ui-snapshot` | Interactive UI elements with `@uN` refs |
| `editor input-map` | List input actions (Input System) + legacy axes |

### hierarchy-snapshot / ui-snapshot

Snapshots register compact refs: `@hN` (hierarchy) and `@uN` (UI elements).

- `hierarchy-snapshot` options: `--max-depth <n>` (default 99), `--include-inactive`
- `@hN` refs work with: `get active`, `get position`, `get component`
- `@uN` refs work with: `get text`, `get value`, plus all `ui-*` commands

Refs invalidate on: scene change, play mode transition, domain reload. Re-snapshot to refresh.

## State queries

| Command | What it does |
|---------|-------------|
| `editor get text <ref>` | Text content of a UI element (`@uN`) |
| `editor get value <ref>` | Current value: slider, toggle, input, dropdown (`@uN`) |
| `editor get active <ref>` | Is GameObject active? (`@hN` or `@uN`) |
| `editor get position <ref>` | World/local position, rotation, scale (`@hN`) |
| `editor get component <ref> [type]` | Component properties (type optional, lists types if omitted) |

## UI interaction

| Command | What it does |
|---------|-------------|
| `editor ui-click <ref>` | Click a Button |
| `editor ui-fill <ref> <text>` | Clear + type into InputField |
| `editor ui-type <ref> <text>` | Append text (no clear) |
| `editor ui-toggle <ref>` | Toggle a Toggle |
| `editor ui-slider <ref> <value>` | Set Slider value |
| `editor ui-select <ref> <option>` | Select Dropdown by label (`--index` for by-index) |
| `editor ui-scroll <ref> <dir> [amount]` | Scroll (up/down/left/right) |
| `editor ui-focus <ref>` | Focus a UI element |

## Input simulation

Requires Input System package. Legacy Input is read-only.

| Command | What it does |
|---------|-------------|
| `editor input-key <key> [mode]` | Keyboard (mode: press\|hold\|down\|up) |
| `editor input-mouse <x> <y> [mode]` | Mouse (mode: click\|move\|down\|up) |
| `editor input-touch <x> <y> [mode]` | Touch (mode: tap\|hold\|swipe) |
| `editor input-action <name> [value]` | Trigger Input System action |

## Observation

| Command | What it does |
|---------|-------------|
| `editor screenshot` | Capture game view (`-o <path>`, `--super-size 1-4`) |
| `editor wait` | Wait for a condition or delay |

### screenshot

`--annotate` composites numbered pixel-art labels onto the screenshot and returns element refs. Useful for visual reference of UI layout.

### wait

Six condition variants plus plain delay:

| Variant | Usage |
|---------|-------|
| `editor wait <ms>` | Plain delay |
| `editor wait --scene <name>` | Scene loaded |
| `editor wait --ui <ref>` | UI element active |
| `editor wait --ui-gone <ref>` | UI element deactivated |
| `editor wait --log <text>` | Log message matching text |
| `editor wait --compile` | Compilation finished |

All variants accept `--timeout <ms>` (default 10000).

## Play mode and console

| Command | What it does |
|---------|-------------|
| `editor status` | Check bridge connection |
| `editor play` / `stop` / `pause` / `step` | Play mode control |
| `editor play-state` | Current state (Playing/Paused/Stopped) |
| `editor console-logs` | Recent log entries (`-c <n>`, `-t <type>`) |
| `editor console-clear` | Clear console |
| `editor console-follow` | Stream logs real-time (`-t <type>`, `--duration <ms>`) |

### console-logs / console-follow

| Option | Effect |
|--------|--------|
| `-c, --count <n>` | Number of entries (console-logs, default 50) |
| `-t, --type <type>` | Filter: Log, Warning, Error, Assert, Exception |
| `--duration <ms>` | Auto-stop after duration (console-follow, 0 = indefinite) |

## Scene and asset management

| Command | What it does |
|---------|-------------|
| `editor save` | Save current scene |
| `editor scene-open <path>` | Open scene (`--additive` for additive mode) |
| `editor tests-run` | Run Unity tests (`--mode`, `--filter`) |
| `editor invoke <type> <member> [args...]` | Call any static Unity Editor API method or property |

### invoke

Calls or reads any public static member of any Unity Editor type loaded in the current domain.

```
editor invoke UnityEditor.AssetDatabase Refresh
editor invoke UnityEditor.EditorApplication isCompiling
editor invoke UnityEditor.EditorApplication ExecuteMenuItem "File/Save"
editor invoke MyCompany.Tools.LevelBuilder GenerateNavMesh
```

| Option | Effect |
|--------|--------|
| `[args...]` | Positional string arguments passed to the method |
| `--args <json>` | JSON array of arguments (overrides positional args) |
| `--set <value>` | Set a writable static property instead of reading it |

**Resolution order:** property getter → method call. Pass args to force method resolution even if a same-named property exists.

## Package management

| Command | What it does |
|---------|-------------|
| `editor install <project>` | Add editor bridge UPM package |
| `editor uninstall <project>` | Remove editor bridge package |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `get text @hN` | `@hN` = hierarchy ref. `get text`/`get value` need `@uN` from `ui-snapshot` |
| `scene-open /abs/path` | Use Assets-relative: `scene-open Assets/Scenes/Main.unity` |
| `wait --timeout 2000` (no condition) | `--timeout` is a ceiling, not a wait. Use `wait 2000` for delay |
