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

# Test 2: Find GameObjects (exact)
echo ""
echo "Test 2: Find GameObjects (exact match)"
if run_cli "test2" bun dist/cli.js find test/fixtures/SampleScene.unity "Player" --exact --json; then
    echo "✓ Find exact command works"
else
    echo "✗ Find exact command failed"
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

# Test 4: Edit property (temp copy)
echo ""
echo "Test 4: Edit property (temp copy)"
fixture_path="test/fixtures/SampleScene.unity"
temp_fixture_path="$tmp_dir/SampleScene.unity"

cp "$fixture_path" "$temp_fixture_path"

if run_cli "test4" bun dist/cli.js update gameobject "$temp_fixture_path" "Player" "m_IsActive" "false" --json; then
    echo "✓ Edit command works"
    echo "  Changes persisted in temp file"
else
    echo "✗ Edit command failed"
    failures=$((failures + 1))
fi

# Test 5: Create GameObject
echo ""
echo "Test 5: Create GameObject"
cp "$fixture_path" "$tmp_dir/create-test.unity"

if run_cli "test5" bun dist/cli.js create gameobject "$tmp_dir/create-test.unity" "NewTestObject" --json; then
    # Verify the object was created by finding it
    if bun dist/cli.js find "$tmp_dir/create-test.unity" "NewTestObject" --exact 2>/dev/null | grep -q '"count": 1'; then
        echo "✓ Create command works"
    else
        echo "✗ Create command: object not found after creation"
        failures=$((failures + 1))
    fi
else
    echo "✗ Create command failed"
    failures=$((failures + 1))
fi

# Test 6: Create with parent
echo ""
echo "Test 6: Create GameObject with parent"
cp "$fixture_path" "$tmp_dir/parent-test.unity"

if run_cli "test6" bun dist/cli.js create gameobject "$tmp_dir/parent-test.unity" "ChildObject" --parent "Player" --json; then
    # Verify parent relationship by checking m_Father in the file
    if grep -q "m_Father: {fileID: 1847675924}" "$tmp_dir/parent-test.unity"; then
        echo "✓ Create with parent works"
    else
        echo "✗ Create with parent: m_Father not set correctly"
        failures=$((failures + 1))
    fi
else
    echo "✗ Create with parent failed"
    failures=$((failures + 1))
fi

# Test 7: Edit transform
echo ""
echo "Test 7: Edit Transform"
cp "$fixture_path" "$tmp_dir/transform-test.unity"

# First create an object to get a known transform ID
create_output=$(bun dist/cli.js create gameobject "$tmp_dir/transform-test.unity" "TransformTestObj" 2>&1)
transform_id=$(echo "$create_output" | grep -o '"transform_id": [0-9]*' | grep -o '[0-9]*')

if [ -n "$transform_id" ]; then
    if run_cli "test7" bun dist/cli.js update transform "$tmp_dir/transform-test.unity" "$transform_id" --position "10,20,30" --scale "2,2,2" --json; then
        # Verify the transform was updated
        if grep -q "m_LocalPosition: {x: 10, y: 20, z: 30}" "$tmp_dir/transform-test.unity"; then
            echo "✓ Edit transform works"
        else
            echo "✗ Edit transform: position not updated"
            failures=$((failures + 1))
        fi
    else
        echo "✗ Edit transform failed"
        failures=$((failures + 1))
    fi
else
    echo "✗ Edit transform: could not get transform ID from create"
    failures=$((failures + 1))
fi

# Test 8: Add component
echo ""
echo "Test 8: Add Component"
cp "$fixture_path" "$tmp_dir/component-test.unity"

if run_cli "test8" bun dist/cli.js create component "$tmp_dir/component-test.unity" "Player" "BoxCollider" --json; then
    # Verify BoxCollider was added
    if grep -q "BoxCollider:" "$tmp_dir/component-test.unity"; then
        echo "✓ Add component works"
    else
        echo "✗ Add component: BoxCollider not found in file"
        failures=$((failures + 1))
    fi
