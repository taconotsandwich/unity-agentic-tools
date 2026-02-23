# Unity Agentic Tools

A CLI for reading and editing Unity scenes, prefabs, and assets with minimal token usage. Powered by a native Rust backend (napi-rs) for fast parsing of large files.

For Claude Code integration, see the [Claude Code plugin](https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin).

## Features

- **Scene Analysis** - List hierarchies, search GameObjects, inspect components with pagination
- **Prefab Support** - Inspect, create variants, unpack instances, manage overrides
- **Safe Editing** - Modify properties, transforms, components while preserving Unity's YAML format
- **Material Editing** - Read/edit shader properties, colors, textures, keywords
- **Animation & Animator** - Read/edit AnimationClip events and AnimatorController parameters
- **Meta Files** - Read/edit importer settings with batch glob support
- **Project Settings** - Read/edit tags, layers, sorting layers, physics, quality, time, build settings
- **Build Settings** - Manage build scene list (add, remove, enable, disable, reorder)
- **Dependency Graphs** - Trace asset dependencies, find dependents, detect unused assets
- **C# Type Extraction** - Parse .cs files and .NET DLLs for type/field information
- **Project Search** - Find GameObjects across all scenes/prefabs, regex grep across project files
- **Documentation** - Auto-indexing local Unity docs with semantic search
- **Fast Parsing** - Rust-powered backend (162 native tests) with parallel I/O for large projects

## Installation

### npm

```bash
bun add -g unity-agentic-tools
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
unity-agentic-tools read scene <file>                        # GameObject hierarchy (paginated)
unity-agentic-tools read gameobject <file> <id>               # Single object by name or file ID
unity-agentic-tools read asset <file>                         # Any Unity YAML asset file
unity-agentic-tools read material <file>                      # Structured material properties
unity-agentic-tools read settings <project> -s tags           # Project settings (tags/physics/quality/time/etc.)
unity-agentic-tools read build <project>                      # Build scene list
unity-agentic-tools read dependencies <file>                  # Asset GUID dependencies
unity-agentic-tools read dependents <project> <guid>          # Reverse dependency lookup
unity-agentic-tools read unused <project>                     # Detect unused assets
unity-agentic-tools read overrides <file> <prefab_instance>   # PrefabInstance overrides
unity-agentic-tools read component <file> <file_id>           # Single component by fileID
unity-agentic-tools read reference <file> <file_id>           # Trace fileID references
unity-agentic-tools read script <file>                        # C# types from .cs or DLL
unity-agentic-tools read scripts --project <path>             # List types from type registry
unity-agentic-tools read log                                  # Unity Editor.log (filtered)
unity-agentic-tools read meta <file>                          # .meta importer settings
unity-agentic-tools read animation <file>                     # AnimationClip data
unity-agentic-tools read animator <file>                      # AnimatorController data
```

### Create Commands

```bash
unity-agentic-tools create gameobject <file> <name>           # New GameObject
unity-agentic-tools create scene <path>                       # New .unity file
unity-agentic-tools create component <file> <name> <type>     # Add component
unity-agentic-tools create component-copy <file> <src> <tgt>  # Copy component
unity-agentic-tools create prefab-variant <source> <output>   # Prefab Variant
unity-agentic-tools create scriptable-object <output> <script># ScriptableObject .asset
unity-agentic-tools create meta <script_path>                 # Generate .meta file
unity-agentic-tools create material <output>                  # New Material .mat
unity-agentic-tools create build <project> <scene>            # Add scene to build settings
```

### Update Commands

```bash
unity-agentic-tools update gameobject <file> <name> <prop> <value>
unity-agentic-tools update component <file> <file_id> <prop> <value>
unity-agentic-tools update transform <file> <id> -p 1,2,3 -r 0,90,0
unity-agentic-tools update scriptable-object <file> <prop> <value>
unity-agentic-tools update settings <project> -s tags --property <name> --value <val>
unity-agentic-tools update tag <project> add MyTag
unity-agentic-tools update layer <project> 8 MyLayer
unity-agentic-tools update sorting-layer <project> add MyLayer
unity-agentic-tools update parent <file> <child> <new_parent>
unity-agentic-tools update build <project> <scene> --enable|--disable|--move <n>
unity-agentic-tools update array <file> <fid> <prop> insert <idx> <val>
unity-agentic-tools update batch <file> '<edits_json>'
unity-agentic-tools update batch-components <file> '<edits_json>'
unity-agentic-tools update material <file> --set _Metallic=0.8 --keyword-add _EMISSION
unity-agentic-tools update meta <file> --set isReadable=1 --max-size 2048
unity-agentic-tools update animation <file> --set wrap-mode=2 --add-event 0.5,OnStep
unity-agentic-tools update animator <file> --add-parameter Speed --type float
unity-agentic-tools update prefab unpack|override|remove-override|...
```

### Delete Commands

```bash
unity-agentic-tools delete gameobject <file> <name>
unity-agentic-tools delete component <file> <file_id>
unity-agentic-tools delete build <project> <scene>
unity-agentic-tools delete prefab <file> <prefab_instance>
```

### Search & Utilities

```bash
unity-agentic-tools search <file> <pattern>                   # Find by name in file
unity-agentic-tools search <project> -n <pattern>             # Search across project
unity-agentic-tools grep <project> <regex>                    # Regex search
unity-agentic-tools clone <file> <name>                       # Duplicate GameObject
unity-agentic-tools docs <query>                              # Search Unity docs
unity-agentic-tools version <project>                         # Unity version
unity-agentic-tools setup -p <project>                        # Initialize GUID cache
unity-agentic-tools cleanup -p <project>                      # Remove cached data
```

## Project Structure

```
unity-agentic-tools/     TypeScript CLI + tests (891 unit tests)
rust-core/               Native Rust module via napi-rs (162 tests)
doc-indexer/             Documentation indexing module
```

## Development

Requires: Rust toolchain, Bun runtime.

```bash
bun run build:rust         # after Rust code changes
bun run build              # after TypeScript changes
bun run test               # unit tests (891)
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
