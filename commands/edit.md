---
description: Edit a property of a GameObject or component in a Unity YAML file safely.
---

# Unity Edit Command

Use this command to modify values in Unity files while preserving GUIDs and structure.

```bash
bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js edit $ARGUMENTS
```

## Usage

`/unity:edit <file_path> <object_name> <property> <value>`

## Example

`/unity:edit Assets/Scenes/Main.unity "Player" "m_IsActive" 0`
