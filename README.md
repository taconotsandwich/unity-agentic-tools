# Unity Agentic Tools

A Claude Code plugin for reading and editing Unity scenes, prefabs, and assets with minimal token usage.

## Features

- **Scene Analysis** - List hierarchies, search GameObjects, inspect components
- **Prefab Support** - Same capabilities for prefab files
- **Safe Editing** - Modify properties while preserving Unity's YAML format
- **Fast Parsing** - Rust-powered backend for large files

## Installation

### From Marketplace

```bash
# Add the marketplace (run in Claude Code)
/plugin

# Navigate to Marketplaces → Add:
https://github.com/taconotsandwich/unity-agentic-tools

# Then install the plugin
/plugin install unity-agentic-tools@unity-agentic-tools-marketplace
```

### From Source

```bash
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools

# Install all dependencies (workspace resolves native module)
bun install

# Build Rust core (requires Rust toolchain)
bun run build:rust

# Build TypeScript CLI
bun run build

# Load plugin locally
claude --plugin-dir ./
```

## Usage

Ask Claude naturally:

- "List all GameObjects in SampleScene.unity"
- "Find objects with Camera component"
- "Inspect the Player prefab"
- "Set Player's m_IsActive to 0"

Or use slash commands directly:

```bash
/inspect Assets/Scenes/Main.unity
/edit Assets/Prefabs/Player.prefab
```

## Project Structure

```
.claude-plugin/   Plugin manifest
commands/         Slash commands
skills/           Agent skills
hooks/            Event handlers
unity-yaml/       TypeScript CLI
rust-core/        Native Rust module (napi-rs)
doc-indexer/      Documentation indexing module
```

## Development

Requires: Rust toolchain, Bun runtime.

### First-time setup

```bash
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun install                # workspace links + dev deps
bun run build:rust         # compile native .node binary (requires Rust)
bun run build              # build TypeScript
```

### Testing in Claude Code

```bash
# Load the plugin from your local checkout
claude --plugin-dir /path/to/unity-agentic-tools
```

The SessionStart hook checks for `node_modules/` and `dist/cli.js` and runs
`bun install` + `bun run build` if missing. Since you already built locally,
the hook exits instantly.

The native module resolves via the workspace link to `rust-core/`, which finds
your locally-built `.node` file directly -- no npm download needed.

### Rebuild after changes

```bash
bun run build:rust         # after Rust code changes
bun run build              # after TypeScript changes
bun run test               # unit tests (299 + 50 + 50)
bun run test:integration   # CLI integration tests
bun run type-check         # tsc --noEmit
```

### How users differ from devs

| | User (marketplace) | Dev (local) |
|-|-------------------|-------------|
| Install | git clone via marketplace | git clone manually |
| Native binary | `bun install` downloads from npm | `bun run build:rust` compiles locally |
| Setup | SessionStart hook runs automatically | Manual `bun install` + `bun run build:rust` + `bun run build` |
| Rust toolchain | Not needed | Required |

Both resolve the native module through the same `rust-core/index.js` loader.
It checks for a local `.node` file first (dev path), then falls back to the
npm platform package (user path).

### Testing npm package changes

After changing `rust-core/package.json` or `rust-core/index.js`:

```bash
# Verify package contents (should list index.js, index.d.ts, *.node, package.json)
cd rust-core && npm publish --dry-run

# Create tarball to test install from scratch
cd rust-core && npm pack                          # -> unity-file-tools-0.1.0.tgz

# Test in an isolated directory
mkdir /tmp/npm-test && cd /tmp/npm-test
npm init -y
npm install /path/to/rust-core/unity-file-tools-0.1.0.tgz
bun -e "const m = require('unity-file-tools'); console.log(typeof m.Scanner)"
# Should print: function
```

The `npm pack` + install-from-tarball flow simulates what a real npm consumer
gets, without publishing anything.

## License

Apache-2.0
