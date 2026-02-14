# Unity Agentic Tools

A CLI for reading and editing Unity scenes, prefabs, and assets with minimal token usage. Powered by a native Rust backend (napi-rs) for fast parsing of large files.

For Claude Code integration, see the [Claude Code plugin](https://github.com/taconotsandwich/unity-agentic-tools-claude-plugin).

## Features

- **Scene Analysis** - List hierarchies, search GameObjects, inspect components with pagination
- **Prefab Support** - Inspect, create variants, unpack instances
- **Safe Editing** - Modify properties, transforms, components while preserving Unity's YAML format
- **Project Settings** - Read/edit tags, layers, sorting layers, physics, quality, time settings
- **Build Settings** - Manage build scene list and profiles
- **Project Search** - Find GameObjects across all scenes/prefabs, regex grep across project files
- **Documentation** - Auto-indexing local Unity docs with semantic search
- **Fast Parsing** - Rust-powered backend with parallel I/O for large projects

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

```bash
# Read
unity-agentic-tools read scene <file>                      # GameObject hierarchy
unity-agentic-tools read gameobject <file> <id>             # Single object by name or file ID
unity-agentic-tools read settings <project> -s tags         # Project settings
unity-agentic-tools read build <project>                    # Build scene list

# Create
unity-agentic-tools create gameobject <file> <name>         # New GameObject
unity-agentic-tools create scene <path>                     # New .unity file
unity-agentic-tools create component <file> <name> <type>   # Add component

# Update
unity-agentic-tools update gameobject <file> <name> <prop> <value>
unity-agentic-tools update transform <file> <id> -p 1,2,3 -r 0,90,0
unity-agentic-tools update tag <project> add MyTag

# Delete
unity-agentic-tools delete gameobject <file> <name>
unity-agentic-tools delete component <file> <file_id>

# Search
unity-agentic-tools search <file> <pattern>                  # Find by name in file
unity-agentic-tools search <project> -n <pattern>            # Search across project
unity-agentic-tools grep <project> <regex>                  # Regex search
unity-agentic-tools docs <query>                            # Search Unity docs
```

## Project Structure

```
unity-agentic-tools/     TypeScript CLI + tests
rust-core/               Native Rust module (napi-rs)
doc-indexer/             Documentation indexing module
```

## Development

Requires: Rust toolchain, Bun runtime.

```bash
bun run build:rust         # after Rust code changes
bun run build              # after TypeScript changes
bun run test               # unit tests (378 + 82)
bun run test:integration   # CLI integration tests (13)
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
