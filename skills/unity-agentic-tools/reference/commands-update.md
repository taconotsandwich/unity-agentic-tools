# update -- 31 commands

- [Quick index](#quick-index)
- [Detail: non-obvious syntax](#detail-non-obvious-syntax)
- [Prefab subcommands](#prefab-subcommands)

## Quick index

| Command | What it does |
|---------|-------------|
| `update gameobject <file> <name> <prop> <value>` | Edit property by object name (`-p <project>`) |
| `update component <file> <file_id> <prop> <value>` | Edit component by fileID |
| `update transform <file> <identifier> -p x,y,z -r x,y,z -s x,y,z` | Position/rotation/scale |
| `update scriptable-object <file> <prop> <value>` | Edit first MonoBehaviour in .asset (`--file-id <id>`) |
| `update settings -s <alias> --property <p> --value <v>` | Edit setting (`--project <path>` optional; defaults to cwd) |
| `update tag add\|remove <tag>` | Add/remove tag (`--project <path>` optional; defaults to cwd) |
| `update layer <index> <name>` | Set named layer (3-31; `--project <path>` optional; defaults to cwd) |
| `update sorting-layer add\|remove <name>` | Add/remove sorting layer (`--project <path>` optional; defaults to cwd) |
| `update parent <file> <name> <new_parent>` | Reparent ("root" for scene root, `--by-id`) |
| `update build <scene>` | Enable/disable/move scene (`--enable`, `--disable`, `--move <idx>`, `--project <path>` optional; defaults to cwd) |
| `update array <file> <file_id> <array_prop> <action> [args]` | Array element operations |
| `update batch <file> <json>` | Batch edit GameObject properties |
| `update batch-components <file> <json>` | Batch edit components by fileID |
| `update material <file>` | Edit Material properties |
| `update meta [file]` | Edit .meta importer settings |
| `update animation <file>` | Edit AnimationClip settings/events (`--set`, `--add-event`, `--remove-event`) |
| `update animator <file>` | Edit parameters (`--add-parameter`, `--type`, `--remove-parameter`, `--set-default`) |
| `update sibling-index <file> <name> <index>` | Set sibling index |
| `update input-actions <file>` | Edit Input Actions |
| `update animation-curves <file>` | Add/remove/modify animation curves |
| `update animator-state <file>` | Add/remove states and transitions |
| `update managed-reference <file> <component_id> <field_path> <type_name>` | Add SerializeReference to a component field |

## Detail: non-obvious syntax

### update component

Supports dotted paths and array paths:
- Dotted: `update component file.unity 12345 m_LocalPosition.x 5`
- Array: `update component file.unity 12345 m_Materials.Array.data[0] "{fileID: 0}"`

### update transform

`<identifier>` accepts either a GameObject name or a Transform fileID.

### update material

| Flag | Format | Example |
|------|--------|---------|
| `--set` | `property=value` | `--set _Metallic=0.8` |
| `--set-color` | `property=r,g,b,a` | `--set-color _Color=1,0,0,1` |
| `--set-texture` | `property=guid` | `--set-texture _MainTex=abc123` |
| `--shader` | `guid` | `--shader def456` |
| `--keyword-add` | `keyword` | `--keyword-add _EMISSION` |
| `--keyword-remove` | `keyword` | `--keyword-remove _NORMALMAP` |

### update meta

Supports batch operations and texture shortcuts:

| Flag | Effect |
|------|--------|
| `--set <key=value>` | Set any importer setting (repeatable) |
| `--batch <glob>` | Apply to all matching files |
| `--dry-run` | Preview changes without writing |
| `--max-size <n>` | TextureImporter maxTextureSize |
| `--compression <type>` | 0=None, 1=LowQuality, 2=Normal, 3=HighQuality |
| `--filter-mode <mode>` | 0=Point, 1=Bilinear, 2=Trilinear |
| `--read-write` / `--no-read-write` | Toggle isReadable |

### update batch / update batch-components

JSON argument format:

`update batch`: `[{"object_name":"Player","property":"m_IsActive","value":"1"}]`

`update batch-components`: `[{"file_id":"12345","property":"m_Speed","value":"10"}]`

### update array

Actions: `insert <index> <value>`, `append <value>`, `remove <index>`.

Alternative: `insert <value> --index <n>`, `remove --index <n>`.

### update animation

| Flag | Format |
|------|--------|
| `--set <property=value>` | Edit clip settings (repeatable) |
| `--add-event <time,function[,data]>` | Add animation event (repeatable) |
| `--remove-event <index>` | Remove event by index |

### update animator

| Flag | Format |
|------|--------|
| `--add-parameter <name>` | Add parameter (requires `--type`) |
| `--type <float\|int\|bool\|trigger>` | Parameter type (companion to `--add-parameter`) |
| `--remove-parameter <name>` | Remove parameter |
| `--set-default <param=value>` | Set default value (repeatable) |

### update animation-curves

| Flag | Format |
|------|--------|
| `--add-curve` | JSON: `{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]}` |
| `--remove-curve` | `path:attribute` (e.g., `Body/Mesh:m_Alpha`) |
| `--set-keyframes` | JSON: `{"curve":"path:attribute","keyframes":[{"time":0,"value":10}]}` |

### update animator-state

| Flag | Format |
|------|--------|
| `--add-state <name>` | State name. Companions: `--motion <guid-or-path>`, `--layer <name>`, `--speed <n>` |
| `--remove-state <name>` | Removes state and all its transitions |
| `--add-transition <src:dst>` | Source:destination. Use `any` for AnyState source |
| `--condition <param,mode,threshold>` | Repeatable. Companion to `--add-transition` |
| `--has-exit-time` | Enable exit time. Companions: `--exit-time <n>`, `--duration <n>` |
| `--remove-transition <src:dst>` | By source:destination state names |
| `--set-default-state <name>` | Set default state in the state machine |

### update input-actions

Colon-separated format for all flags:

| Flag | Format | Example |
|------|--------|---------|
| `--add-map` | `<name>` | `--add-map Gameplay` |
| `--remove-map` | `<name>` | `--remove-map UI` |
| `--add-action` | `<map:name>` | `--add-action Gameplay:Jump` |
| `--remove-action` | `<map:name>` | `--remove-action Gameplay:Jump` |
| `--add-binding` | `<map:action:path>` | `--add-binding "Gameplay:Jump:<Keyboard>/space"` |
| `--remove-binding` | `<map:action:path>` | `--remove-binding "Gameplay:Jump:<Keyboard>/space"` |
| `--add-control-scheme` | `<name:group>` | `--add-control-scheme Keyboard:KeyboardMouse` |
| `--remove-control-scheme` | `<name>` | `--remove-control-scheme Keyboard` |

### update managed-reference

Add a `[SerializeReference]` managed reference to a component field.

| Option | Effect |
|--------|--------|
| `-p, --project <path>` | Project path for type registry lookup |
| `--append` | Append to array (do not update field rid) |
| `--properties <json>` | Initial field values: `'{"damage": "10"}'` |

Type can be `Namespace.ClassName` (registry lookup) or `Assembly Namespace.ClassName` (manual).

## Prefab subcommands

| Command | What it does |
|---------|-------------|
| `update prefab unpack <file> <instance>` | Unpack to standalone objects (`-p <project>`) |
| `update prefab override <file> <instance> <path> <value>` | Edit/add override (`--target`, `--object-reference`, `--managed-reference`) |
| `update prefab remove-override <file> <instance> <path>` | Revert to prefab default |
| `update prefab remove-component <file> <instance> <ref>` | Suppress a component |
| `update prefab restore-component <file> <instance> <ref>` | Restore suppressed component |
| `update prefab remove-gameobject <file> <instance> <ref>` | Remove a child GameObject |
| `update prefab batch-overrides <file> <instance> <json>` | Batch edit multiple property overrides |
| `update prefab managed-reference <file> <instance> <field_path> <type_name>` | Add SerializeReference to prefab override |
| `update prefab restore-gameobject <file> <instance> <ref>` | Restore removed child |

### update prefab batch-overrides

JSON format: `[{"property_path":"...","value":"...","target":"...","object_reference":"..."}]`

Accepts both `value` and `new_value` keys. Use `object_reference` or `managed_reference` instead of `value` for reference-type overrides.

### update prefab managed-reference

Add a `[SerializeReference]` managed reference as a prefab override. Auto-generates rid and creates type/data/version override entries.

| Option | Effect |
|--------|--------|
| `--target <ref>` | **(required)** Target reference (e.g., `"{fileID: 400000, guid: ..., type: 3}"`) |
| `--index <n>` | Array index (default: 0) |
| `-p, --project <path>` | Project path for type registry lookup |
