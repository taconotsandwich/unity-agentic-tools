# Unity Agentic Tools

A CLI for reading and editing Unity scenes, prefabs, and assets with minimal token usage. Powered by a native Rust backend (napi-rs) for fast parsing of large files.

## Features

- **Scene Analysis** - List hierarchies, search GameObjects, inspect components with pagination
- **Prefab Support** - Inspect prefab data, create variants through the editor bridge, unpack instances, manage overrides
- **Safe Editing** - Modify in-place property values while preserving Unity's YAML format
- **Live Editor Bridge** - WebSocket connection to running Unity Editor for play mode, UI interaction, input simulation, screenshots, and console access
- **Material Editing** - Read/edit shader properties, colors, textures, and shader references
- **Animation & Animator** - Read/edit AnimationClip and AnimatorController value fields
- **Meta Files** - Read/edit importer settings with batch glob support
- **Project Settings** - Read/edit selected project settings, importer values, and named layer slots
- **Build Settings** - Inspect and prune build scene lists; create and structural changes use the editor bridge
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

- `unity-agentic-tools` -> everything that does not require a reachable live editor bridge
- `unity-agentic-editor` -> everything that does require a reachable live editor bridge, plus the `editor` command group itself

Recommended install flow:

```bash
npx skills add "./skills/unity-agentic-tools" -g --copy
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

Top-level command groups: `read`, `update`, `delete`, `editor`

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

### Editor Create Commands

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Scene --args '["Assets/Scenes/NewLevel.unity","false"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabVariant --args '["Assets/Prefabs/Base.prefab","Assets/Prefabs/BaseVariant.prefab","Base Variant"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets ScriptableObject --args '["Assets/Data/Enemy.asset","EnemyConfig","{\"health\":100}"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Meta --args '["Assets/Scripts/TestScript.cs"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Material --args '["Assets/Materials/Floor.mat","0000000000000000f000000000000000","Floor"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Build --args '["Assets/Scenes/Main.unity","0"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Package --args '["com.unity.cinemachine","2.9.7"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets InputActions --args '["Assets/Input/NewActions.inputactions","NewActions"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animation --args '["Assets/Animations/New.anim","NewAnim","60","true"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animator --args '["Assets/Animators/New.controller","NewController","Base Layer"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs Prefab --args '["Assets/Prefabs/Enemy.prefab","Enemy"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes GameObject --args '["Assets/Scenes/Main.unity","EnemyRoot","Gameplay"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Component --args '["Assets/Scenes/Main.unity","EnemyRoot","BoxCollider"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes ComponentCopy --args '["Assets/Scenes/Main.unity","Templates/Enemy","BoxCollider","0","EnemyRoot"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabInstance --args '["Assets/Scenes/Boot.unity","Assets/Prefabs/AppRoot.prefab","","AppRoot","0","0","0"]'
```

### Update Commands

```bash
unity-agentic-tools update scriptable-object <file> <prop> <value>
unity-agentic-tools update settings -s tags --property <name> --value <val>
unity-agentic-tools update layer 8 MyLayer
unity-agentic-tools update material <file> --set _Metallic=0.8 --set-color _Color=1,0.8,0.2,1
unity-agentic-tools update meta <file> --set isReadable=1 --max-size 2048
unity-agentic-tools update animation <file> --set wrap-mode=2
unity-agentic-tools update animator <file> --set-default Speed=1.5
```

### Editor-Only Scene / Prefab Mutations

```bash
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes GameObject --args '["Assets/Scenes/Main.unity","EnemyRoot","Gameplay"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Component --args '["Assets/Scenes/Main.unity","Player","BoxCollider"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes ComponentCopy --args '["Assets/Scenes/Main.unity","Main Camera","Camera","0","Player"]'
unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabInstance --args '["Assets/Scenes/Boot.unity","Assets/Prefabs/AppRoot.prefab"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Transform --args '["Assets/Scenes/Main.unity","Player","1,2,3","0,90,0","1,1,1"]'
unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized BatchComponents --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]'
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
- `delete gameobject|component|prefab|asset`

All create operations now live under `editor invoke UnityAgenticTools.Create.* ...`. Scene/prefab mutation updates live under `UnityAgenticTools.Update.* ...`.

If editor bridge is not connected, the remaining file-based operations proceed without this check. `editor invoke UnityAgenticTools.Create.* ...` and `UnityAgenticTools.Update.* ...` still require a reachable bridge.

### Script Component Safety

- All-zero script GUID is rejected.
- Abstract scripts are rejected for `UnityAgenticTools.Create.Assets ScriptableObject`.

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
unity-agentic-tools editor invoke UnityAgenticTools.Util.PlayMode Enter
unity-agentic-tools editor invoke UnityAgenticTools.Util.PlayMode GetState
unity-agentic-tools editor invoke UnityAgenticTools.Util.Scene Open "Assets/Scenes/L1.unity" false
unity-agentic-tools editor invoke UnityAgenticTools.Util.Hierarchy Snapshot "[2,false]"
unity-agentic-tools editor invoke UnityAgenticTools.Util.UI Snapshot
unity-agentic-tools editor invoke UnityAgenticTools.Util.Input Map
unity-agentic-tools editor invoke UnityAgenticTools.Util.Screenshot Take "[\"Temp/shot.png\",1]"
unity-agentic-tools editor invoke UnityAgenticTools.Util.TestRunner Run "[\"editmode\"]"

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

Top-level `update` is intentionally limited to small in-place value edits. Structural edits and all create operations use `editor invoke`.

- `unity-agentic-tools update scriptable-object <file> <property> <value> [options]`
  - `--file-id <id>`: Target a specific object block
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update settings [options]`
  - `-p, --project <path>`: Unity project path
  - `-s, --setting <name>`: Setting name/alias
  - `--property <name>`: Property to edit
  - `--value <value>`: New value
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update layer <index> <name> [options]`
  - `-p, --project <path>`: Unity project path
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update material <file> [options]`
  - `--set <property=value>`: Set property (repeatable)
  - `--set-color <property=r,g,b,a>`: Set color (repeatable)
  - `--set-texture <property=guid>`: Set texture GUID
  - `--shader <guid>`: Change shader GUID
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
  - `-j, --json`: Output as JSON
