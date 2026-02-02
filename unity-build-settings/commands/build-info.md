---
description: Show Unity project build settings, version info, and scene list
arguments:
  - name: project_path
    description: Path to Unity project root (folder containing Assets/)
    required: true
---

# Unity Build Info

Analyze the Unity project at the specified path and report:

1. **Project Version**: Read `ProjectSettings/ProjectVersion.txt` and parse the Unity version
2. **Build Scenes**: Read `ProjectSettings/EditorBuildSettings.asset` and list all scenes with their build index and enabled status
3. **Build Profiles** (Unity 6+ only): If the project uses Unity 6000.x or later, check for build profiles in `Assets/Settings/Build Profiles/`

## Instructions

Run the CLI command:
```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/cli.js info {project_path}
```

Report the results in a clear format:
- Unity version and whether it's Unity 6+
- Scene list with build indices (enabled scenes get numbered indices, disabled show as ---)
- Build profiles if applicable

If the project path is invalid or missing required files, explain what's missing.
