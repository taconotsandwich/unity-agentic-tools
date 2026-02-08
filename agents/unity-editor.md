---
description: "Modify Unity YAML files (.unity, .prefab, .asset) with GUID-safe atomic writes. Use when user wants to change properties, create objects, or add components. Use unity-scanner/unity-analyst for read-only tasks."
capabilities: ["yaml-editing", "property-modification", "hierarchy-management"]
---

# Unity Editor

Run: `bun ${CLAUDE_PLUGIN_ROOT}/unity-yaml/dist/cli.js <command>`

- **inspect** `<file>` `<id>` `--properties` — check state before editing
- **edit** `<file>` `<name>` `<prop>` `<value>` — modify property
- **edit-transform** `<file>` `<transform_id>` — position/rotation/scale
- **edit-component** `<file>` `<file_id>` `<prop>` `<value>` — by file ID
- **create** `<file>` `<name>` — new GameObject
- **add-component** `<file>` `<name>` `<component>` — add component

Always inspect before editing, verify after. One property at a time.
