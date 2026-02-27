# update -- Modify properties, transforms, settings (28 commands)

- [Core update commands](#core-update-commands)
- [Prefab subcommands](#prefab-subcommands)

## Core update commands

| Command | Usage |
|---------|-------|
| `update gameobject <file> <name> <prop> <value>` | Edit property by object name |
| `update component <file> <file_id> <prop> <value>` | Edit any component by file ID (supports dotted paths, array paths) |
| `update transform <file> <id> -p x,y,z -r x,y,z -s x,y,z` | Edit position/rotation/scale |
| `update scriptable-object <file> <prop> <value>` | Edit first MonoBehaviour in .asset file |
| `update settings <project> -s <name> --property <p> --value <v>` | Edit setting property |
| `update tag <project> add\|remove <tag>` | Add/remove tag |
| `update layer <project> <index> <name>` | Set named layer (3-31) |
| `update sorting-layer <project> add\|remove <name>` | Add/remove sorting layer |
| `update parent <file> <name> <new_parent>` | Move under new parent ("root" for scene root) |
| `update build <project> <scene>` | Enable (`--enable`), disable (`--disable`), or move (`--move <idx>`) scene |
| `update array <file> <file_id> <array_prop> <action> [args]` | Insert, append, or remove array elements in a component |
| `update batch <file> <edits_json>` | Batch edit multiple GameObject properties. JSON: `[{"object_name":"...","property":"...","value":"..."}]` |
| `update batch-components <file> <edits_json>` | Batch edit multiple component properties by fileID |
| `update material <file>` | Edit Material properties (`--set`, `--set-color`, `--set-texture`, `--shader`, `--keyword-add`, `--keyword-remove`) |
| `update meta <file>` | Edit .meta file importer settings |
| `update animation <file>` | Edit AnimationClip settings and events |
| `update animator <file>` | Edit AnimatorController parameters |
| `update sibling-index <file> <name> <index>` | Set sibling index of a GameObject, renumbering siblings |
| `update input-actions <file>` | Edit Input Actions (add/remove maps, actions, bindings, control schemes) |
| `update animation-curves <file>` | Add, remove, or modify animation curves (`--add-curve`, `--remove-curve`, `--set-keyframes`) |
| `update animator-state <file>` | Add/remove states and transitions (`--add-state`, `--remove-state`, `--add-transition`, `--remove-transition`) |

## Prefab subcommands

| Command | Usage |
|---------|-------|
| `update prefab unpack <file> <instance>` | Unpack PrefabInstance to standalone objects |
| `update prefab override <file> <instance> <path> <value>` | Edit/add property override |
| `update prefab remove-override <file> <instance> <path>` | Remove property override |
| `update prefab remove-component <file> <instance> <ref>` | Remove a component from prefab |
| `update prefab restore-component <file> <instance> <ref>` | Restore a removed component |
| `update prefab remove-gameobject <file> <instance> <ref>` | Remove a GameObject from prefab |
| `update prefab restore-gameobject <file> <instance> <ref>` | Restore a removed GameObject |
