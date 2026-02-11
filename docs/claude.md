# Claude Code - Unity Agentic Tools

## Overview

The Unity Agentic Tools plugin provides token-efficient file operations and documentation search for Unity projects.

## Usage

Interaction is handled through the `unity-agentic-tools` CLI.

### Core Commands

Always use `bun` to run the CLI:
`bun unity-agentic-tools/dist/cli.js <command> [args]`

- **read scene**: List GameObject hierarchy (`--properties` for values)
- **read gameobject**: Get single object by name or file ID (`-c <type>` for component filter)
- **read scriptable-object / settings / build**: Read assets, project settings, build config
- **create**: Create GameObjects, scenes, components, prefabs, build-scene
- **update**: Modify properties (gameobject, component, transform, scriptable-object, build-scene)
- **delete**: Remove GameObjects, components, build-scene
- **find / search / grep**: Search within files or across projects
- **clone**: Duplicate a GameObject and its hierarchy
- **version**: Read Unity project version
- **docs**: Search Unity documentation (auto-indexes)

## Agents

- **Unity Scene Scanner**: Specialized in discovery and hierarchy listing.
- **Unity Asset Analyst**: Specialized in deep inspection and documentation search.
- **Unity File Editor**: Specialized in making safe YAML modifications.

## Development

Build the project:
```bash
bun run build
```

Run tests:
```bash
bun run test
```
