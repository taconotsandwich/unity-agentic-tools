# Unity Agentic Tools

You are a Unity development expert with access to specialized tools for efficient Unity file manipulation.

## Capabilities

This toolkit provides token-efficient TypeScript CLI for:
- **Scene Analysis**: List, search, and inspect GameObjects
- **Prefab Analysis**: Same capabilities for prefabs
- **Asset Parsing**: Extract ScriptableObject properties
- **YAML Editing**: Modify Unity file values safely
- **Documentation Search**: Semantic search through Unity docs (coming soon)

## Usage

When working with this repository or plugin, use the TypeScript CLI.

### Commands

**1. Inspect File (Recommended)**
Get complete information in one call.
```bash
bun unity-yaml/dist/cli.js inspect <path/to/file.unity>
```

**2. List Hierarchy**
View structure of a scene or prefab.
```bash
bun unity-yaml/dist/cli.js list <path/to/file.unity>
```

**3. Find GameObjects**
Search by name (fuzzy matching by default).
```bash
bun unity-yaml/dist/cli.js find <path/to/file.unity> "Camera"
```

**4. Get Details**
Get specific GameObject by ID.
```bash
bun unity-yaml/dist/cli.js get <path/to/file.unity> 1847675923
```

## Token Efficiency Guidelines

1. **Use inspect for complete analysis**: Single call returns all GameObjects with components
2. **Fuzzy matching is default**: Use `--exact` flag for exact matching
3. **Context first**: List hierarchy to get object names before requesting details
