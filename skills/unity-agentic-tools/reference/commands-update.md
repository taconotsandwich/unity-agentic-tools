# update command reference

Authoritative reference for `unity-agentic-tools update ...` operations that do not require a reachable live editor bridge.

This reference covers only non-editor-dependent update operations.
Top-level `update` is limited to small in-place value edits. Scene/prefab mutation moved to `unity-agentic-tools editor invoke UnityAgenticTools.Update.* ...` under `unity-agentic-editor`.

All top-level update commands support `-j, --json`.

## Command matrix

| Command | Purpose |
|---------|---------|
| `update scriptable-object <file> <property> <value>` | Update ScriptableObject/MonoBehaviour fields |
| `update settings` | Update project settings |
| `update layer <index> <name>` | Set layer name |
| `update material <file>` | Material property and shader/reference edits |
| `update meta [file]` | Importer/meta edits |
| `update animation <file>` | Clip settings |
| `update animator <file>` | Parameter default-value edits |

## Common notes

### `update scriptable-object <file> <property> <value>`

- `--file-id <id>`: Target a specific block by file ID instead of the first object

### `update settings`

- `-p, --project <path>`
- `-s, --setting <name>`
- `--property <name>`
- `--value <value>`

### `update material <file>`

- `--set <property=value>`
- `--set-color <property=r,g,b,a>`
- `--set-texture <property=guid>`
- `--shader <guid>`

### `update meta [file]`

- `--set <key=value>` (repeatable)
- `--batch <glob>`
- `--dry-run`
- `--max-size <n>`
- `--compression <type>`
- `--filter-mode <mode>`
- `--read-write` / `--no-read-write`

### `update animation`

- `--set <property=value>`

### `update animator`

- `--set-default <param=value>` (repeatable)

## Verification checklist

- `read asset <file>`
- `read animation <file> --curves`
- `read animator <file> --states --transitions`
- `read build`
- For scene/prefab mutations, switch to `unity-agentic-editor` and use `UnityAgenticTools.Update.*`
