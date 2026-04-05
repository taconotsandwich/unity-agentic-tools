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

npx skills add "/Users/taco/Documents/Projects/unity-agentic-tools" --all -g --copy # from local for dev
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
unity-agentic-tools read log                                  # Unity Editor.log (filtered)
unity-agentic-tools read meta <file>                          # .meta importer settings
unity-agentic-tools read animation <file>                     # AnimationClip data
unity-agentic-tools read animator <file>                      # AnimatorController data
unity-agentic-tools read manifest                             # Packages from manifest.json (defaults project to cwd)
unity-agentic-tools read input-actions <file>                 # Input Actions file
```

### Create Commands

```bash
unity-agentic-tools create gameobject <file> <name>           # New GameObject
unity-agentic-tools create scene <path>                       # New .unity file
unity-agentic-tools create component <file> <name> <type>     # Add component
unity-agentic-tools create component-copy <file> <src> <tgt>  # Copy component
unity-agentic-tools create prefab-variant <source> <output>   # Prefab Variant
unity-agentic-tools create prefab-instance <scene> <prefab>  # Instantiate prefab in scene
unity-agentic-tools create scriptable-object <output> <script># ScriptableObject .asset
unity-agentic-tools create meta <script_path>                 # Generate .meta file
unity-agentic-tools create material <output>                  # New Material .mat
unity-agentic-tools create build <scene>                      # Add scene to build settings (defaults project to cwd)
unity-agentic-tools create package <name> <version>           # Add package to manifest.json (defaults project to cwd)
unity-agentic-tools create input-actions <path> <name>        # Blank .inputactions file
unity-agentic-tools create animation <path> [name]            # Blank .anim file
unity-agentic-tools create animator <path> [name]             # Blank .controller file
unity-agentic-tools create prefab <file> <name>               # Create prefab from GameObject
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
unity-agentic-tools update sibling-index <file> <name> <index>
unity-agentic-tools update input-actions <file> --add-map MyMap
unity-agentic-tools update animation-curves <file> --add-curve <path> <property>
unity-agentic-tools update animator-state <file> --add-state <name>
unity-agentic-tools update prefab unpack|override|remove-override|...
```

### Delete Commands

```bash
unity-agentic-tools delete gameobject <file> <name>
unity-agentic-tools delete component <file> <file_id>
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

```bash
# Connection & Play Mode
unity-agentic-tools editor status -p <project>                # Check bridge connection
unity-agentic-tools editor play                               # Enter play mode
unity-agentic-tools editor stop                               # Exit play mode
unity-agentic-tools editor pause                              # Toggle pause
unity-agentic-tools editor step                               # Advance one frame

# Discovery (snapshot interactive state with compact refs)
unity-agentic-tools editor hierarchy-snapshot                  # Scene hierarchy with @hN refs
unity-agentic-tools editor ui-snapshot                         # Interactive UI elements with @uN refs
unity-agentic-tools editor input-map                           # List all input actions + legacy axes

# State Queries (by ref)
unity-agentic-tools editor get active @h1                      # Is GameObject active?
unity-agentic-tools editor get position @h1                    # Transform world position
unity-agentic-tools editor get component @h1 Rigidbody         # Component property values
unity-agentic-tools editor get text @u1                        # UI element text content
unity-agentic-tools editor get value @u2                       # UI element value (slider, toggle, etc.)

# UI Interaction (by ref)
unity-agentic-tools editor ui-click @u1                        # Click a Button
unity-agentic-tools editor ui-fill @u2 "hello"                 # Clear + type into InputField
unity-agentic-tools editor ui-type @u2 " world"                # Append text (no clear)
unity-agentic-tools editor ui-toggle @u3                       # Toggle a Toggle
unity-agentic-tools editor ui-slider @u4 0.75                  # Set Slider value
unity-agentic-tools editor ui-select @u5 "Option A"            # Select Dropdown option
unity-agentic-tools editor ui-scroll @u6 down 0.2              # Scroll a ScrollRect
unity-agentic-tools editor ui-focus @u7                        # Focus an element

# Input Simulation (requires Input System package)
unity-agentic-tools editor input-key Space press               # Keyboard input
unity-agentic-tools editor input-mouse 400 300 click           # Mouse at screen coords
unity-agentic-tools editor input-touch 200 500 tap             # Touch simulation
unity-agentic-tools editor input-action Jump                   # Trigger Input System action

# Observation
unity-agentic-tools editor screenshot --annotate               # Game view with numbered UI labels
unity-agentic-tools editor wait --scene MainMenu               # Wait for scene to load
unity-agentic-tools editor wait --ui @u1                       # Wait for UI element active
unity-agentic-tools editor wait --ui-gone @u1                  # Wait for element to deactivate
unity-agentic-tools editor wait --log "Level loaded"           # Wait for log message
unity-agentic-tools editor wait --compile                      # Wait for compilation
unity-agentic-tools editor wait 500                            # Wait N milliseconds

# Console & Assets
unity-agentic-tools editor console-logs --type Error           # Get console entries
unity-agentic-tools editor console-clear                       # Clear console
unity-agentic-tools editor console-follow                      # Stream logs real-time
unity-agentic-tools editor screenshot -o shot.png              # Capture game view
unity-agentic-tools editor tests-run --mode playmode           # Run Unity tests
unity-agentic-tools editor menu "File/Save"                    # Execute menu item
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

## License

Apache-2.0
