---
description: "Download and install the native Rust binary (.node) required by the unity-yaml CLI. Run this once after installing the plugin — all CLI commands will fail without it. Detects your platform automatically (macOS/Linux/Windows) and builds the TypeScript CLI. Do NOT re-run unless upgrading the plugin or switching platforms."
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
