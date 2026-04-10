# Unity Agentic Tools

A CLI for reading and editing Unity scenes, prefabs, and assets with minimal token usage. Powered by a native Rust backend (napi-rs) for fast parsing of large files.

## Features

- **Scene Analysis** - List hierarchies, search GameObjects, inspect components with pagination
- **Prefab Support** - Inspect, create variants, unpack instances, manage overrides
- **Safe Editing** - Modify properties, transforms, components while preserving Unity's YAML format
- **Live Editor Bridge** - WebSocket connection to running Unity Editor for play mode, UI interaction, input simulation, screenshots, and console access
- **Material Editing** - Read/edit shader properties, colors, textures, keywords
- **Animation & Animator** - Read/edit AnimationClip events and AnimatorController parameters
- **Meta Files** - Read/edit importer settings with batch glob support
- **Project Settings** - Read/edit tags, layers, sorting layers, physics, quality, time, build settings
- **Build Settings** - Manage build scene list (add, remove, enable, disable, reorder)
- **Dependency Graphs** - Trace asset dependencies, find dependents, detect unused assets
- **C# Type Extraction** - Parse .cs files and .NET DLLs for type/field information
- **Project Search** - Find GameObjects across all scenes/prefabs, regex grep across project files
- **Documentation** - Auto-indexing local Unity docs with semantic search
- **Mesh Decoding** - Auto-decode Mesh hex vertex/index buffers into structured arrays (multi-stream support)
- **Fast Parsing** - Rust-powered backend (173 native tests) with parallel I/O for large projects

## Installation

### npm

```bash
npm install -g unity-agentic-tools
```

### skills

```bash
npx skills install taconotsandwich/unity-agentic-tools # See more at https://github.com/vercel-labs/skills

npx skills add "." --all -g --copy
```

Skill split (single source of truth):

- `unity-agentic-tools` -> setup, routing, read, utilities
- `unity-agentic-create` -> all `create` commands
- `unity-agentic-update` -> all `update` commands
- `unity-agentic-delete` -> all `delete` commands
- `unity-agentic-editor` -> all `editor` commands

Recommended install flow:

```bash
npx skills add "./skills/unity-agentic-tools" -g --copy
npx skills add "./skills/unity-agentic-create" -g --copy
npx skills add "./skills/unity-agentic-update" -g --copy
npx skills add "./skills/unity-agentic-delete" -g --copy
npx skills add "./skills/unity-agentic-editor" -g --copy
```

### From Source

```bash
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun install              # workspace links + dev deps
bun run build:rust       # compile native .node binary (requires Rust)
bun run build            # build TypeScript
```

## CLI Usage

Base usage:

```bash
unity-agentic-tools [options] [command]
```

Top-level command groups: `create`, `read`, `update`, `delete`, `editor`

Top-level utilities (not subcommands): `clone`, `search`, `grep`, `docs`, `version`, `setup`, `cleanup`, `status`

### Read Commands

```bash
unity-agentic-tools read scene <file>                         # GameObject hierarchy (paginated)
unity-agentic-tools read gameobject <file> <id>               # Single object by name or file ID
unity-agentic-tools read asset <file>                         # Any Unity YAML asset file (--raw to skip mesh decode)
unity-agentic-tools read material <file>                      # Structured material properties
unity-agentic-tools read settings -s tags                     # Project settings (defaults project to cwd)
unity-agentic-tools read build                                # Build scene list (defaults project to cwd)
unity-agentic-tools read dependencies <file>                  # Asset GUID dependencies
unity-agentic-tools read dependents <guid>                    # Reverse dependency lookup (defaults project to cwd)
unity-agentic-tools read unused                               # Detect unused assets (defaults project to cwd)
unity-agentic-tools read overrides <file> <prefab_instance>   # PrefabInstance overrides
unity-agentic-tools read component <file> <file_id>           # Single component by fileID
unity-agentic-tools read reference <file> <file_id>           # Trace fileID references
unity-agentic-tools read script <file>                        # C# types from .cs or DLL
unity-agentic-tools read scripts --project <path>             # List types from type registry
unity-agentic-tools read meta <file>                          # .meta importer settings
unity-agentic-tools read animation <file>                     # AnimationClip data
unity-agentic-tools read animator <file>                      # AnimatorController data
unity-agentic-tools read manifest                             # Packages from manifest.json (defaults project to cwd)
unity-agentic-tools read input-actions <file>                 # Input Actions file
```

### Create Commands

