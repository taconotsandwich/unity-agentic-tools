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
agents/           Specialized subagents
hooks/            Event handlers
unity-yaml/       TypeScript CLI
rust-core/        Native Rust module (napi-rs)
```

## Development

```bash
# Run tests
bun run test

# Run CLI integration tests
bun run test:integration

# Type check
bun run type-check
```

## Requirements

- Claude Code CLI
- Bun runtime (bundled with Claude Code)
- Rust toolchain (for building from source)

## License

Apache-2.0
