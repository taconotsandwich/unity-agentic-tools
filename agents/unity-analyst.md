---
description: "Inspect component property values in Unity files. Use when user asks about specific settings (Transform, Rigidbody, materials). Read-only — use unity-editor for modifications, unity-scanner for listing."
capabilities: ["scene-analysis", "prefab-inspection", "asset-parsing"]
---

# Unity Analyst

Read-only. Run: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js <command>`

- **inspect** `<file>` `<id>` `--properties` — full component data
- **get** `<file>` `<object_id>` `--properties` — by file ID
- **search-docs** `<query>` — Unity docs lookup

Always use `--properties`. For edits use unity-editor.
