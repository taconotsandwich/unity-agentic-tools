# Unity Agentic Tools

Token-efficient Unity file operations with intelligent selective loading for scenes, prefabs, and assets.

Supports read/edit operations on Unity files and fast documentation indexing with RAG for Claude Code.

## Installation

### Prerequisites

- **Bun** 1.0.0 or higher (built-in with Claude Code)
- **Claude Code** desktop app

### Option 1: Install from Marketplace (Recommended)

```bash
# Add marketplace (first time only)
/plugin marketplace add https://github.com/taconotsandwich/unity-agentic-tools

# Install plugin
/plugin install unity-agentic-tools

# Restart Claude Code
```

The plugin automatically runs `bun install && bun run build` on install.

### Option 2: Install Directly (Development)

```bash
# Clone repository
git clone https://github.com/taconotsandwich/unity-agentic-tools.git

# Build
cd unity-agentic-tools
bun install
bun run build

# Link to Claude Code plugins
ln -s $(pwd) ~/.claude/plugins/unity-agentic-tools

# Restart Claude Code
```

## Usage

### CLI

```bash
# List all GameObjects in a scene
bun unity-yaml/dist/cli.js list Assets/Scenes/MainScene.unity

# Find GameObjects (fuzzy matching)
bun unity-yaml/dist/cli.js find Assets/Scenes/MainScene.unity "Camera"

# Find GameObjects (exact match)
bun unity-yaml/dist/cli.js find Assets/Scenes/MainScene.unity "Camera" --exact

# Get GameObject by ID
bun unity-yaml/dist/cli.js get Assets/Scenes/MainScene.unity 508316491

# Inspect GameObject (recommended)
bun unity-yaml/dist/cli.js inspect Assets/Scenes/MainScene.unity "Player"

# Inspect entire file
bun unity-yaml/dist/cli.js inspect Assets/Scenes/MainScene.unity

# Inspect with all properties
bun unity-yaml/dist/cli.js inspect Assets/Scenes/MainScene.unity "Player" --properties

# Search Unity documentation
bun unity-yaml/dist/cli.js search-docs "Rigidbody component"

# Index local documentation
bun unity-yaml/dist/cli.js index-docs path/to/Documentation~
```

### Claude Code Integration

Ask Claude Code naturally:
- "List all GameObjects in SampleScene.unity"
- "Find objects with Camera component"
- "Get details for the Player GameObject"
- "Inspect MainScene.unity"

---

## Features

- **Token Efficiency**: Selective loading of GameObjects (only what's needed)
- **Fast Parsing**: Regex-based parsing optimized for speed (no heavy YAML parser)
- **Smart Context**: Automatically resolves script names from GUIDs
- **Universal**: Works with scenes (`.unity`), prefabs (`.prefab`), and assets (`.asset`)
- **Safe Editing**: GUID preservation, atomic writes, YAML validation
- **Documentation Indexing**: Fast local + remote documentation search with RAG

## Architecture

```
unity-agentic-tools/
├── unity-yaml/              # Core library - scanner.ts (read), editor.ts (write/edit)
├── doc-indexer/             # Documentation indexing module
│   ├── src/
│   │   ├── indexer.ts    # Chunking for code/prose/API
│   │   ├── storage.ts    # In-memory JSON storage
│   │   ├── search.ts     # Hybrid semantic + keyword search
│   │   ├── tokenizer.ts  # Token estimation
│   │   └── cli.ts        # CLI entry point
│   └── package.json
├── .claude-plugin/          # Claude Code plugin manifest
│   └── plugin.json       # Plugin configuration
├── agents/                  # Claude agent definitions
└── commands/              # Skill command definitions
```

---

## Core Capabilities

### File Operations

| Operation | Implementation | Key Features |
|------------|---------------|--------------|
| **Read Unity Files** | scanner.ts | Selective loading, token-efficient, smart context |
| **Write/Edit Unity Files** | editor.ts (NEW) | Safe regex editing, GUID preservation, atomic writes, validation |
| **Index Local Docs** | doc-indexer (NEW) | Markdown chunking, code block extraction |
| **Index Registry** | doc-indexer (NEW) | Remote API fetch, README parsing |
| **Search Docs** | doc-indexer (NEW) | Hybrid search (semantic + keyword) |

---

## Development

### Building from Source

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Watch mode development
bun run dev

# Build CLI
bun run build
```

### Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Coverage report
bun run test:coverage
```

## Troubleshooting

### Build Failed

```bash
# Rebuild the project
bun install
bun run build

# Verify dist/ directory exists
ls -la unity-yaml/dist/
```

### Plugin Not Showing in Claude Code

- **Restart Claude Code** - Changes take effect after restart
- **Check plugin location** - Verify `~/.claude/plugins/unity-agentic-tools` exists
- **Verify manifest** - Check `.claude-plugin/plugin.json` is valid JSON

## Documentation

- [Claude Code Guide](docs/claude.md) - Plugin configuration and usage
- [Agent Development](AGENTS.md) - Build custom agents

---

## License

MIT
