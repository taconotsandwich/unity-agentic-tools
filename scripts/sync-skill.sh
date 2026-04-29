#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_ROOT="$ROOT_DIR/skills"
DEST_ROOT="$HOME/.claude/skills"

SKILLS=(
    "unity-agentic-tools"
)

LEGACY_SKILLS=(
    "unity-agentic-editor"
)

bun "$ROOT_DIR/scripts/generate-agent-guidance.js"

for skill in "${LEGACY_SKILLS[@]}"; do
    dst="$DEST_ROOT/$skill"
    if [ -d "$dst" ]; then
        rm -rf "$dst"
        echo "Removed legacy skill $skill from $dst"
    fi
done

for skill in "${SKILLS[@]}"; do
    src="$SKILLS_ROOT/$skill"
    dst="$DEST_ROOT/$skill"

    if [ ! -d "$src" ]; then
        echo "Error: Source skill directory not found at $src"
        exit 1
    fi

    mkdir -p "$dst"
    rm -rf "$dst/reference" "$dst/scripts"
    mkdir -p "$dst/reference" "$dst/scripts"

    cp "$src/SKILL.md" "$dst/SKILL.md"

    if [ -d "$src/reference" ]; then
        cp "$src"/reference/*.md "$dst/reference/"
    fi

    if [ -d "$src/scripts" ]; then
        cp "$src"/scripts/*.mjs "$dst/scripts/"
    fi

    ref_count=0
    script_count=0
    if [ -d "$dst/reference" ]; then
        ref_count=$(ls "$dst/reference" | wc -l | tr -d ' ')
    fi
    if [ -d "$dst/scripts" ]; then
        script_count=$(ls "$dst/scripts" | wc -l | tr -d ' ')
    fi

    echo "Synced $skill to $dst"
    echo "  SKILL.md + ${ref_count} reference files + ${script_count} scripts"
done
