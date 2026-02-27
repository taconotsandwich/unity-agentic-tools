# Top-level utilities (8 commands)

- [Commands](#commands)
- [Setting aliases](#setting-aliases)

## Commands

| Command | Usage |
|---------|-------|
| `search <file> <pattern>` | Find GameObjects by name in a file (`--exact` for exact match) |
| `search <project> -n <pattern>` | Search across scenes/prefabs (`-c`, `-t`, `-l` filters, `-T <type>` file type, `-m <n>` max matches) |
| `grep <project> <regex>` | Regex search across project files (`--type cs\|yaml\|unity\|prefab\|asset\|mat\|anim\|controller\|all`, `-m <n>` overrides default 100-result cap) |
| `clone <file> <name>` | Duplicate a GameObject and its hierarchy (`-n <new_name>`) |
| `version <project>` | Read Unity project version |
| `docs <query>` | Search Unity docs (auto-indexes on first use) |
| `setup` | Initialize tools for Unity project (`-p <path>`, `--index-docs`) |
| `cleanup` | Remove .unity-agentic files (`--all` for full removal) |
| `status` | Show config, GUID cache count, native module status |

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
