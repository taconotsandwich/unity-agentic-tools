# Unity Agentic Tools

Token-efficient Unity file operations with intelligent selective loading for scenes, prefabs, and assets.

Supports read/edit operations on Unity files and fast documentation indexing with RAG for Claude Code.

## Installation

### Prerequisites

- **Bun** 1.0.0 or higher (built-in with Claude Code)
- **Claude Code** desktop app

### Option 1: Install from GitHub
```bash
# Install directly from the repository
/plugin add https://github.com/taconotsandwich/unity-agentic-tools
```

### Option 2: Local Development
```bash
# Clone the repository
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools

# Load the plugin for the current session
claude --plugin-dir .
```

## Usage

### Slash Commands (Recommended)

The most direct way to use the tools is via the built-in slash commands:

-   **/unity:inspect**: Analyze a specific Unity file.
    -   Example: `/unity:inspect Assets/Scenes/Main.unity`
-   **/unity:edit**: Modify a component property safely.
    -   Example: `/unity:edit Assets/Scenes/Main.unity "Player" "m_IsActive" 0`

### Specialized Agents

This plugin provides specialized agents that Claude can switch to for complex tasks (type `/agents` to view):

-   **Unity Asset Analyst**: Deep inspection of hierarchy and components.
-   **Unity Editor**: Safe modifications of YAML files.
-   **Unity Project Scanner**: Broad project-wide discovery.

### CLI (Manual)

If you need to run the tools outside of the Claude interface:

```bash
# List hierarchy
bun unity-yaml/dist/cli.js list <file_path>

# Inspect with properties
bun unity-yaml/dist/cli.js inspect <file_path> <object_name> --properties
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
├── agents/                  # Specialized Claude agent definitions
├── commands/                # Definition of /unity:* slash commands
├── skills/                  # Core capability definitions
│   └── unity-yaml/
│       └── SKILL.md      # Main skill logic
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
