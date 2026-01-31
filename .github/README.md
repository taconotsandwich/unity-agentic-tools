# GitHub Actions Workflows

This directory contains GitHub Actions workflows for testing and CI/CD.

## Workflows

### `ci.yml`
Quick CI workflow that runs on every push and pull request:
- Runs on Ubuntu with Bun runtime
- Installs dependencies (root + packages)
- Builds packages (unity-yaml + doc-indexer)
- Runs unit tests
- Runs CLI integration tests
- Validates plugin configuration
- Provides fast feedback for PRs

### `test.yml`
Comprehensive test suite that runs on:
- **OS**: Ubuntu, macOS, Windows
- **Runtime**: Bun (built into Claude Code)

Steps:
- Install dependencies with Bun (root + packages)
- Build packages (unity-yaml + doc-indexer)
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
cd unity-yaml && bun install && cd ..
cd doc-indexer && bun install && cd ..

# Build packages
bun run build

# Run tests
bun run test

# Run CLI integration tests (Unix only)
bun run test:integration

# Run coverage
bun run test:coverage

# Validate configurations (Unix only)
bash .github/scripts/validate-extensions.sh
```
