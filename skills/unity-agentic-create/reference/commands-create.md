# create command reference

Authoritative reference for `unity-agentic-tools create ...`.

All commands support `-j, --json`.

## Command matrix

| Command | Purpose |
|---------|---------|
| `create gameobject <file> [name]` | Create a GameObject in a `.unity` or `.prefab` file |
| `create scene <output_path>` | Create a new `.unity` scene |
| `create prefab-variant <source_prefab> <output_path>` | Create a prefab variant |
| `create prefab-instance <scene_file> <prefab_path>` | Instantiate prefab into a scene |
| `create scriptable-object <output_path> <script>` | Create ScriptableObject `.asset` |
| `create meta <script_path>` | Generate `.meta` for script |
| `create component <file> <object_name> <component>` | Add component to GameObject |
| `create component-copy <file> <source_file_id> <target_object_name>` | Copy component by fileID |
| `create build <scene_path>` | Add scene to build settings |
| `create material <output_path>` | Create material `.mat` |
| `create package <name> <version>` | Add package to `manifest.json` |
| `create input-actions <output_path> <name>` | Create `.inputactions` asset |
| `create animation <output_path> [name]` | Create `.anim` clip |
| `create animator <output_path> [name]` | Create `.controller` |
| `create prefab <output_path> [name]` | Create blank `.prefab` |

## Per-command usage and options

### `create gameobject <file> [name]`

- `-p, --parent <name|id>`: Parent GameObject name or Transform fileID
- `-n, --name <name>`: Explicit name override
- `--bypass-loaded-protection`: Force mutation if file is loaded in Unity Editor

Example:

```bash
unity-agentic-tools create gameobject Assets/Scenes/Main.unity "EnemyRoot" -p "Gameplay"
```

### `create scene <output_path>`

- `-d, --defaults`: Include default Main Camera and Directional Light

Example:

```bash
unity-agentic-tools create scene Assets/Scenes/NewLevel.unity --defaults
```

### `create prefab-variant <source_prefab> <output_path>`

- `-n, --name <name>`: Override variant object name

### `create prefab-instance <scene_file> <prefab_path>`

- `-n, --name <name>`: Instance object name
- `-p, --parent <name|id>`: Parent object name or Transform fileID
- `--position <x,y,z>`: Local position, default `0,0,0`
- `--bypass-loaded-protection`: Force mutation if loaded in editor

### `create scriptable-object <output_path> <script>`

- `-p, --project <path>`: Project path for script GUID/type lookup
- `--set <json>`: Initial field values

Example:

```bash
unity-agentic-tools create scriptable-object Assets/Data/Enemy.asset EnemyConfig -p . --set '{"health":"100","speed":"4.5"}'
```

### `create meta <script_path>`

No command-specific options.

### `create component <file> <object_name> <component>`

- `-p, --project <path>`: Needed for custom script resolution
- `--bypass-loaded-protection`: Force mutation if loaded in editor

Notes:
- `MonoBehaviour` base type is rejected; provide concrete script type/path/GUID.
- All-zero script GUID is rejected.
- Abstract scripts are rejected.

### `create component-copy <file> <source_file_id> <target_object_name>`

- `--bypass-loaded-protection`: Force mutation if loaded in editor

### `create build <scene_path>`

- `-p, --project <path>`: Unity project root (default cwd)
- `--index <n>`: Insert at index (0-based)

### `create material <output_path>`

- `--shader <guid>`: Shader GUID (required)
- `--shader-fileid <id>`: Shader fileID, default `4800000`
- `--name <name>`: Material name (default filename)
- `--properties <json>`: Initial property map

Example:

```bash
unity-agentic-tools create material Assets/Materials/Floor.mat --shader 6f89d95d4c6f8ff4c9d5f8f31f42631c --properties '{"floats":{"_Metallic":0.1},"colors":{"_Color":[0.8,0.8,0.8,1]}}'
```

### `create package <name> <version>`

- `-p, --project <path>`: Unity project root (default cwd)

### `create input-actions <output_path> <name>`

No command-specific options.

### `create animation <output_path> [name]`

- `--sample-rate <n>`: Clip sample rate, default `60`
- `--loop`: Enable loop time

### `create animator <output_path> [name]`

- `--layer <name>`: Initial layer, default `Base Layer`

### `create prefab <output_path> [name]`

No command-specific options.

## Safety and verification

- If Unity editor bridge is connected and target `.unity`/`.prefab` is open, add `--bypass-loaded-protection` for file-based create commands.
- Verify with:
  - `read scene <file>`
  - `read gameobject <file> <name> --properties`
  - `read build`