else
    echo "✗ Add component failed"
    failures=$((failures + 1))
fi

# Test 9: Create prefab variant
echo ""
echo "Test 9: Create Prefab Variant"
prefab_path="test/fixtures/SamplePrefab.prefab"
variant_path="$tmp_dir/TestVariant.prefab"

if run_cli "test9" bun dist/cli.js create prefab-variant "$prefab_path" "$variant_path" --name "TestVariant" --json; then
    # Verify variant was created with correct structure
    if grep -q "PrefabInstance:" "$variant_path" && grep -q "stripped" "$variant_path"; then
        echo "✓ Create prefab variant works"
    else
        echo "✗ Create prefab variant: invalid structure"
        failures=$((failures + 1))
    fi
else
    echo "✗ Create prefab variant failed"
    failures=$((failures + 1))
fi

# Test 10: Find PrefabInstance by name
echo ""
echo "Test 10: Find PrefabInstance by name"
find_prefab_output=$(bun dist/cli.js find test/fixtures/SceneWithPrefab.unity "MyEnemy" --json 2>&1)
if echo "$find_prefab_output" | grep -q '"resultType": "PrefabInstance"'; then
    echo "✓ Find returns PrefabInstance results"
else
    echo "✗ Find did not return PrefabInstance results"
    cat <<< "$find_prefab_output"
    failures=$((failures + 1))
fi

# Test 11: Find returns mixed results (GO + PrefabInstance)
echo ""
echo "Test 11: Find mixed results (GameObject + PrefabInstance)"
find_mixed_output=$(bun dist/cli.js find test/fixtures/SceneWithPrefab.unity "m" --json 2>&1)
has_go=$(echo "$find_mixed_output" | grep -c '"resultType": "GameObject"' || true)
has_pi=$(echo "$find_mixed_output" | grep -c '"resultType": "PrefabInstance"' || true)
if [ "$has_go" -gt 0 ] && [ "$has_pi" -gt 0 ]; then
    echo "✓ Find returns both GameObjects and PrefabInstances"
else
    echo "✗ Find did not return both types (GO=$has_go, PI=$has_pi)"
    cat <<< "$find_mixed_output"
    failures=$((failures + 1))
fi

# Test 12: Full workflow - create, add components, edit transform
echo ""
echo "Test 12: Full workflow (create → add components → edit transform)"
cp "$fixture_path" "$tmp_dir/workflow-test.unity"

# Create object
workflow_output=$(bun dist/cli.js create gameobject "$tmp_dir/workflow-test.unity" "WorkflowObject" 2>&1)
wf_transform_id=$(echo "$workflow_output" | grep -o '"transform_id": [0-9]*' | grep -o '[0-9]*')

if [ -n "$wf_transform_id" ]; then
    # Add components
    bun dist/cli.js create component "$tmp_dir/workflow-test.unity" "WorkflowObject" "BoxCollider" > /dev/null 2>&1
    bun dist/cli.js create component "$tmp_dir/workflow-test.unity" "WorkflowObject" "Rigidbody" > /dev/null 2>&1

    # Edit transform
    bun dist/cli.js update transform "$tmp_dir/workflow-test.unity" "$wf_transform_id" --position "5,10,15" > /dev/null 2>&1

    # Verify all changes
    if grep -q "BoxCollider:" "$tmp_dir/workflow-test.unity" && \
       grep -q "Rigidbody:" "$tmp_dir/workflow-test.unity" && \
       grep -q "m_LocalPosition: {x: 5, y: 10, z: 15}" "$tmp_dir/workflow-test.unity"; then
        echo "✓ Full workflow works"
    else
        echo "✗ Full workflow: some changes not applied"
        failures=$((failures + 1))
    fi
else
    echo "✗ Full workflow: could not create initial object"
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
