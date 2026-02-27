#!/usr/bin/env bash
set -euo pipefail

SKILL_SRC="$(cd "$(dirname "$0")/.." && pwd)/skills/unity-agentic-tools"
SKILL_DST="$HOME/.claude/skills/unity-agentic-tools"

if [ ! -d "$SKILL_SRC" ]; then
    echo "Error: Source skill directory not found at $SKILL_SRC"
    exit 1
fi

mkdir -p "$SKILL_DST/reference" "$SKILL_DST/scripts"

cp "$SKILL_SRC/SKILL.md" "$SKILL_DST/SKILL.md"
cp "$SKILL_SRC"/reference/*.md "$SKILL_DST/reference/"
cp "$SKILL_SRC"/scripts/*.mjs "$SKILL_DST/scripts/"

echo "Synced skill to $SKILL_DST"
echo "  SKILL.md + $(ls "$SKILL_DST/reference/" | wc -l | tr -d ' ') reference files + $(ls "$SKILL_DST/scripts/" | wc -l | tr -d ' ') scripts"
