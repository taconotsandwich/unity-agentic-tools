# update command reference

Authoritative reference for `unity-agentic-tools update ...`.

All commands support `-j, --json`.

## Command matrix

| Command | Purpose |
|---------|---------|
| `update gameobject <file> <object_name> <property> <value>` | Set GameObject/Transform-level property |
| `update component <file> <file_id> <property> <value>` | Set component property by fileID |
| `update transform <file> <identifier>` | Set local pos/rot/scale |
| `update scriptable-object <file> <property> <value>` | Update ScriptableObject/MonoBehaviour fields |
| `update settings` | Update project settings |
| `update tag <action> <tag>` | Add/remove tags |
| `update layer <index> <name>` | Set layer name |
| `update sorting-layer <action> <name>` | Add/remove sorting layers |
| `update parent <file> <object_name> <new_parent>` | Reparent object |
| `update build <scene_path>` | Enable/disable/move scene in build settings |
| `update array <file> <file_id> <array_property> <action> [args...]` | Insert/append/remove array entries |
| `update batch <file> <edits_json>` | Batch object property edits |
| `update batch-components <file> <edits_json>` | Batch component edits |
| `update material <file>` | Material property and shader edits |
| `update meta [file]` | Importer/meta edits |
| `update animation <file>` | Clip settings and events |
| `update animation-curves <file>` | Curve add/remove/keyframe replace |
| `update animator <file>` | Parameter edits |
| `update animator-state <file>` | State/transition edits |
| `update sibling-index <file> <object_name> <index>` | Reorder siblings |
| `update input-actions <file>` | InputActions map/action/binding edits |
| `update managed-reference <file> <component_id> <field_path> <type_name>` | Add SerializeReference data |
| `update prefab ...` | Prefab override subcommands |

## Common options

- `--bypass-loaded-protection`: Required when editing open `.unity`/`.prefab` with editor bridge connected.
- `-p, --project <path>`: Required for settings/type/GUID resolution in several commands.

## Non-obvious formats

### `update component`

- Dotted path: `m_LocalPosition.x`
- Array path: `m_Materials.Array.data[0]`

Example:

```bash
unity-agentic-tools update component Assets/Scenes/Main.unity 12345 m_LocalPosition.x 5
```

### `update transform <file> <identifier>`

- `identifier` can be object name or Transform fileID (`--by-id`).
- Options:
  - `-p, --position <x,y,z>`
  - `-r, --rotation <x,y,z>`
  - `-s, --scale <x,y,z>`

### `update array`

Actions:
- `insert <index> <value>`
- `append <value>`
- `remove <index>`

Alternative indexed forms:
- `insert <value> --index <n>`
- `remove --index <n>`

### `update batch` and `update batch-components`

`update batch` JSON:

```json
[{"object_name":"Player","property":"m_IsActive","value":"1"}]
```

`update batch-components` JSON:

```json
[{"file_id":"12345","property":"m_Speed","value":"10"}]
```

### `update material`

- `--set <property=value>`
- `--set-color <property=r,g,b,a>`
- `--set-texture <property=guid>`
- `--shader <guid>`
- `--keyword-add <keyword>`
- `--keyword-remove <keyword>`

### `update meta [file]`

- `--set <key=value>` (repeatable)
- `--batch <glob>` for multi-file apply
- `--dry-run` preview only
- `--max-size <n>`, `--compression <type>`, `--filter-mode <mode>` texture helpers
- `--read-write` or `--no-read-write`

### `update animation`

- `--set <property=value>`
- `--add-event <time,function[,data]>`
- `--remove-event <index>`

### `update animation-curves`

- `--add-curve <json>`:

```json
{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]}
```

- `--remove-curve <path:attribute>`
- `--set-keyframes <json>`:

```json
{"curve":"Body:m_Alpha","keyframes":[{"time":0,"value":10}]}
```

### `update animator`

- `--add-parameter <name>` + `--type <float|int|bool|trigger>`
- `--remove-parameter <name>`
- `--set-default <param=value>` (repeatable)

### `update animator-state`

- `--add-state <name>` with optional `--motion`, `--layer`, `--speed`
- `--remove-state <name>`
- `--add-transition <src:dst>`
- `--condition <param,mode,threshold>` (repeatable)
- `--has-exit-time`, `--exit-time <n>`, `--duration <n>`
- `--remove-transition <src:dst>`
- `--set-default-state <name>`

### `update input-actions`

Formats:
- `--add-action <map:name>`
- `--add-binding <map:action:path>`
- `--add-control-scheme <name:group>`

### `update managed-reference`

- Type format:
  - `Namespace.ClassName` (registry lookup)
  - `Assembly Namespace.ClassName` (manual)
- Options:
  - `-p, --project <path>`
  - `--append`
  - `--properties <json>`

## Prefab subcommands

| Command | Purpose |
|---------|---------|
| `update prefab unpack <file> <prefab_instance>` | Unpack prefab instance |
| `update prefab override <file> <prefab_instance> <property_path> <value>` | Set/add override |
| `update prefab remove-override <file> <prefab_instance> <property_path>` | Remove override |
| `update prefab remove-component <file> <prefab_instance> <component_ref>` | Suppress component |
| `update prefab restore-component <file> <prefab_instance> <component_ref>` | Restore component |
| `update prefab remove-gameobject <file> <prefab_instance> <gameobject_ref>` | Remove child GO |
| `update prefab restore-gameobject <file> <prefab_instance> <gameobject_ref>` | Restore child GO |
| `update prefab batch-overrides <file> <prefab_instance> <edits_json>` | Apply many overrides |
| `update prefab managed-reference <file> <prefab_instance> <field_path> <type_name> --target <ref>` | Add SerializeReference override |

Notable prefab options:
- `--target <ref>`: required for `prefab managed-reference`, optional for disambiguation in others
- `--object-reference <ref>` and `--managed-reference <id>` on `prefab override`
- `--index <n>` default `0` for `prefab managed-reference`

## Verification checklist

After mutations, verify with one or more:
- `read gameobject <file> <name> --properties`
- `read component <file> <file_id> --properties`
- `read overrides <file> <prefab_instance>`
- `read animation <file> --curves`
- `read animator <file> --states --transitions`
