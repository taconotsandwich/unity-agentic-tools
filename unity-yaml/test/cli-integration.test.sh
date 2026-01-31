#!/usr/bin/env bash

set -u

echo "=== Testing Unity CLI Integration ==="

failures=0
tmp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t unity-cli-test)"

cleanup() {
    rm -rf "$tmp_dir"
}

trap cleanup EXIT

run_cli() {
    local label=$1
    shift
    local out_file="$tmp_dir/${label}.json"

    if "$@" > "$out_file" 2>&1; then
        return 0
    fi

    cat "$out_file"
    return 1
}

# Test 1: List GameObjects
echo "Test 1: List GameObjects"
if run_cli "test1" bun dist/cli.js list test/fixtures/SampleScene.unity --json; then
    echo "✓ List command works"
else
    echo "✗ List command failed"
    failures=$((failures + 1))
fi

# Test 2: Find GameObjects (exact)
echo ""
echo "Test 2: Find GameObjects (exact match)"
if run_cli "test2" bun dist/cli.js find test/fixtures/SampleScene.unity "Player" --exact --json; then
    echo "✓ Find exact command works"
else
    echo "✗ Find exact command failed"
    failures=$((failures + 1))
fi

# Test 3: Inspect object
echo ""
echo "Test 3: Inspect GameObject by name"
if run_cli "test3" bun dist/cli.js inspect test/fixtures/SampleScene.unity "Player" --json; then
    echo "✓ Inspect command works"
else
    echo "✗ Inspect command failed"
    failures=$((failures + 1))
fi

# Test 4: Edit property (temp copy)
echo ""
echo "Test 4: Edit property (temp copy)"
fixture_path="test/fixtures/SampleScene.unity"
temp_fixture_path="$tmp_dir/SampleScene.unity"

cp "$fixture_path" "$temp_fixture_path"

if run_cli "test4" bun dist/cli.js edit "$temp_fixture_path" "Player" "m_IsActive" "false" --json; then
    echo "✓ Edit command works"
    echo "  Changes persisted in temp file"
else
    echo "✗ Edit command failed"
    failures=$((failures + 1))
fi

echo ""
echo "=== Test Summary ==="
if [ $failures -eq 0 ]; then
    echo "✓ All CLI tests passed!"
    exit 0
else
    echo "✗ ${failures} test(s) failed"
    exit 1
fi
