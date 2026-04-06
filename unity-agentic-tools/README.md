# unity-agentic-tools

Token-efficient CLI and library for parsing, analyzing, and editing Unity YAML files. Powered by a native Rust backend (napi-rs).

## Overview

Fast CLI for Unity scene, prefab, and asset files. Extracts GameObject hierarchies, components, properties, materials, animations, and project settings with minimal token output for AI agent consumption. Includes a live editor bridge (WebSocket/JSON-RPC) for play mode control, UI interaction, input simulation, and annotated screenshots.

## Quick Start

```bash
npm install -g unity-agentic-tools
unity-agentic-tools read scene MyScene.unity
unity-agentic-tools read gameobject MyScene.unity "Main Camera" -p
unity-agentic-tools update transform MyScene.unity "Main Camera" -p 0,5,-10
```

## Commands (125 total)

### Read (20)
`read scene` | `read gameobject` | `read asset` | `read scriptable-object` | `read material` | `read dependencies` | `read dependents` | `read unused` | `read settings` | `read build` | `read overrides` | `read component` | `read reference` | `read script` | `read scripts` | `read meta` | `read animation` | `read animator` | `read manifest` | `read input-actions`

### Create (15)
`create gameobject` | `create scene` | `create prefab-variant` | `create prefab-instance` | `create scriptable-object` | `create meta` | `create component` | `create component-copy` | `create build` | `create material` | `create package` | `create input-actions` | `create animation` | `create animator` | `create prefab`

### Update (28)
`update gameobject` | `update component` | `update transform` | `update scriptable-object` | `update settings` | `update tag` | `update layer` | `update sorting-layer` | `update parent` | `update build` | `update array` | `update batch` | `update batch-components` | `update material` | `update meta` | `update animation` | `update animator` | `update sibling-index` | `update input-actions` | `update animation-curves` | `update animator-state` | `update prefab` (7 subcommands)

### Delete (6)
`delete gameobject` | `delete component` | `delete build` | `delete prefab` | `delete asset` | `delete package`

### Editor (6) -- Live Unity Bridge
`editor status` | `editor invoke` | `editor console-follow` | `editor list` | `editor install` | `editor uninstall`

### Utilities (8)
`search` | `grep` | `clone` | `version` | `docs` | `setup` | `cleanup` | `status`

Run any command with `--help` for full options.

## Loaded Edit Protection

When editor bridge is connected, mutating `.unity`/`.prefab` files is soft-protected. If target file is loaded/open in Unity editor, pass `--bypass-loaded-protection`.

This affects scene/prefab mutators including:
- `clone`
- `create gameobject|component|component-copy|prefab-instance`
- `update` mutators on `.unity`/`.prefab` (including `update prefab ...`)
- `delete gameobject|component|prefab|asset`

If editor bridge is offline/unreachable, operations remain unchanged.

## Script Component Validation

- `MonoBehaviour` literal is rejected for `create component`.
- all-zero GUID is rejected.
- abstract scripts are rejected for `create component` and `create scriptable-object`.

## Requirements

- Bun runtime
- Native Rust module (included in npm package, or build from source with `bun run build:rust`)

## Troubleshooting

### Slow on large scenes

The Rust backend may not be installed. Run `bun install` in the project root to resolve the native module.

### Script names show as GUIDs

The GUID cache hasn't been built for your project. Run `unity-agentic-tools setup -p <project_path>`.

### Parse errors on custom assets

Some asset types with non-standard YAML may not parse correctly. Open an issue with a sample file.

## License

Apache-2.0
