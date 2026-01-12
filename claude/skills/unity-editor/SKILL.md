---
name: unity-editor
description: Expert in reading and editing Unity YAML files (.unity, .prefab, .asset, ScriptableObject)
---

# Unity Editor Skill

Claude should invoke this skill when working with Unity project files.

## Capabilities

- Read Unity scene, prefab, and ScriptableObject files
- Edit GameObject properties while preserving GUIDs and file IDs
- Validate Unity YAML integrity
- Index and search Unity documentation
- Batch edit multiple properties efficiently

## Tools Available

These scripts are invoked via the bash tool:

- `scripts/read.ts` - Read Unity file with selective loading
- `scripts/edit.ts` - Edit GameObject property with validation
- `scripts/batch-edit.ts` - Batch edit multiple properties

## Key Principles

1. Never modify GUIDs - Preserve Unity-generated GUIDs
2. Maintain file ID consistency - Keep all reference IDs intact
3. Use atomic writes - Write temp file, then rename
4. Validate after edits - Ensure Unity can load the file
5. Preserve formatting - Maintain indentation and comments

## File Types Supported

- `.unity` - Scene files
- `.prefab` - Prefab files
- `.asset` - Asset and ScriptableObject files
- `.meta` - Metadata files (reference only)
