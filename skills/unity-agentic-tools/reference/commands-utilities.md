# Top-level utilities -- 8 commands

| Command | What it does |
|---------|-------------|
| `search <file> <pattern>` | Find GameObjects by name in a file (`--exact`) |
| `search <project> -n <pattern>` | Search across project files |
| `grep <regex>` | Regex search across project files (`--project <path>` optional; defaults to cwd) |
| `clone <file> <name>` | Duplicate a GameObject and hierarchy (`-n <new_name>`, `--bypass-loaded-protection`) |
| `version` | Read Unity project version (`--project <path>` optional; defaults to cwd) |
| `docs <query>` | Search indexed Unity documentation |
| `setup` | Initialize tools (`-p <path>`, `--index-docs`) |
| `cleanup` | Remove .unity-agentic files (`--all` for full removal) |
| `status` | Show config, GUID cache count, native module status |

## Loaded edit protection

`clone` edits `.unity`/`.prefab` files, so when the editor bridge is connected and target file is loaded/open, pass `--bypass-loaded-protection` to force file-based edits.

## search

Two modes depending on whether the path is a file or directory:

**Single file**: `search <file> <pattern>` -- find GameObjects by name. `--exact` for exact match.

**Project-wide**: `search <project> -n <pattern>` -- search across scenes/prefabs.

| Filter | Effect |
|--------|--------|
| `-c <type>` | By component type |
| `-t <tag>` | By tag |
| `-l <index>` | By layer index |
| `-T <type>` | File type: scene, prefab, mat, anim, controller, asset, all (default: all) |
| `-m <n>` | Max total matches |

## grep

Regex search across project files. Default 100-result cap.

| Option | Effect |
|--------|--------|
| `--type <type>` | File filter: cs, yaml, unity, prefab, asset, all (default: all) |
| `-m <n>` | Override max results |
| `-C <n>` | Context lines around matches |

## Setting aliases

`read settings` and `update settings` accept these aliases via `-s`:

| Alias | Settings file |
|-------|--------------|
| tags, tagmanager | TagManager |
| physics, dynamics | DynamicsManager |
| quality | QualitySettings |
| time | TimeManager |
| input | InputManager |
| audio | AudioManager |
| editor | EditorSettings |
| graphics | GraphicsSettings |
| physics2d | Physics2DSettings |
| player, project | ProjectSettings |
| navmesh | NavMeshAreas |
| build, editorbuild | EditorBuildSettings |
