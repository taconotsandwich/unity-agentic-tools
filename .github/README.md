# CI Workflows

## ci.yml

Runs on every push and PR:
- Build packages
- Run unit tests
- Run integration tests
- Validate plugin config

## test.yml

Full matrix test:
- **Platforms**: Ubuntu, macOS, Windows
- **Runtime**: Bun

## Local Testing

```bash
bun install
bun run build
bun run test
bun run test:integration
```

## Validation

The validation script checks:
- `plugin.json` validity
- CLI builds correctly
- Package versions sync