```bash
unity-agentic-tools create gameobject <file> [name]           # New GameObject
unity-agentic-tools create scene <path>                       # New .unity file
unity-agentic-tools create component <file> <name> <type>     # Add component
unity-agentic-tools create component-copy <file> <src> <tgt>  # Copy component
unity-agentic-tools create prefab-variant <source> <output>   # Prefab Variant
unity-agentic-tools create prefab-instance <scene> <prefab>   # Instantiate prefab in scene
unity-agentic-tools create scriptable-object <output> <script># ScriptableObject .asset
unity-agentic-tools create meta <script_path>                 # Generate .meta file
unity-agentic-tools create material <output>                  # New Material .mat
unity-agentic-tools create build <scene>                      # Add scene to build settings (defaults project to cwd)
unity-agentic-tools create package <name> <version>           # Add package to manifest.json (defaults project to cwd)
unity-agentic-tools create input-actions <path> <name>        # Blank .inputactions file
unity-agentic-tools create animation <path> [name]            # Blank .anim file
unity-agentic-tools create animator <path> [name]             # Blank .controller file
unity-agentic-tools create prefab <path> [name]               # Blank .prefab file
```

### Update Commands

```bash
unity-agentic-tools update gameobject <file> <name> <prop> <value>
unity-agentic-tools update component <file> <file_id> <prop> <value>
unity-agentic-tools update transform <file> <id> -p 1,2,3 -r 0,90,0
unity-agentic-tools update scriptable-object <file> <prop> <value>
unity-agentic-tools update settings -s tags --property <name> --value <val>
unity-agentic-tools update tag add MyTag
unity-agentic-tools update layer 8 MyLayer
unity-agentic-tools update sorting-layer add MyLayer
unity-agentic-tools update parent <file> <child> <new_parent>
unity-agentic-tools update build <scene> --enable|--disable|--move <n>
unity-agentic-tools update array <file> <fid> <prop> insert <idx> <val>
unity-agentic-tools update batch <file> '<edits_json>'
unity-agentic-tools update batch-components <file> '<edits_json>'
unity-agentic-tools update material <file> --set _Metallic=0.8 --keyword-add _EMISSION
unity-agentic-tools update meta <file> --set isReadable=1 --max-size 2048
unity-agentic-tools update animation <file> --set wrap-mode=2 --add-event 0.5,OnStep
unity-agentic-tools update animator <file> --add-parameter Speed --type float
unity-agentic-tools update managed-reference <file> <component_id> <field_path> <type_name>
unity-agentic-tools update sibling-index <file> <name> <index>
unity-agentic-tools update input-actions <file> --add-map MyMap
unity-agentic-tools update animation-curves <file> --add-curve '{"type":"float","path":"Body","attribute":"m_Alpha","classID":23,"keyframes":[{"time":0,"value":1}]}'
unity-agentic-tools update animator-state <file> --add-state <name>
unity-agentic-tools update prefab unpack|override|remove-override|...
```

### Delete Commands

```bash
unity-agentic-tools delete gameobject <file> <name>
unity-agentic-tools delete component <file_or_project> <component>
unity-agentic-tools delete build <scene>
unity-agentic-tools delete prefab <file> <prefab_instance>
unity-agentic-tools delete asset <file>
unity-agentic-tools delete package <name>
```

### Search & Utilities

```bash
unity-agentic-tools search <file> <pattern>                   # Find by name in file
unity-agentic-tools search <project> -n <pattern>             # Search across project
unity-agentic-tools grep <regex>                              # Regex search (defaults project to cwd)
unity-agentic-tools clone <file> <name>                       # Duplicate GameObject
unity-agentic-tools docs <query>                              # Search Unity docs
unity-agentic-tools version                                   # Unity version (defaults project to cwd)
unity-agentic-tools setup -p <project>                        # Initialize GUID cache
unity-agentic-tools cleanup -p <project>                      # Remove cached data
```

### Loaded Edit Protection

When Unity Editor bridge is connected, commands that mutate existing `.unity`/`.prefab` files are soft-blocked if the target is currently loaded/open in editor. Pass `--bypass-loaded-protection` to force file-based edits.

Applies to key mutators such as:
- `clone <file> <name>`
- `create gameobject|component|component-copy|prefab-instance`
- `update gameobject|component|transform|parent|array|batch|batch-components|sibling-index|managed-reference|prefab ...`
- `delete gameobject|component|prefab|asset`

Offline behavior is unchanged: if editor bridge is not connected, operations proceed without this check.