- `unity-agentic-tools update animator <file> [options]`
  - `--set-default <param=value>`: Set default values (repeatable)
  - `-j, --json`: Output as JSON

### Editor-Only Scene / Prefab Mutation APIs

Create operations and scene/prefab graph mutations use `editor invoke` with a reachable Unity editor bridge. There is no silent file-mode fallback.

- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Scene --args '["Assets/Scenes/NewLevel.unity","false"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabVariant --args '["Assets/Prefabs/Base.prefab","Assets/Prefabs/BaseVariant.prefab","Base Variant"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets ScriptableObject --args '["Assets/Data/Enemy.asset","EnemyConfig","{\"health\":100}"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Meta --args '["Assets/Scripts/TestScript.cs"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Build --args '["Assets/Scenes/Main.unity","0"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Material --args '["Assets/Materials/Floor.mat","0000000000000000f000000000000000","Floor"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Project Package --args '["com.unity.cinemachine","2.9.7"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets InputActions --args '["Assets/Input/NewActions.inputactions","NewActions"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animation --args '["Assets/Animations/New.anim","NewAnim","60","true"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Assets Animator --args '["Assets/Animators/New.controller","NewController","Base Layer"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs Prefab --args '["Assets/Prefabs/Enemy.prefab","Enemy"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes GameObject --args '["Assets/Scenes/Main.unity","EnemyRoot","Gameplay"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes Component --args '["Assets/Scenes/Main.unity","Player","BoxCollider"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Scenes ComponentCopy --args '["Assets/Scenes/Main.unity","Main Camera","Camera","0","Player"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Create.Prefabs PrefabInstance --args '["Assets/Scenes/Boot.unity","Assets/Prefabs/AppRoot.prefab","","AppRoot","0","0","0"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects GameObject --args '["Assets/Scenes/Main.unity","Player","m_IsActive","false"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Component --args '["Assets/Scenes/Main.unity","Player","Camera","0","m_FieldOfView","55"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Transform --args '["Assets/Scenes/Main.unity","Player","1,2,3","0,90,0","1,1,1"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects Parent --args '["Assets/Scenes/Main.unity","Player","Gameplay"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized Array --args '["Assets/Scenes/Main.unity","Player","SomeComponent","0","m_Items","append","{\"value\":\"7\"}"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized Batch --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"propertyPath\":\"m_IsActive\",\"value\":\"false\"}]"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized BatchComponents --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Objects SiblingIndex --args '["Assets/Scenes/Main.unity","Player","0"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Serialized ManagedReference --args '["Assets/Scenes/Main.unity","Player","SomeComponent","0","m_Strategy","Namespace.Type","[{\"path\":\"value\",\"value\":\"7\"}]","false"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabUnpack --args '["Assets/Scenes/Boot.unity","AppRoot","OutermostRoot"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabOverride --args '["Assets/Scenes/Boot.unity","AppRoot","Transform","0","m_LocalPosition.x","7"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabBatchOverrides --args '["Assets/Scenes/Boot.unity","[{\"gameObjectPath\":\"AppRoot\",\"componentType\":\"Transform\",\"componentIndex\":0,\"propertyPath\":\"m_LocalPosition.x\",\"value\":\"4\"}]"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabManagedReference --args '["Assets/Scenes/Boot.unity","AppRoot","SomeComponent","0","m_Strategy","Namespace.Type","[{\"path\":\"value\",\"value\":\"7\"}]","false"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabRemoveOverride --args '["Assets/Scenes/Boot.unity","AppRoot","Transform","0","m_LocalPosition.x"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabRemoveComponent --args '["Assets/Scenes/Boot.unity","AppRoot","BoxCollider","0"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabRestoreComponent --args '["Assets/Scenes/Boot.unity","AppRoot","BoxCollider","0"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabRemoveGameObject --args '["Assets/Scenes/Boot.unity","AppRoot/Child"]'`
- `unity-agentic-tools editor invoke UnityAgenticTools.Update.Prefabs PrefabRestoreGameObject --args '["Assets/Scenes/Boot.unity","AppRoot/Child"]'`

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
