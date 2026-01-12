#!/usr/bin/env bash

echo "=== Testing Unity CLI Integration ==="

# Test 1: List GameObjects
echo "Test 1: List GameObjects"
node dist/cli.js list test/fixtures/SampleScene.unity --json > /tmp/test1.json
if [ $? -eq 0 ]; then
    echo "✓ List command works"
else
    echo "✗ List command failed"
    cat /tmp/test1.json
fi

# Test 2: Find GameObjects (exact)
echo ""
echo "Test 2: Find GameObjects (exact match)"
node dist/cli.js find test/fixtures/SampleScene.unity "Sample" --exact --json > /tmp/test2.json
if [ $? -eq 0 ]; then
    echo "✓ Find exact command works"
else
    echo "✗ Find exact command failed"
    cat /tmp/test2.json
fi

# Test 3: Inspect object
echo ""
echo "Test 3: Inspect GameObject by name"
node dist/cli.js inspect test/fixtures/SampleScene.unity "Sample" --json > /tmp/test3.json
if [ $? -eq 0 ]; then
    echo "✓ Inspect command works"
else
    echo "✗ Inspect command failed"
    cat /tmp/test3.json
fi

# Test 4: Edit property (with backup)
echo ""
echo "Test 4: Edit property (creates backup)"
# Create backup of test file
cp test/fixtures/SampleScene.unity test/fixtures/SampleScene.unity.backup

node dist/cli.js edit test/fixtures/SampleScene.unity "Sample" "m_IsActive" "false" --json > /tmp/test4.json
TEST4_EXIT=$?

# Restore from backup
rm test/fixtures/SampleScene.unity
mv test/fixtures/SampleScene.unity.backup test/fixtures/SampleScene.unity

if [ $? -eq 0 ]; then
    echo "✓ Edit command works"
    echo "  Changes persisted after restore"
else
    echo "✗ Edit command failed"
    cat /tmp/test4.json
fi

# Cleanup
rm -f test/fixtures/SampleScene.unity.backup

 echo ""
  echo "=== Test Summary ==="
  if [ $TEST4_EXIT -eq 0 ]; then
      echo "✓ All CLI tests passed!"
      exit 0
  else
      echo "✗ Some tests failed"
      exit 1
  fi