### Script Component Safety

- `create component ... MonoBehaviour` is rejected (base class only).
- All-zero script GUID is rejected.
- Abstract scripts are rejected for `create component` and `create scriptable-object`.

### Editor Bridge Setup

The editor commands require the C# bridge package installed in your Unity project (2021.3+).

**Via CLI:**
```bash
unity-agentic-tools editor install
```

**Via Unity Package Manager:**
Window > Package Manager > + > Add package from git URL:
```
https://github.com/taconotsandwich/unity-agentic-tools.git?path=unity-package
```

**Developers (from source):**
Copy or symlink `unity-package/` into your Unity project's `Packages/` directory for live reload when editing C# source.

The bridge starts automatically via `[InitializeOnLoad]` and writes connection info to `.unity-agentic/editor.json`.

### Editor Commands

The editor bridge now uses a compact invoke-based CLI surface.

```bash
# Core bridge commands
unity-agentic-tools editor status -p <project>                # Check bridge connection
unity-agentic-tools editor invoke <type> <member> [args...]   # Call static API/property
unity-agentic-tools editor console-follow                      # Stream logs real-time
unity-agentic-tools editor list                                # Compact command catalog
unity-agentic-tools editor install                             # Install bridge package
unity-agentic-tools editor uninstall                           # Remove bridge package

# Useful invoke examples
unity-agentic-tools editor invoke UnityAgenticTools.API.PlayModeAPI Enter
unity-agentic-tools editor invoke UnityAgenticTools.API.PlayModeAPI GetState
unity-agentic-tools editor invoke UnityAgenticTools.API.SceneAPI Open "Assets/Scenes/L1.unity" false
unity-agentic-tools editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot "[2,false]"
unity-agentic-tools editor invoke UnityAgenticTools.API.UIAPI Snapshot
unity-agentic-tools editor invoke UnityAgenticTools.API.InputAPI Map
unity-agentic-tools editor invoke UnityAgenticTools.API.ScreenshotAPI Take "[\"Temp/shot.png\",1]"
unity-agentic-tools editor invoke UnityAgenticTools.API.TestRunnerAPI Run "[\"editmode\"]"

# List commands with more detail when needed
unity-agentic-tools editor list --scope all --show-options --show-args --show-desc
```

## Project Structure

```
unity-agentic-tools/     TypeScript CLI + tests (882 unit tests)
rust-core/               Native Rust module via napi-rs (173 tests)
doc-indexer/             Documentation indexing module
unity-package/           Unity Editor bridge (C# UPM package)
```

## Development

Requires: Rust toolchain, Bun runtime.

```bash
bun run build:rust         # after Rust code changes
bun run build              # after TypeScript changes
bun run test               # unit tests (882 TS + 173 Rust)
bun run test:integration   # CLI integration tests
bun run type-check         # tsc --noEmit
```

### Testing npm package

```bash
# Dry-run to verify package contents
cd unity-agentic-tools
mkdir -p native
cp ../rust-core/index.js ../rust-core/index.d.ts ../rust-core/*.node native/
npm publish --dry-run
rm -rf native
```

## Full Command Reference (Usage + Options)

`clone` exists and is a top-level command.

### Global

- Usage: `unity-agentic-tools [options] [command]`
- Global options:
  - `-h, --help`: Show help
  - `-V, --version`: Show version

### Top-Level Utilities

- `unity-agentic-tools clone <file> <object_name> [options]`
  - `-n, --name <new_name>`: Name for duplicated object
  - `--bypass-loaded-protection`: Allow editing files currently loaded in Unity Editor
  - `-j, --json`: Output as JSON
- `unity-agentic-tools search <path> [pattern] [options]`
  - `-n, --name <pattern>`: Search by GameObject name
  - `-e, --exact`: Exact match mode
  - `-c, --component <type>`: Filter by component type
  - `-t, --tag <tag>`: Filter by tag
  - `-l, --layer <index>`: Filter by layer index
  - `-T, --type <type>`: File type filter (`scene|prefab|mat|anim|controller|asset|all`, default `all`)
  - `-m, --max-matches <n>`: Max total matches
  - `-j, --json`: Output as JSON
