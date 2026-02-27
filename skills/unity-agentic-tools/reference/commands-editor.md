# editor -- Live Unity Editor integration (49 commands)

Requires editor bridge package installed in Unity project. Connect via `editor install <project>`.

- [Discovery](#discovery)
- [State queries](#state-queries)
- [UI interaction](#ui-interaction)
- [Input simulation](#input-simulation)
- [Observation](#observation)
- [Play mode, console, assets](#play-mode-console-assets)

## Discovery

Snapshot interactive state with compact refs.

| Command | Usage |
|---------|-------|
| `editor hierarchy-snapshot` | Scene hierarchy with `@hN` refs (`--max-depth`, `--include-inactive`) |
| `editor ui-snapshot` | Interactive UI elements with `@uN` refs (walks uGUI + UI Toolkit) |
| `editor input-map` | List all input actions (Input System) + legacy axes |

## State queries

Query by ref from snapshots.

| Command | Usage |
|---------|-------|
| `editor get text <ref>` | Get text content of a UI element |
| `editor get value <ref>` | Get current value (slider, toggle, input field, dropdown) |
| `editor get active <ref>` | Is GameObject active? |
| `editor get position <ref>` | Transform world position, local position, rotation, scale |
| `editor get component <ref> <type>` | Read component property values by type name |

## UI interaction

Interact by ref.

| Command | Usage |
|---------|-------|
| `editor ui-click <ref>` | Click a Button |
| `editor ui-fill <ref> <text>` | Clear + type into InputField/TextField |
| `editor ui-type <ref> <text>` | Append text to InputField (no clear) |
| `editor ui-toggle <ref>` | Toggle a Toggle |
| `editor ui-slider <ref> <value>` | Set Slider value |
| `editor ui-select <ref> <option>` | Select Dropdown option by label (`--index` for by-index) |
| `editor ui-scroll <ref> <dir> [amount]` | Scroll a ScrollRect/ScrollView (up/down/left/right) |
| `editor ui-focus <ref>` | Focus a UI element |

## Input simulation

Requires Input System package for key/mouse/touch/action.

| Command | Usage |
|---------|-------|
| `editor input-key <key> [mode]` | Keyboard input (mode: press\|hold\|down\|up) |
| `editor input-mouse <x> <y> [mode]` | Mouse at screen coords (mode: click\|move\|down\|up) |
| `editor input-touch <x> <y> [mode]` | Touch simulation (mode: tap\|hold\|swipe) |
| `editor input-action <name> [value]` | Trigger Input System action by name |

## Observation

| Command | Usage |
|---------|-------|
| `editor screenshot` | Capture game view (`-o <path>`, `--super-size`, `--annotate` for numbered UI labels with refs) |
| `editor wait --scene <name>` | Wait for scene to load |
| `editor wait --ui <ref>` | Wait for UI element to become active |
| `editor wait --ui-gone <ref>` | Wait for element to deactivate |
| `editor wait --log <text>` | Wait for log message matching text |
| `editor wait --compile` | Wait for compilation to finish |
| `editor wait <ms>` | Wait N milliseconds |

## Play mode, console, assets

| Command | Usage |
|---------|-------|
| `editor status` | Check bridge connection |
| `editor play` / `stop` / `pause` / `step` | Play mode control |
| `editor play-state` | Get current state (Playing/Paused/Stopped) |
| `editor save` / `scene-open <path>` / `active-scene` | Scene management |
| `editor refresh` / `compiling` | AssetDatabase |
| `editor selection-get` / `selection-set <ids>` / `selection-clear` | Editor selection |
| `editor console-logs` / `console-clear` / `console-follow` | Console access |
| `editor menu <path>` | Execute a Unity menu item |
| `editor tests-run` | Run Unity tests (`--mode`, `--filter`) |
| `editor install <project>` / `uninstall <project>` | Package management |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `editor log` | Use `editor console-logs` (live bridge) or `read log` (disk file) |
| `editor get text @hN` | `@hN` is hierarchy ref; `get text`/`get value` need UI refs (`@uN`). Use `get position`/`get active`/`get component` for hierarchy refs |
| `editor get component @hN` (no type) | Type is required: `editor get component @hN Rigidbody`. Run `hierarchy-snapshot` to see types |
| `editor console-logs --limit 10` | `--limit` works (alias for `--count`/`-c`), but `--count` is canonical |
| `editor wait --timeout 2000` (no condition) | `--timeout` sets the ceiling, not the wait. Use `editor wait 2000` for delay, or add a condition |
| `editor scene-open /abs/path/Scene.unity` | Use Assets-relative path: `editor scene-open Assets/Scenes/Scene.unity`. Run `editor refresh` for new scenes |
