# delete command reference

Authoritative reference for `unity-agentic-tools delete ...`.

All commands support `-j, --json`.

## Command matrix

| Command | Purpose |
|---------|---------|
| `delete gameobject <file> <object_name>` | Delete a GameObject and descendants |
| `delete component <file_or_project> <component>` | Delete component from one or many objects |
| `delete build <scene_path>` | Remove scene from build settings |
| `delete prefab <file> <prefab_instance>` | Delete PrefabInstance and related stripped/added records |
| `delete asset <file>` | Delete asset and `.meta` sidecar |
| `delete package <name>` | Remove package from `manifest.json` |

## Per-command options

### `delete gameobject <file> <object_name>`

- `--bypass-loaded-protection`: Force mutation if target file is loaded in editor

### `delete component <file_or_project> <component>`

- `--on <game_object>`: limit deletion scope to one object
- `-p, --project <path>`: project root for script/component lookup
- `--all`: project-wide mode where `file_or_project` is treated as root
- `--bypass-loaded-protection`: force mutation if loaded in editor

### `delete build <scene_path>`

- `-p, --project <path>`: Unity project root (default cwd)

### `delete prefab <file> <prefab_instance>`

- `--bypass-loaded-protection`: force mutation if loaded in editor

### `delete asset <file>`

- `--bypass-loaded-protection`: force mutation if loaded in editor

Behavior:
- deletes target asset file
- attempts to delete sidecar `.meta`
- missing `.meta` returns warning but command remains successful

### `delete package <name>`

- `-p, --project <path>`: Unity project root (default cwd)

## Safety and verification

- If editor bridge is connected and `.unity`/`.prefab` target is open, add `--bypass-loaded-protection`.
- Verify with:
  - `read scene <file>` / `read gameobject <file> <name>`
  - `read component <file> <file_id>`
  - `read build`
  - `read manifest`
