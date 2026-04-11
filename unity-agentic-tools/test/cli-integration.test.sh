#!/usr/bin/env bash

set -u

echo "=== Testing Unity CLI Integration ==="

# Check if native module is available
status_output=$(bun dist/cli.js status 2>&1)
if echo "$status_output" | grep -q '"native_module": false'; then
    echo "⚠ Native Rust module not available - skipping integration tests"
    echo "  Run bun install in the project root"
    exit 0
fi

failures=0
tmp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t unity-cli-test)"
fixture_path="test/fixtures/SampleScene.unity"

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
if run_cli "test1" bun dist/cli.js read scene test/fixtures/SampleScene.unity --json; then
    echo "✓ List command works"
else
    echo "✗ List command failed"
    failures=$((failures + 1))
fi

# Test 2: Search GameObjects in file (exact)
echo ""
echo "Test 2: Search GameObjects in file (exact match)"
if run_cli "test2" bun dist/cli.js search test/fixtures/SampleScene.unity "Player" --exact --json; then
    echo "✓ Search (file mode) exact command works"
else
    echo "✗ Search (file mode) exact command failed"
    failures=$((failures + 1))
fi

# Test 3: Get object by name
echo ""
echo "Test 3: Get GameObject by name"
if run_cli "test3" bun dist/cli.js read gameobject test/fixtures/SampleScene.unity "Player" --json; then
    echo "✓ Get command works"
else
    echo "✗ Get command failed"
    failures=$((failures + 1))
fi

# Test 4: Removed scene mutation commands fail at top level
echo ""
echo "Test 4: Removed scene mutation commands"
removed_commands=(
  "create scene Assets/Scenes/New.unity"
  "create prefab-variant test/fixtures/SamplePrefab.prefab /tmp/TestVariant.prefab"
  "create scriptable-object /tmp/Test.asset TestType"
  "create meta /tmp/Test.cs"
  "create build Assets/Scenes/Main.unity"
  "create material /tmp/Test.mat"
  "create package com.unity.test 1.0.0"
  "create input-actions /tmp/Test.inputactions TestActions"
  "create animation /tmp/Test.anim TestAnim"
  "create animator /tmp/Test.controller TestController"
  "create prefab /tmp/Test.prefab TestPrefab"
  "create gameobject Scene.unity Root"
  "create component Scene.unity Player Rigidbody"
  "create component-copy Scene.unity 12345 Player"
  "create prefab-instance Scene.unity test/fixtures/SamplePrefab.prefab"
  "update gameobject Scene.unity Player m_IsActive false"
  "update transform Scene.unity Player --position 1,2,3"
  "update parent Scene.unity Child Parent"
  "update prefab override Scene.unity AppRoot m_Name AppRoot"
  "update tag add IntegrationTag"
  "update sorting-layer add IntegrationLayer"
  "update build Assets/Scenes/Main.unity --disable"
  "update input-actions test/fixtures/test-input-actions.inputactions --add-map TestMap"
  "update animation-curves test/fixtures/keyframe-test.anim --add-curve '{\"type\":\"float\",\"path\":\"Body\",\"attribute\":\"m_Alpha\",\"classID\":23,\"keyframes\":[{\"time\":0,\"value\":1}]}'"
  "update animator-state test/fixtures/test-animator.controller --add-state Run"
)

removed_ok=1
for command in "${removed_commands[@]}"; do
    if bun dist/cli.js $command > "$tmp_dir/removed-command.out" 2>&1; then
        echo "✗ Removed command unexpectedly succeeded: $command"
        removed_ok=0
    elif grep -q "unknown command" "$tmp_dir/removed-command.out"; then
        :
    else
        echo "✗ Removed command did not fail with unknown command: $command"
        cat "$tmp_dir/removed-command.out"
        removed_ok=0
    fi
done

if [ $removed_ok -eq 1 ]; then
    echo "✓ Removed create and structural update commands are no longer registered"
else
    failures=$((failures + 1))
fi

# Test 5: Search PrefabInstance by name in file
echo ""
echo "Test 5: Search PrefabInstance by name in file"
search_prefab_output=$(bun dist/cli.js search test/fixtures/SceneWithPrefab.unity "MyEnemy" --json 2>&1)
if echo "$search_prefab_output" | grep -q '"resultType": "PrefabInstance"'; then
    echo "✓ Search returns PrefabInstance results"
else
    echo "✗ Search did not return PrefabInstance results"
    cat <<< "$search_prefab_output"
    failures=$((failures + 1))
fi

# Test 6: Search returns mixed results (GO + PrefabInstance)
echo ""
echo "Test 6: Search mixed results (GameObject + PrefabInstance)"
search_mixed_output=$(bun dist/cli.js search test/fixtures/SceneWithPrefab.unity "m" --json 2>&1)
has_go=$(echo "$search_mixed_output" | grep -c '"resultType": "GameObject"' || true)
has_pi=$(echo "$search_mixed_output" | grep -c '"resultType": "PrefabInstance"' || true)
if [ "$has_go" -gt 0 ] && [ "$has_pi" -gt 0 ]; then
    echo "✓ Search returns both GameObjects and PrefabInstances"
else
    echo "✗ Search did not return both types (GO=$has_go, PI=$has_pi)"
    cat <<< "$search_mixed_output"
    failures=$((failures + 1))
fi

# Test 7: CRLF line ending support
echo ""
echo "Test 7: CRLF line endings (Windows-origin files)"

# Convert LF fixture to CRLF at test time — immune to Git normalization
perl -pe 's/\n/\r\n/' "$fixture_path" > "$tmp_dir/crlf-scene.unity"

# Verify the file actually has CRLF
if file "$tmp_dir/crlf-scene.unity" | grep -q "CRLF\|CR"; then
    # Read scene (CRLF) and compare object count to LF original
    lf_count=$(bun dist/cli.js read scene "$fixture_path" --json 2>/dev/null | grep -c '"name"' || true)
    crlf_count=$(bun dist/cli.js read scene "$tmp_dir/crlf-scene.unity" --json 2>/dev/null | grep -c '"name"' || true)

    if [ "$crlf_count" -gt 0 ] && [ "$crlf_count" -eq "$lf_count" ]; then
        echo "✓ CRLF read scene: $crlf_count objects (matches LF)"
    else
        echo "✗ CRLF read scene: got $crlf_count objects, expected $lf_count"
        failures=$((failures + 1))
    fi

    # Search by name in CRLF file
    crlf_search=$(bun dist/cli.js search "$tmp_dir/crlf-scene.unity" "Player" --exact --json 2>/dev/null)
    if echo "$crlf_search" | grep -q '"count": 1'; then
        echo "✓ CRLF search works"
    else
        echo "✗ CRLF search failed"
        failures=$((failures + 1))
    fi

    # Inspect in CRLF file
    if run_cli "test13_inspect" bun dist/cli.js read gameobject "$tmp_dir/crlf-scene.unity" "Player" --json; then
        echo "✓ CRLF inspect works"
    else
        echo "✗ CRLF inspect failed"
        failures=$((failures + 1))
    fi
else
    echo "✗ Could not create CRLF test fixture"
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
