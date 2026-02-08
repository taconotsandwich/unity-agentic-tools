---
description: "Remove the native Rust binary and clean up all host artifacts created by /initial-install. Run this before removing the plugin to leave nothing behind."
---

# Uninstall Command

This command removes the native binary and any other files installed on the host machine.

## Instructions

Run the uninstall script:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/install-binary.ts uninstall
```

This removes:
- The `.node` native binary from `~/.claude/unity-agentic-tools/bin/`
- The `bin/` directory if empty
- The `~/.claude/unity-agentic-tools/` directory if empty

After running this, the plugin can be safely removed with no host artifacts remaining.
