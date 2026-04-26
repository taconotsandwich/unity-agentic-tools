#!/usr/bin/env bash

set -u

echo "=== Testing Unity Command Runner CLI ==="

failures=0
tmp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t unity-cli-test)"

cleanup() {
    rm -rf "$tmp_dir"
}

trap cleanup EXIT

run_cli() {
    local label=$1
    shift
    local out_file="$tmp_dir/${label}.out"

    if "$@" > "$out_file" 2>&1; then
        return 0
    fi

    cat "$out_file"
    return 1
}

expect_failure_contains() {
    local label=$1
    local expected=$2
    shift 2
    local out_file="$tmp_dir/${label}.out"

    if "$@" > "$out_file" 2>&1; then
        echo "[fail] $label unexpectedly succeeded"
        cat "$out_file"
        failures=$((failures + 1))
        return
    fi

    if grep -q "$expected" "$out_file"; then
        echo "[ok] $label"
    else
        echo "[fail] $label did not contain: $expected"
        cat "$out_file"
        failures=$((failures + 1))
    fi
}

echo "Test 1: Top-level help shows only runner commands"
if run_cli "help" bun dist/cli.js --help; then
    help_output="$(cat "$tmp_dir/help.out")"
    if echo "$help_output" | grep -q "list \\[options\\] \\[query\\]" \
        && echo "$help_output" | grep -q "run \\[options\\] <target> \\[args...\\]" \
        && echo "$help_output" | grep -q "stream \\[options\\] \\[topic\\]" \
        && echo "$help_output" | grep -q "cleanup \\[options\\]" \
        && ! echo "$help_output" | grep -q "read \\[options\\]" \
        && ! echo "$help_output" | grep -q "editor \\[options\\]"; then
        echo "[ok] help surface is clean"
    else
        echo "[fail] help surface is not clean"
        echo "$help_output"
        failures=$((failures + 1))
    fi
else
    echo "[fail] help command failed"
    failures=$((failures + 1))
fi

echo ""
echo "Test 2: Removed command groups are not registered"
for command in create read update delete editor search grep clone setup docs version; do
    expect_failure_contains "removed-$command" "unknown command '$command'" bun dist/cli.js "$command"
done

echo ""
echo "Test 3: Stream topic validation happens before bridge connection"
expect_failure_contains "stream-invalid-topic" "Invalid stream topic" bun dist/cli.js stream bad-topic --duration 1

echo ""
echo "Test 4: Status returns bridge-shaped JSON"
if run_cli "status" bun dist/cli.js status; then
    status_output="$(cat "$tmp_dir/status.out")"
    if echo "$status_output" | grep -q '"runtime": "bun"' \
        && echo "$status_output" | grep -q '"project_path"' \
        && echo "$status_output" | grep -q '"bridge"'; then
        echo "[ok] status output is runner-only"
    else
        echo "[fail] status output has unexpected shape"
        echo "$status_output"
        failures=$((failures + 1))
    fi
else
    echo "[fail] status command failed"
    failures=$((failures + 1))
fi

echo ""
echo "=== Test Summary ==="
if [ $failures -eq 0 ]; then
    echo "[ok] All CLI integration tests passed"
    exit 0
else
    echo "[fail] ${failures} test(s) failed"
    exit 1
fi
