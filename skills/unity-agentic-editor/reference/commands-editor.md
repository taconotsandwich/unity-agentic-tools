# editor command reference

Authoritative reference for `unity-agentic-tools editor ...`.

## Base usage

```bash
unity-agentic-tools editor [options] <subcommand>
```

Base options:
- `-p, --project <path>`: Unity project path (default cwd)
- `--timeout <ms>`: RPC timeout (default `10000`)
- `--port <n>`: Override bridge port

## Required setup

1. `unity-agentic-tools editor install -p <project>`
2. Open project in Unity and wait for compile/import
3. `unity-agentic-tools editor status -p <project>`

## Command matrix

| Command | Purpose |
|---------|---------|
| `editor status` | Check bridge connection |
| `editor list` | List available top/editor commands |
| `editor invoke <type> <member> [args...]` | Invoke static method/property |
| `editor console-follow` | Stream logs in real time |
| `editor install` | Install bridge package |
| `editor uninstall` | Remove bridge package |

## Detailed usage

### `editor status`

No subcommand-specific options.

### `editor list`

Options:
- `--scope <scope>`: `all|editor|top` (default `all`)
- `--show-options`: include option metadata
- `--show-args`: include positional arg metadata
- `--show-desc`: include descriptions

### `editor invoke <type> <member> [args...]`

Options:
- `--args <json>`: JSON array of arguments (overrides positional args)
- `--set <value>`: set writable static property instead of reading/calling
- `--no-wait`: return immediately

Examples:

```bash
unity-agentic-tools editor invoke UnityEditor.AssetDatabase Refresh
unity-agentic-tools editor invoke UnityEditor.EditorApplication isCompiling
unity-agentic-tools editor invoke UnityEditor.EditorApplication ExecuteMenuItem "File/Save"
```

### `editor console-follow`

Options:
- `-t, --type <type>`: `Log|Warning|Error|Assert|Exception`
- `--duration <ms>`: auto-stop after duration (`0` means unlimited)

### `editor install`

Options:
- `-p, --project <path>`: target Unity project path

### `editor uninstall`

Options:
- `-p, --project <path>`: target Unity project path

## Ref and snapshot guidance

For interactive UI and hierarchy workflows, use `editor invoke` against the built-in bridge APIs:

```bash
unity-agentic-tools editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot "[99,false]"
unity-agentic-tools editor invoke UnityAgenticTools.API.UIAPI Snapshot
```

Snapshot-first pattern:
- `editor invoke UnityAgenticTools.API.HierarchyAPI Snapshot ...` -> `@hN`
- `editor invoke UnityAgenticTools.API.UIAPI Snapshot` -> `@uN`

Then query or interact through invoke calls such as:
- `editor invoke UnityAgenticTools.API.HierarchyAPI Query "[\"@h1\",\"active\"]"`
- `editor invoke UnityAgenticTools.API.UIAPI Query "[\"@u1\",\"text\"]"`
- `editor invoke UnityAgenticTools.API.UIAPI Interact "[\"@u1\",\"click\"]"`

Re-snapshot after scene changes, play mode changes, or domain reload.
