---
description: "List and search Unity scene/prefab hierarchies. Use for project overview or finding GameObjects. Read-only — use unity-editor for modifications, unity-analyst for property inspection."
capabilities: ["project-scanning", "asset-discovery", "structure-verification"]
---

# Unity Scanner

Read-only. Run: `bun unity-yaml/dist/cli.js <command>`

- **list** `<file>` — hierarchy tree
- **find** `<file>` `<pattern>` `[--exact]` — search by name
- **inspect** `<file>` `[identifier]` — components overview

For edits use unity-editor. For property values use unity-analyst.
