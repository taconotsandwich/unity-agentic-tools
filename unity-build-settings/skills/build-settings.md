---
description: Skill for reading and editing Unity project build settings, detecting version, and managing scene lists
---

# Unity Build Settings Skill

This skill enables reading and editing Unity project build settings without opening Unity Editor.

## Capabilities

### Read Operations
- Detect Unity project version from `ProjectSettings/ProjectVersion.txt`
- Read scene list from `ProjectSettings/EditorBuildSettings.asset`
- Detect Unity 6+ and read Build Profiles from `Assets/Settings/Build Profiles/`

### Edit Operations
- Add scenes to build settings
- Remove scenes from build settings
- Enable/disable scenes
- Reorder scenes (change build index)

## CLI Commands

### Read Commands

```bash
# Get Unity version info
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js version <project-path>

# List scenes in build settings
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js scenes <project-path>
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js scenes <project-path> --enabled-only
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js scenes <project-path> --json

# List build profiles (Unity 6+ only)
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js profiles <project-path>

# Complete build info
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js info <project-path>
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js info <project-path> --json
```

### Edit Commands

```bash
# Add a scene to build settings
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js add-scene <project-path> <scene-path>
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js add-scene <project-path> <scene-path> --disabled
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js add-scene <project-path> <scene-path> --position 0

# Remove a scene from build settings
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js remove-scene <project-path> <scene-path>

# Enable/disable a scene
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js enable-scene <project-path> <scene-path>
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js disable-scene <project-path> <scene-path>

# Move a scene to a new position
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js move-scene <project-path> <scene-path> <position>

# Reorder all scenes (comma-separated list)
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js reorder-scenes <project-path> "Assets/Scenes/A.unity,Assets/Scenes/B.unity"
```

## File Locations

| File | Purpose |
|------|---------|
| `ProjectSettings/ProjectVersion.txt` | Unity version |
| `ProjectSettings/EditorBuildSettings.asset` | Scene list (editable) |
| `Assets/Settings/Build Profiles/*.asset` | Build profiles (Unity 6+, read-only) |

## Version Detection

Unity version is stored in `ProjectSettings/ProjectVersion.txt`:

```yaml
m_EditorVersion: 2022.3.15f1
m_EditorVersionWithRevision: 2022.3.15f1 (abc123...)
```

Unity 6 uses version numbers starting with `6000.x.x`.

## Scene List Format

`ProjectSettings/EditorBuildSettings.asset` contains:

```yaml
EditorBuildSettings:
  m_Scenes:
  - enabled: 1
    path: Assets/Scenes/MainMenu.unity
    guid: abc123...
  - enabled: 0
    path: Assets/Scenes/Debug.unity
    guid: def456...
```

- `enabled: 1` = included in build (gets a build index)
- `enabled: 0` = excluded from build
- Build index is determined by order of enabled scenes (0, 1, 2...)

## Edit Safety

The editor:
- Validates scene files exist before adding
- Reads GUID from scene's .meta file automatically
- Uses atomic writes (temp file + rename)
- Preserves YAML structure and comments
- Returns updated scene list after each operation

## Examples

### Add a new level to the build
```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js add-scene /path/to/project Assets/Scenes/Level2.unity
```

### Set scene as first in build order (index 0)
```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js move-scene /path/to/project Assets/Scenes/Menu.unity 0
```

### Disable a debug scene
```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js disable-scene /path/to/project Assets/Scenes/Debug.unity
```
