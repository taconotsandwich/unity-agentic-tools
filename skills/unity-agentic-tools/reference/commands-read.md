# read -- 21 commands

| Command | What it does |
|---------|-------------|
| `read scene <file>` | GameObject hierarchy (scenes and prefabs) |
| `read gameobject <file> <id>` | Single object by name or fileID (`-c <type>`, `--properties`) |
| `read component <file> <file_id>` | Single component by fileID |
| `read asset <file>` | Any Unity YAML asset (.asset, .mat, .anim). Mesh auto-decode (`--raw` to skip) |
| `read material <file>` | Material with structured property output |
| `read reference <file> <file_id>` | Trace fileID references |
| `read dependencies <file>` | GUIDs referenced by this file |
| `read dependents <project> <guid>` | Files referencing a GUID (reverse lookup) |
| `read unused <project>` | Assets with zero inbound GUID references |
| `read settings <project> -s <alias>` | Project settings by alias (see commands-utilities.md) |
| `read build <project>` | Build settings (scene list, build profiles) |
| `read overrides <file> <instance>` | PrefabInstance override modifications |
| `read script <file>` | C# type declarations from .cs or .NET DLL |
| `read scripts` | List C# types from registry |
| `read log` | Unity Editor.log |
| `read meta <file>` | .meta importer settings |
| `read animation <file>` | AnimationClip (.anim) |
| `read animator <file>` | AnimatorController (.controller) |
| `read manifest <project>` | Packages from manifest.json (`--search <pattern>`) |
| `read input-actions <file>` | Input Actions file (`--summary`, `--maps`, `--actions`, `--bindings`) |
| `read scriptable-object <file>` | Deprecated -- redirects to `read asset` |

## read scene

Paginated hierarchy of GameObjects in `.unity` or `.prefab` files.

| Option | Effect |
|--------|--------|
| `--summary` | Counts only, no object list (token-saving for large scenes) |
| `--properties` | Include component property values |
| `--filter-component <type>` | Only GameObjects with this component type |
| `--page-size <n>` | Objects per page (default 200, max 1000) |
| `--cursor <n>` | Pagination offset |
| `--max-depth <n>` | Hierarchy depth limit (default 10, max 50) |

## read log

Reads the Unity Editor.log with auto-detection of log path.

| Option | Effect |
|--------|--------|
| `--path <file>` | Explicit log path (auto-detected if omitted) |
| `--project <path>` | Filter to entries from a specific project session |
| `--tail <n>` | Last N lines (default 50) |
| `--errors` | Error entries only |
| `--warnings` | Warning entries only |
| `--compile-errors` | C# compilation errors only |
| `--import-errors` | Asset import errors only |
| `--since <timestamp>` | After timestamp (YYYY-MM-DD or HH:MM:SS) |
| `--search <pattern>` | Regex filter on content |

## read scripts

List C# types from the type registry. Four filtering dimensions:

| Option | Effect |
|--------|--------|
| `--name <name>` | By type name (case-insensitive substring). `--filter` is an alias |
| `--namespace <ns>` | By namespace (case-insensitive substring) |
| `--kind <kind>` | class, struct, enum, or interface |
| `--source <source>` | assets, packages, dlls, or all (default: all) |
| `--max <n>` | Maximum results (default 100) |

## read dependencies

| Option | Effect |
|--------|--------|
| `--project <path>` | Project root for GUID resolution |
| `--recursive [depth]` | Follow chain N levels deep (default 3) |
| `--unresolved` | Show only unresolvable GUIDs |

## read animator

View modes for AnimatorController files:

| Option | Effect |
|--------|--------|
| `--summary` | Parameter/layer/state/transition counts |
| `--parameters` | List parameters only |
| `--states` | List states per layer |
| `--transitions` | List transitions with conditions |
| `--project <path>` | Project root for motion clip GUID resolution |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `read prefab <file>` | Use `read scene <file>` -- handles both .unity and .prefab |
| `read scriptable-object <file>` | Deprecated. Use `read asset <file>` |
