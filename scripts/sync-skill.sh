#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_ROOT="$HOME/.claude/skills"

LEGACY_SKILLS=(
    "unity-agentic-editor"
)

for skill in "${LEGACY_SKILLS[@]}"; do
    dst="$DEST_ROOT/$skill"
    if [ -d "$dst" ]; then
        rm -rf "$dst"
        echo "Removed legacy skill $skill from $dst"
    fi
done

# The skills CLI copies whatever is on disk, so regenerate the command
# reference first or the installed skill trails Registry.cs.
bun "$ROOT_DIR/scripts/generate-agent-guidance.js"

cd "$ROOT_DIR"
bunx skills add "./skills/unity-agentic-tools" -g --copy -y --agent claude-code
