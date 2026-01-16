# GitHub Actions Workflows

This directory contains GitHub Actions workflows for testing and CI/CD.

## Workflows

### `ci.yml`
Quick CI workflow that runs on every push and pull request:
- Runs on Ubuntu with Bun runtime
- Installs dependencies
- Builds all projects
- Runs unit tests
- Runs CLI integration tests
- Validates plugin configuration
- Provides fast feedback for PRs

### `test.yml`
Comprehensive test suite that runs on:
- **OS**: Ubuntu, macOS, Windows
- **Runtime**: Bun (built into Claude Code)

Steps:
- Install dependencies with Bun
- Build MCP server and unity-yaml library
- Run unit tests
- Run CLI integration tests
- Validate plugin configuration
- Generate test coverage

## Usage

These workflows run automatically on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop` branches

## Validation

The validation script (`.github/scripts/validate-extensions.sh`) checks:

**Claude Code Plugin:**
- `plugin.json` is valid JSON
- Plugin metadata is complete
- Versions are synchronized

**CLI & MCP:**
- unity-yaml CLI is built and functional
- MCP server is built

## Local Testing

Before pushing, you can run the same tests locally:

```bash
# Install dependencies
bun install

# Build all projects
bun run build

# Run tests
bun run test

# Run CLI integration tests
cd unity-yaml && bash test/cli-integration.test.sh

# Run coverage
bun run test:coverage

# Validate configurations
bash .github/scripts/validate-extensions.sh
```
