#!/bin/bash

set -e

echo "🔍 Validating extension configurations..."

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

# Validate TOML file exists and is valid TOML
validate_toml() {
    local file=$1
    local description=$2
    
    if [ ! -f "$file" ]; then
        print_error "$description not found: $file"
        return 1
    fi
    
    # Basic TOML validation - check for balanced brackets
    if ! grep -q '^\[' "$file"; then
        print_warning "$description may not be valid TOML (no sections found): $file"
        return 1
    fi
    
    print_success "$description exists"
    return 0
}

echo ""
echo "Validating marketplace.json schema..."

# Validate marketplace.json exists and has required fields
if [ -f "marketplace.json" ]; then
    validate_json "marketplace.json" "Marketplace manifest"

    # Check required fields
    NAME=$(jq -r '.name' marketplace.json 2>/dev/null)
    OWNER=$(jq -r '.owner.name' marketplace.json 2>/dev/null)
    PLUGINS=$(jq -r '.plugins | length' marketplace.json 2>/dev/null)

    if [ "$NAME" = "null" ] || [ -z "$NAME" ]; then
        print_error "marketplace.json missing required 'name' field"
    else
        print_success "marketplace.json has 'name': $NAME"
    fi

    if [ "$OWNER" = "null" ] || [ -z "$OWNER" ]; then
        print_error "marketplace.json missing required 'owner.name' field"
    else
        print_success "marketplace.json has 'owner.name': $OWNER"
    fi

    if [ "$PLUGINS" = "0" ] || [ "$PLUGINS" = "null" ]; then
        print_error "marketplace.json has no plugins defined"
    else
        print_success "marketplace.json defines $PLUGINS plugin(s)"

        # Validate each plugin has required fields
        for i in $(seq 0 $((PLUGINS-1))); do
            PLUGIN_NAME=$(jq -r ".plugins[$i].name" marketplace.json)
            PLUGIN_SOURCE=$(jq -r ".plugins[$i].source" marketplace.json)

            if [ "$PLUGIN_NAME" = "null" ] || [ -z "$PLUGIN_NAME" ]; then
                print_error "Plugin $i missing required 'name' field"
            fi

            if [ "$PLUGIN_SOURCE" = "null" ] || [ -z "$PLUGIN_SOURCE" ]; then
                print_error "Plugin $i missing required 'source' field"
            elif [ "$PLUGIN_SOURCE" = "." ]; then
                print_error "Plugin $i has invalid source '.', use './' instead"
            fi
        done
    fi
else
    print_error "marketplace.json not found"
fi

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
MARKETPLACE_VERSION=$(jq -r '.plugins[0].version // "not set"' marketplace.json 2>/dev/null)
PLUGIN_VERSION=$(jq -r '.version // "not set"' .claude-plugin/plugin.json 2>/dev/null)
UNITY_YAML_VERSION=$(jq -r '.version // "not set"' unity-yaml/package.json 2>/dev/null)

echo "  marketplace.json version: $MARKETPLACE_VERSION"
echo "  plugin.json version: $PLUGIN_VERSION"
echo "  unity-yaml/package.json version: $UNITY_YAML_VERSION"

# Compare versions (warn if different, don't error)
if [ "$PLUGIN_VERSION" != "not set" ] && [ "$UNITY_YAML_VERSION" != "not set" ]; then
    if [ "$PLUGIN_VERSION" != "$UNITY_YAML_VERSION" ]; then
        print_warning "Version mismatch: plugin.json ($PLUGIN_VERSION) != unity-yaml/package.json ($UNITY_YAML_VERSION)"
    else
        print_success "Versions are synchronized"
    fi
fi

# Extract and validate referenced files from plugin.json
if [ -f ".claude-plugin/plugin.json" ]; then
    echo ""
    echo "Checking referenced Claude Code files..."
    
    # Get commands path pattern
    COMMANDS_PATH=$(jq -r '.commands' .claude-plugin/plugin.json 2>/dev/null)
    if [ "$COMMANDS_PATH" != "null" ] && [ -n "$COMMANDS_PATH" ]; then
        # Expand ${CLAUDE_PLUGIN_ROOT} variable
        COMMANDS_PATH=$(echo "$COMMANDS_PATH" | sed 's/\${CLAUDE_PLUGIN_ROOT}/./g')
        COMMANDS_COUNT=$(find . -path "$COMMANDS_PATH" 2>/dev/null | wc -l)
        if [ "$COMMANDS_COUNT" -gt 0 ]; then
            print_success "Found $COMMANDS_COUNT command files"
        else
            print_warning "No command files found matching: $COMMANDS_PATH"
        fi
    fi

    # Get agents path pattern
    AGENTS_PATH=$(jq -r '.agents' .claude-plugin/plugin.json 2>/dev/null)
    if [ "$AGENTS_PATH" != "null" ] && [ -n "$AGENTS_PATH" ]; then
        AGENTS_PATH=$(echo "$AGENTS_PATH" | sed 's/\${CLAUDE_PLUGIN_ROOT}/./g')
        AGENTS_COUNT=$(find . -path "$AGENTS_PATH" 2>/dev/null | wc -l)
        if [ "$AGENTS_COUNT" -gt 0 ]; then
            print_success "Found $AGENTS_COUNT agent files"
        else
            print_warning "No agent files found matching: $AGENTS_PATH"
        fi
    fi

    # Validate hooks file exists
    HOOKS_PATH=$(jq -r '.hooks' .claude-plugin/plugin.json 2>/dev/null)
    if [ "$HOOKS_PATH" != "null" ] && [ -n "$HOOKS_PATH" ]; then
        HOOKS_PATH=$(echo "$HOOKS_PATH" | sed 's/\${CLAUDE_PLUGIN_ROOT}/./g')
        if [ -f "$HOOKS_PATH" ]; then
            validate_json "$HOOKS_PATH" "Hooks file"
        else
            print_error "Hooks file not found: $HOOKS_PATH"
        fi
    fi
fi


echo ""
echo "Validating unity-yaml CLI..."

# Check if CLI is built
if [ -f "unity-yaml/dist/cli.js" ]; then
    print_success "unity-yaml CLI is built"

    # Test CLI help command
    if bun unity-yaml/dist/cli.js --help > /dev/null 2>&1; then
        print_success "CLI help command works"
    else
        print_error "CLI help command failed"
    fi
else
    print_warning "unity-yaml CLI not built (run: cd unity-yaml && bun run build:cli)"
fi

echo ""
echo "Validating MCP server..."

# Check if MCP server is built
if [ -f "mcp-server.mjs" ]; then
    print_success "MCP server is built"
else
    print_warning "MCP server not built (run: npm run build:mcp-server)"
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
