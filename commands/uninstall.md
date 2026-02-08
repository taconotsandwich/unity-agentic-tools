---
description: "Remove the native Rust binary and clean up all host artifacts created by /initial-install. Run this before removing the plugin to leave nothing behind."
---

# Uninstall Command

This command removes every file the installer wrote to the host machine, using a manifest to track exactly what was created.

## Instructions

Run the uninstall script:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/install-binary.ts uninstall
```

This reads `~/.claude/unity-agentic-tools/manifest.json` and removes every file listed, then cleans up the manifest and any empty parent directories.

After running this, the plugin can be safely removed with no host artifacts remaining.
