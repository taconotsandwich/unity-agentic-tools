# Claude Code - Unity Agentic Tools

## Overview

The Unity Agentic Tools plugin for Claude Code provides native file operations and documentation search capabilities through the \`unity-editor\` skill.

## Installation

The plugin is installed via the setup script:

\`\`\`bash
./setup-claude.sh
\`\`\`

This installs the skill at \`.claude-plugin/skills/unity-editor/\` and configures the plugin to load it.

## Skill: \`unity-editor\`

The \`unity-editor\` skill specializes in reading and editing Unity YAML files (.unity, .prefab, .asset, ScriptableObject).

### Available Commands

Claude provides the following commands when working with Unity files:

| Command | Description | Example |
|----------|-------------|----------|
| \`/scene-list\` | List all GameObjects in a scene | "List all GameObjects" |
| \`/scene-find\` | Find GameObjects by name pattern | "Find objects named 'Player'" |
| \`/scene-get\` | Get GameObject details | "Get GameObject 'Player'" |
| \`/prefab-list\` | List GameObjects in prefab | "List all prefabs" |
| \`/prefab-find\` | Find in prefab | "Find 'Camera' prefab" |
| \`/prefab-get\` | Get prefab details | "Get 'Camera' prefab" |
| \`/asset-show\` | List assets | "List all assets" |
| \`/asset-get\` | Get asset details | "Get asset details" |
| \`/inspect\` | Inspect file or object | "Inspect a scene file" |
| \`/yaml-edit\` | Edit GameObject property | "Edit m_IsActive to false" |
| \`/yaml-index\` | Index documentation | "Index local docs" |
| \`/yaml-search\` | Search documentation | "Search for Rigidbody" |

## Key Principles

1. **Never modify GUIDs** - Unity-generated GUIDs must always be preserved
2. **Maintain file ID consistency** - Keep all reference IDs intact
3. **Use atomic writes** - Write temp file, then rename to prevent corruption
4. **Validate after edits** - Ensure Unity can load edited files
5. **Preserve formatting** - Maintain indentation and comments

## Skill Scripts

The skill uses bash scripts to execute Unity file operations:

- **scripts/read.ts** - Reads Unity file and returns JSON output
- **scripts/edit.ts** - Edits a GameObject property with validation
- **scripts/batch-edit.ts** - Batch edits multiple properties

All scripts call the shared \`unity-yaml\` CLI to perform operations, ensuring consistency across platforms.

## Example Usage

Claude will automatically invoke the \`unity-editor\` skill when you ask to work with Unity files. You don't need to invoke commands manually.

### Examples

\`\`\`
"List all GameObjects in Main scene"
→ Claude invokes \`/scene-list\` → calls unity-yaml CLI list command

"Find all objects named 'Camera'"
→ Claude invokes \`/scene-find\` → calls unity-yaml CLI find command

"Set GameObject's m_IsActive property of Main Camera to false"
→ Claude invokes \`/yaml-edit\` → calls unity-yaml CLI edit command

"Search for information about Rigidbody components"
→ Claude invokes \`/yaml-search\` → calls doc-indexer CLI search command
\`\`\`

## Files and Tools

### Core Library
- **unity-yaml/src/scanner.ts** - Read operations
- **unity-yaml/src/editor.ts** - Safe write/edit operations

### Documentation
- **doc-indexer/** - Fast RAG-based documentation indexing and search

### Claude Integration
- **claude/skills/unity-editor/SKILL.md** - Skill instructions
- **claude/skills/unity-editor/scripts/** - Bash wrappers for CLI

## See Also

- [Main README](../README.md)
- [Installation Guide](./INSTALLATION.md)
- [Agent Development](../AGENTS.md)