- `unity-agentic-tools grep <pattern> [options]`
  - `-p, --project <path>`: Unity project path (default cwd)
  - `--type <type>`: File filter (`cs|yaml|unity|prefab|asset|all`, default `all`)
  - `-m, --max <n>`: Max matches (default `100`)
  - `-C, --context <n>`: Context lines around each match (default `0`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools docs <query> [options]`
  - `-j, --json`: Output as JSON
- `unity-agentic-tools version [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools setup [options]`
  - `-p, --project <path>`: Unity project path
  - `--index-docs`: Index docs during setup
  - `-j, --json`: Output as JSON
- `unity-agentic-tools cleanup [options]`
  - `-p, --project <path>`: Unity project path
  - `--all`: Remove all cached state
  - `-j, --json`: Output as JSON
- `unity-agentic-tools status [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON

### Create

- `unity-agentic-tools create gameobject <file> [name] [options]`
  - `-p, --parent <name|id>`: Parent GameObject name or Transform fileID
  - `-n, --name <name>`: Name override
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create scene <output_path> [options]`
  - `-d, --defaults`: Include default camera/light
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create prefab-variant <source_prefab> <output_path> [options]`
  - `-n, --name <name>`: Variant name override
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create prefab-instance <scene_file> <prefab_path> [options]`
  - `-n, --name <name>`: Instance name
  - `-p, --parent <name|id>`: Parent GameObject name or Transform fileID
  - `--position <x,y,z>`: Local position (default `0,0,0`)
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create scriptable-object <output_path> <script> [options]`
  - `-p, --project <path>`: Project path for script GUID lookup
  - `--set <json>`: Initial field values JSON
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create meta <script_path> [options]`
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create component <file> <object_name> <component> [options]`
  - `-p, --project <path>`: Project path for script GUID lookup
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create component-copy <file> <source_file_id> <target_object_name> [options]`
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create build <scene_path> [options]`
  - `-p, --project <path>`: Unity project path
  - `--index <n>`: Insert at build index
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create material <output_path> [options]`
  - `--shader <guid>`: Shader GUID
  - `--shader-fileid <id>`: Shader fileID (default `4800000`)
  - `--name <name>`: Material name
  - `--properties <json>`: Initial properties JSON
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create package <name> <version> [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create input-actions <output_path> <name> [options]`
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create animation <output_path> [name] [options]`
  - `--sample-rate <n>`: Sample rate (default `60`)
  - `--loop`: Enable loop time
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create animator <output_path> [name] [options]`
  - `--layer <name>`: Initial layer (default `Base Layer`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools create prefab <output_path> [name] [options]`
  - `-j, --json`: Output as JSON

### Read

- `unity-agentic-tools read scene <file> [options]`
  - `-j, --json`: Output as JSON
  - `-p, --properties`: Include component properties
  - `-v, --verbose`: Show internal Unity IDs
  - `--page-size <n>`: Max objects per page (default `200`)
  - `--cursor <n>`: Pagination offset (default `0`)
  - `--max-depth <n>`: Max hierarchy depth (default `10`)
  - `--summary`: Counts-only summary
  - `--filter-component <type>`: Filter by component type
- `unity-agentic-tools read gameobject <file> <object_id> [options]`
  - `-c, --component <type>`: Return one component type
  - `-p, --properties`: Include properties
  - `-j, --json`: Output as JSON
  - `-v, --verbose`: Show internal IDs
- `unity-agentic-tools read asset <file> [options]`
  - `-p, --properties`: Include object properties
  - `--raw`: Output raw mesh hex
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read material <file> [options]`
  - `--project <path>`: Project root for GUID resolution
  - `--summary`: Summary output only
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read dependencies <file> [options]`
  - `--project <path>`: Project root for GUID resolution
  - `--unresolved`: Only unresolved GUIDs
  - `--recursive [depth]`: Traverse dependency chain (default depth `3`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read settings [options]`
  - `-p, --project <path>`: Unity project path
  - `-s, --setting <name>`: Setting/alias (default `TagManager`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read build [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read scenes [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read overrides <file> <prefab_instance> [options]`
  - `--flat`: Simplified override output
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read component <file> <file_id> [options]`
  - `-p, --properties`: Include component properties
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read reference <file> <file_id> [options]`
  - `--direction <dir>`: `in|out|both` (default `both`)
  - `--depth <n>`: Max traversal depth (default `3`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read target <file> <gameobject_name> [component_type] [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read script <file> [options]`
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read scripts [options]`
  - `--project <path>`: Project root (default `.`)
  - `--name <name>`: Filter by type name
  - `--filter <name>`: Alias for `--name`
  - `--namespace <ns>`: Filter by namespace
  - `--kind <kind>`: `class|struct|enum|interface`
  - `--source <source>`: `assets|packages|dlls|all` (default `all`)
  - `--max <n>`: Max results (default `100`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read meta <file> [options]`
  - `--summary`: Importer summary only
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read animation <file> [options]`
  - `--summary`: Name/duration/count summary
  - `--paths`: Animated paths only
  - `--curves`: Full keyframe data
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read animator <file> [options]`
  - `--project <path>`: Project root for motion GUID resolution
  - `--summary`: Count summary
  - `--parameters`: Parameters only
  - `--states`: States only
  - `--transitions`: Transitions only
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read dependents <guid> [options]`
  - `-p, --project <path>`: Unity project path
  - `--type <type>`: File type filter
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read unused [options]`
  - `-p, --project <path>`: Unity project path
  - `--type <type>`: Asset type filter
  - `--ignore <glob>`: Ignore path pattern
  - `--max <n>`: Max results (default `200`)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read manifest [options]`
  - `-p, --project <path>`: Unity project path
  - `--search <pattern>`: Package name filter
  - `-j, --json`: Output as JSON
- `unity-agentic-tools read input-actions <file> [options]`
  - `--summary`: Summary counts only
  - `--maps`: Maps only
  - `--actions`: Actions only
  - `--bindings`: Bindings only
  - `-j, --json`: Output as JSON

### Update

- `unity-agentic-tools update gameobject <file> <object_name> <property> <value> [options]`
  - `-j, --json`: Output as JSON
  - `-p, --project <path>`: Project path for validation
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update component <file> <file_id> <property> <value> [options]`
  - `-j, --json`: Output as JSON
  - `-p, --project <path>`: Project path for reference resolution
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update transform <file> <identifier> [options]`
  - `-p, --position <x,y,z>`: Set local position
  - `-r, --rotation <x,y,z>`: Set local rotation
  - `-s, --scale <x,y,z>`: Set local scale
  - `--by-id`: Treat identifier as fileID
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update scriptable-object <file> <property> <value> [options]`
  - `--file-id <id>`: Target a specific object block
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update settings [options]`
  - `-p, --project <path>`: Unity project path
  - `-s, --setting <name>`: Setting name/alias
  - `--property <name>`: Property to edit
  - `--value <value>`: New value
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update tag <action> <tag> [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update layer <index> <name> [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update sorting-layer <action> <name> [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update parent <file> <object_name> <new_parent> [options]`
  - `-j, --json`: Output as JSON
  - `--by-id`: Treat identifiers as fileIDs
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update build <scene_path> [options]`
  - `-p, --project <path>`: Unity project path
  - `--enable`: Enable scene
  - `--disable`: Disable scene
  - `--move <index>`: Move scene to index
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update array <file> <file_id> <array_property> <action> [args...] [options]`
  - `--index <n>`: Index for insert/remove
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update batch <file> <edits_json> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update batch-components <file> <edits_json> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update material <file> [options]`
  - `--set <property=value>`: Set property (repeatable)
  - `--set-color <property=r,g,b,a>`: Set color (repeatable)
  - `--set-texture <property=guid>`: Set texture GUID
  - `--shader <guid>`: Change shader GUID
  - `--keyword-add <keyword>`: Add keyword (repeatable)
  - `--keyword-remove <keyword>`: Remove keyword (repeatable)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update meta [file] [options]`
  - `--set <key=value>`: Set importer key (repeatable)
  - `--max-size <n>`: Set TextureImporter max size
  - `--compression <type>`: Set texture compression mode
  - `--filter-mode <mode>`: Set filter mode
  - `--read-write`: Enable isReadable
  - `--no-read-write`: Disable isReadable
  - `--batch <glob>`: Apply to matching files
  - `--dry-run`: Preview changes without writing
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update animation <file> [options]`
  - `--set <property=value>`: Set clip property (repeatable)
  - `--add-event <time,function[,data]>`: Add event (repeatable)
  - `--remove-event <index>`: Remove event by index
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update animation-curves <file> [options]`
  - `--add-curve <json>`: Add curve spec JSON
  - `--remove-curve <spec>`: Remove curve by `path:attribute`
  - `--set-keyframes <json>`: Replace keyframes for one curve
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update animator <file> [options]`
  - `--add-parameter <name>`: Add parameter
  - `--type <float|int|bool|trigger>`: Parameter type for add
  - `--remove-parameter <name>`: Remove parameter
  - `--set-default <param=value>`: Set default values (repeatable)
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update animator-state <file> [options]`
  - `--add-state <name>`: Add state
  - `--motion <guid-or-path>`: Motion for added state
  - `--layer <name>`: Target layer name
  - `--speed <n>`: State speed
  - `--remove-state <name>`: Remove state and related transitions
  - `--add-transition <src:dst>`: Add transition
  - `--condition <param,mode,threshold>`: Transition condition (repeatable)
  - `--has-exit-time`: Enable exit time
  - `--exit-time <n>`: Exit time value
  - `--duration <n>`: Transition duration
  - `--remove-transition <src:dst>`: Remove transition
  - `--set-default-state <name>`: Set default state
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update sibling-index <file> <object_name> <index> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update input-actions <file> [options]`
  - `--add-map <name>`: Add action map
  - `--remove-map <name>`: Remove action map
  - `--add-action <map:name>`: Add action to map
  - `--remove-action <map:name>`: Remove action from map
  - `--add-binding <map:action:path>`: Add binding
  - `--remove-binding <map:action:path>`: Remove binding
  - `--add-control-scheme <name:group>`: Add control scheme
  - `--remove-control-scheme <name>`: Remove control scheme
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update managed-reference <file> <component_id> <field_path> <type_name> [options]`
  - `-p, --project <path>`: Project path for type registry
  - `--append`: Append mode for arrays
  - `--properties <json>`: Initial data fields JSON
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files

#### Update Prefab

- `unity-agentic-tools update prefab unpack <file> <prefab_instance> [options]`
  - `-p, --project <path>`: Project path for GUID lookup
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab override <file> <prefab_instance> <property_path> <value> [options]`
  - `--object-reference <ref>`: Object reference override value
  - `--managed-reference <id>`: Managed-reference override ID
  - `--target <target>`: Explicit target reference
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab batch-overrides <file> <prefab_instance> <edits_json> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab managed-reference <file> <prefab_instance> <field_path> <type_name> --target <ref> [options]`
  - `--target <ref>`: Required target reference
  - `--index <n>`: Array index (default `0`)
  - `-p, --project <path>`: Project path for type registry
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab remove-override <file> <prefab_instance> <property_path> [options]`
  - `--target <ref>`: Target disambiguation
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab remove-component <file> <prefab_instance> <component_ref> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab restore-component <file> <prefab_instance> <component_ref> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab remove-gameobject <file> <prefab_instance> <gameobject_ref> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files
- `unity-agentic-tools update prefab restore-gameobject <file> <prefab_instance> <gameobject_ref> [options]`
  - `-j, --json`: Output as JSON
  - `--bypass-loaded-protection`: Allow editing loaded files

### Delete

- `unity-agentic-tools delete gameobject <file> <object_name> [options]`
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools delete component <file_or_project> <component> [options]`
  - `--on <game_object>`: Limit delete to one GameObject
  - `-p, --project <path>`: Project path
  - `--all`: Project-wide delete mode
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools delete build <scene_path> [options]`
  - `-p, --project <path>`: Project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools delete prefab <file> <prefab_instance> [options]`
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools delete asset <file> [options]`
  - `--bypass-loaded-protection`: Allow editing loaded files
  - `-j, --json`: Output as JSON
- `unity-agentic-tools delete package <name> [options]`
  - `-p, --project <path>`: Project path
  - `-j, --json`: Output as JSON

### Editor

- Base usage: `unity-agentic-tools editor [options] <subcommand>`
- Base options:
  - `-p, --project <path>`: Unity project path (default cwd)
  - `--timeout <ms>`: WebSocket timeout (default `10000`)
  - `--port <n>`: Override bridge port
- `unity-agentic-tools editor status`
  - No subcommand-specific options
- `unity-agentic-tools editor invoke <type> <member> [args...] [options]`
  - `--set <value>`: Set static property value
  - `--args <json>`: JSON arguments array
  - `--no-wait`: Return immediately
- `unity-agentic-tools editor console-follow [options]`
  - `-t, --type <type>`: Filter by log type
  - `--duration <ms>`: Stop after duration (`0` means no limit)
- `unity-agentic-tools editor list [options]`
  - `--scope <scope>`: `all|editor|top` (default `all`)
  - `--show-options`: Show options metadata
  - `--show-args`: Show positional args metadata
  - `--show-desc`: Show descriptions
- `unity-agentic-tools editor install [options]`
  - `-p, --project <path>`: Unity project path
- `unity-agentic-tools editor uninstall [options]`
  - `-p, --project <path>`: Unity project path

## License

Apache-2.0
