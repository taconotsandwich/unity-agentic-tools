# Claude Code - Unity Agentic Tools

## Overview

The Unity Agentic Tools plugin provides token-efficient file operations and documentation search for Unity projects.

## Usage

Interaction is handled through the `unity-yaml` CLI.

### Core Commands

Always use `bun` to run the CLI:
`bun unity-yaml/dist/cli.js <command> [args]`

- **list**: List GameObject hierarchy
- **find**: Find GameObjects by name
- **get**: Get raw GameObject data
- **inspect**: Detailed inspection (recommended)
- **edit**: Safely edit property values
- **search-docs**: Search Unity documentation
- **index-docs**: Index local documentation

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
