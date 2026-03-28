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

## Commands (126 total)

### Read (21)
`read scene` | `read gameobject` | `read asset` | `read scriptable-object` | `read material` | `read dependencies` | `read dependents` | `read unused` | `read settings` | `read build` | `read overrides` | `read component` | `read reference` | `read script` | `read scripts` | `read log` | `read meta` | `read animation` | `read animator` | `read manifest` | `read input-actions`

### Create (15)
`create gameobject` | `create scene` | `create prefab-variant` | `create prefab-instance` | `create scriptable-object` | `create meta` | `create component` | `create component-copy` | `create build` | `create material` | `create package` | `create input-actions` | `create animation` | `create animator` | `create prefab`

### Update (28)
`update gameobject` | `update component` | `update transform` | `update scriptable-object` | `update settings` | `update tag` | `update layer` | `update sorting-layer` | `update parent` | `update build` | `update array` | `update batch` | `update batch-components` | `update material` | `update meta` | `update animation` | `update animator` | `update sibling-index` | `update input-actions` | `update animation-curves` | `update animator-state` | `update prefab` (7 subcommands)

### Delete (5)
`delete gameobject` | `delete component` | `delete build` | `delete prefab` | `delete package`

### Editor (49) -- Live Unity Bridge
`editor status` | `editor play` | `editor stop` | `editor pause` | `editor step` | `editor play-state` | `editor save` | `editor scene-open` | `editor active-scene` | `editor refresh` | `editor compiling` | `editor selection-get` | `editor selection-set` | `editor selection-clear` | `editor console-logs` | `editor console-clear` | `editor console-follow` | `editor menu` | `editor screenshot` | `editor tests-run` | `editor install` | `editor uninstall` | `editor hierarchy-snapshot` | `editor ui-snapshot` | `editor input-map` | `editor get text` | `editor get value` | `editor get active` | `editor get position` | `editor get component` | `editor ui-click` | `editor ui-fill` | `editor ui-type` | `editor ui-toggle` | `editor ui-slider` | `editor ui-select` | `editor ui-scroll` | `editor ui-focus` | `editor input-key` | `editor input-mouse` | `editor input-touch` | `editor input-action` | `editor wait`

### Utilities (8)
`search` | `grep` | `clone` | `version` | `docs` | `setup` | `cleanup` | `status`

Run any command with `--help` for full options.

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
