---
description: "Download and install the native Rust binary (.node) required by the unity-yaml CLI. The binary is auto-installed on first session start, so you typically don't need to run this manually. Use /initial-install to force a reinstall, upgrade to the latest release, or recover a missing binary."
---

# Initial Install Command

The native binary is **auto-installed** on first session start via the `SessionStart` hook. Use this command to manually reinstall, upgrade, or recover the binary.

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
