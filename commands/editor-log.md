---
description: Read the Unity Editor log file to diagnose errors, warnings, and build issues.
---

# Read Unity Editor Log

Read the Unity Editor log to help diagnose compilation errors, runtime exceptions, and build failures.

## Instructions

Detect the platform and read the appropriate log file:

**macOS:**
```bash
tail -n 500 ~/Library/Logs/Unity/Editor.log
```

**Windows:**
```bash
tail -n 500 "$LOCALAPPDATA/Unity/Editor/Editor.log"
```

**Linux:**
```bash
tail -n 500 ~/.config/unity3d/Editor.log
```

## What to look for

- `error CS` - C# compilation errors
- `NullReferenceException` - Null reference errors
- `MissingReferenceException` - Missing asset/component references
- `Build completed with errors` - Build failures
- `Script attached to` - Missing script warnings

## Tips

- Run this after seeing errors in Unity console
- The log resets when Unity restarts
- For older logs, check `Editor-prev.log` in the same directory
