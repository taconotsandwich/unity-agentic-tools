---
description: Download and install the native Rust binary for your platform. Run this once after installing the plugin.
---

# Initial Install Command

This command downloads the pre-built native binary for your platform from GitHub releases.

## Instructions

Run the install script:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/install-binary.ts
```

## What it does

1. Detects your platform (macOS, Linux, or Windows)
2. Downloads the correct `.node` binary from GitHub releases
3. Places it in the `rust-core/` directory
4. Builds the TypeScript CLI

## Manual Installation

If the automatic install fails, download manually:

| Platform | File |
|----------|------|
| macOS Apple Silicon | `unity-agentic-core.darwin-arm64.node` |
| macOS Intel | `unity-agentic-core.darwin-x64.node` |
| Linux x64 | `unity-agentic-core.linux-x64-gnu.node` |
| Windows x64 | `unity-agentic-core.win32-x64-msvc.node` |

Download from: https://github.com/taconotsandwich/unity-agentic-tools/releases

Place the file in: `${CLAUDE_PLUGIN_ROOT}/rust-core/`
