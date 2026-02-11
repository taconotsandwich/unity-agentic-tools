# unity-agentic-tools

Token-efficient CLI and library for parsing, analyzing, and editing Unity YAML files. Powered by a native Rust backend.

## Overview

This package powers the `/inspect` and `/edit` commands. It parses Unity scene, prefab, and asset files to extract GameObject hierarchies, components, and properties.

## Commands

See the main plugin README for available commands:
- `/inspect` - View scene/prefab contents
- `/edit` - Modify properties safely

## Requirements

- Bun runtime (bundled with Claude Code)
- Optional: Rust native module for faster parsing

## Troubleshooting

### Slow on large scenes

The Rust backend may not be installed. Run `bun install` in the project root to resolve the native module.

### Script names show as GUIDs

The GUID cache hasn't been built for your project. The plugin will prompt you to run setup when needed.

### Parse errors on custom assets

Some asset types with non-standard YAML may not parse correctly. Open an issue with a sample file.

## License

Apache-2.0
