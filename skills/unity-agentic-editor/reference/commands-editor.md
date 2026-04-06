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

For interactive UI/hierarchy workflows use the richer editor command set listed by:

```bash
unity-agentic-tools editor list --scope editor --show-options --show-args --show-desc
```

If available in your build, use snapshot-first pattern:
- `editor hierarchy-snapshot` -> `@hN`
- `editor ui-snapshot` -> `@uN`

Then act on refs (`ui-click`, `ui-fill`, `get`, etc.), and re-snapshot after scene/play/domain changes.
