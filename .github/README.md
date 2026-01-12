# GitHub Actions Workflows

This directory contains GitHub Actions workflows for testing and CI/CD.

## Workflows

### `ci.yml`
Quick CI workflow that runs on every push and pull request:
- Runs on Ubuntu with Node.js 20.x
- Installs dependencies
- Builds all projects
- Runs unit tests
- Runs CLI integration tests
- Validates extension configurations (Claude Code & Gemini CLI)
- Provides fast feedback for PRs

### `test.yml`
Comprehensive test suite that runs on:
- **OS**: Ubuntu, macOS, Windows
- **Node.js**: 18.x, 20.x, 22.x

Steps:
- Install dependencies
- Build MCP server and unity-yaml library
- Run unit tests
- Run CLI integration tests
- Validate extension configurations (Claude Code & Gemini CLI)
- Generate test coverage (on Ubuntu + Node 20.x)

## Usage

These workflows run automatically on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop` branches

## Extension Validation

The validation script (`.github/scripts/validate-extensions.sh`) checks:

**Claude Code:**
- `plugin.json` is valid JSON
- Referenced command files exist
- Referenced agent files exist
- Hooks file exists and is valid

**Gemini CLI:**
- `gemini-extension.json` is valid JSON
- MCP server configurations are valid
- Command files in `commands/` directory
- Context files (if referenced)

**CLI & MCP:**
- unity-yaml CLI is built and functional
- MCP server is built

## Local Testing

Before pushing, you can run the same tests locally:

```bash
# Install dependencies
npm ci
cd unity-yaml && npm ci && cd ..

# Build all projects
npm run build
cd unity-yaml && npm run build && cd ..

# Run tests
cd unity-yaml && npm test

# Run CLI integration tests
cd unity-yaml && bash test/cli-integration.test.sh

# Run coverage
cd unity-yaml && npm run test:coverage

# Validate extension configurations
bash .github/scripts/validate-extensions.sh
```
