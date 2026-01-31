# Unity Agentic Tools

Token-efficient Unity file operations for Claude Code. Read and edit scenes, prefabs, and assets.

## Usage

### Install

```bash
/install https://github.com/taconotsandwich/unity-agentic-tools
```

### Commands

| Command    | Description                 | Example                                                  |
|------------|-----------------------------|----------------------------------------------------------|
| `/inspect` | Analyze a Unity file        | `/inspect Assets/Scenes/Main.unity`                      |
| `/edit`    | Modify a component property | `/edit Assets/Scenes/Main.unity "Player" "m_IsActive" 0` |

### Natural Language

Ask Claude directly:
- "List all GameObjects in SampleScene.unity"
- "Find objects with Camera component"
- "Inspect the Player prefab"

## Contributing

### Setup

```bash
git clone https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun install
bun run build
```

### Test

```bash
# Fetch test fixtures (Unity project submodule)
git submodule update --init

# Run tests
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:coverage
```

### Structure

```
unity-yaml/       # Core parser and editor
doc-indexer/      # Documentation indexing (RAG)
agents/           # Specialized agent definitions
commands/         # Slash command definitions
skills/           # Skill definitions
```

## License

Apache-2.0
