#!/bin/bash

set -e

echo "🔍 Validating configuration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track errors
ERRORS=0

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Validate JSON file exists and is valid JSON
validate_json() {
    local file=$1
    local description=$2

    if [ ! -f "$file" ]; then
        print_error "$description not found: $file"
        return 1
    fi

    if ! jq empty "$file" 2>/dev/null; then
        print_error "$description is invalid JSON: $file"
        return 1
    fi

    print_success "$description is valid JSON"
    return 0
}

echo ""
echo "Validating Claude Code plugin..."

# Validate Claude Code plugin.json
validate_json ".claude-plugin/plugin.json" "Claude Code plugin manifest"

# Validate plugin.json required fields
if [ -f ".claude-plugin/plugin.json" ]; then
    PLUGIN_NAME=$(jq -r '.name' .claude-plugin/plugin.json 2>/dev/null)
    PLUGIN_DESC=$(jq -r '.description' .claude-plugin/plugin.json 2>/dev/null)
    PLUGIN_VERSION=$(jq -r '.version' .claude-plugin/plugin.json 2>/dev/null)

    if [ "$PLUGIN_NAME" = "null" ] || [ -z "$PLUGIN_NAME" ]; then
        print_error "plugin.json missing required 'name' field"
    else
        print_success "plugin.json has 'name': $PLUGIN_NAME"
    fi

    if [ "$PLUGIN_DESC" = "null" ] || [ -z "$PLUGIN_DESC" ]; then
        print_warning "plugin.json missing 'description' field"
    fi

    if [ "$PLUGIN_VERSION" = "null" ] || [ -z "$PLUGIN_VERSION" ]; then
        print_warning "plugin.json missing 'version' field"
    else
        print_success "plugin.json has 'version': $PLUGIN_VERSION"
    fi
fi

echo ""
echo "Checking version synchronization..."

# Check version synchronization across files
PLUGIN_VERSION=$(jq -r '.version // "not set"' .claude-plugin/plugin.json 2>/dev/null)
UNITY_YAML_VERSION=$(jq -r '.version // "not set"' unity-agentic-tools/package.json 2>/dev/null)

echo "  plugin.json version: $PLUGIN_VERSION"
echo "  unity-agentic-tools/package.json version: $UNITY_YAML_VERSION"

# Compare versions (warn if different, don't error)
if [ "$PLUGIN_VERSION" != "not set" ] && [ "$UNITY_YAML_VERSION" != "not set" ]; then
    if [ "$PLUGIN_VERSION" != "$UNITY_YAML_VERSION" ]; then
        print_warning "Version mismatch: plugin.json ($PLUGIN_VERSION) != unity-agentic-tools/package.json ($UNITY_YAML_VERSION)"
    else
        print_success "Versions are synchronized"
    fi
fi

echo ""
echo "Validating unity-agentic-tools CLI..."

# Check if CLI is built
if [ -f "unity-agentic-tools/dist/cli.js" ]; then
    print_success "unity-agentic-tools CLI is built"

    # Test CLI help command
    if bun unity-agentic-tools/dist/cli.js --help > /dev/null 2>&1; then
        print_success "CLI help command works"
    else
        print_error "CLI help command failed"
    fi
else
    print_warning "unity-agentic-tools CLI not built (run: bun run build)"
fi

echo ""
echo "========================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All validations passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Validation failed with $ERRORS error(s)${NC}"
    exit 1
fi
