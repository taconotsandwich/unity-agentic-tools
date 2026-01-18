---
name: unity-yaml
description: Specialized skill for analyzing and editing Unity YAML files (.unity, .prefab, .asset) using the unity-yaml CLI.
---

# Unity YAML Skill

Use this skill to interact with Unity files. All operations must be performed using the `unity-yaml` CLI via `bun`.

## CLI Usage

The CLI is located at `${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js`. Always run it with `bun`.

### Core Commands

- **List Hierarchy**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js list <file_path>`
  - Lists all GameObjects and components in a file.
- **Find Object**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js find <file_path> <pattern> [--exact]`
  - Searches for GameObjects by name.
- **Inspect**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js inspect <file_path> [identifier] [--properties]`
  - Gets detailed information about a specific GameObject or the whole file.
- **Get Details**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js get <file_path> <object_id>`
  - Retrieves raw YAML data for a specific object.
- **Edit Property**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js edit <file_path> <object_name> <property> <value>`
  - Safely modifies a property value while preserving GUIDs.
- **Search Docs**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js search-docs <query>`
  - Searches indexed Unity documentation.
- **Index Docs**: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js index-docs <path_to_docs>`
  - Indexes a directory of markdown files or Unity docs.

## Workflow

1.  **Discovery**: Use `list` or `find` to locate the GameObjects you need to work with.
2.  **Inspection**: Use `inspect --properties` to understand the current state of components.
3.  **Modification**: Use `edit` to make changes.
4.  **Verification**: Re-run `inspect` to confirm the change was applied correctly.

## Safety Guidelines

- **Preserve GUIDs**: Never manually edit the YAML in a way that risks GUID corruption. Use the `edit` command.
- **Batching**: While individual commands are safe, always verify state between multiple edits.
- **Paths**: Ensure file paths are relative to the project root or absolute.
