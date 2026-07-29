# Contributing

Thanks for contributing to `unity-agentic-tools`.

## Getting Set Up

```bash
git clone --recurse-submodules https://github.com/taconotsandwich/unity-agentic-tools.git
cd unity-agentic-tools
bun run setup-dev
```

If you already cloned without `--recurse-submodules`, run `git submodule update --init --recursive`. `test/fixtures/external` is a submodule holding a real Unity project, and the build-settings and build-version tests read from it.

`setup-dev` also runs `bun run hooks`, which points `core.hooksPath` at `.githooks/`. Pre-commit runs type-check plus unit tests; pre-push adds the CLI integration suite. Use `--no-verify` to bypass a hook for one command, and `bun run teardown-dev` to turn them off.

Prerequisites: Bun, and — only for `build:unity-package` — a local Unity Editor install and the .NET SDK.

## Branching

- `main` is the release branch.
- `dev` is the integration branch for ongoing work.
- Create your working branch from `dev` and open pull requests back into `dev`.
- When preparing a release (for example `0.5.0`), merge `dev` into `main`, then tag `main` with `v0.5.0`.

## Branch Name Rules

Use lowercase kebab-case and keep names short and descriptive.

- `feat/<scope>-<short-desc>`
- `fix/<scope>-<short-desc>`
- `docs/<short-desc>`
- `refactor/<scope>-<short-desc>`
- `test/<short-desc>`
- `chore/<short-desc>`

Examples:

- `feat/editor-ui-snapshot-timeout`
- `fix/prefab-classid-drift`
- `docs/contributing-guidelines`

## Commit Message Format

Follow conventional commit style:

`<type>(<scope>): <imperative summary>`

Use these types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `release`

Examples:

- `feat(editor): add timeout option for ui-focus`
- `fix(update): enforce strict classid drift checks`
- `docs(contributing): define branching and release flow`
- `release: prepare v0.5.0`

## Pull Requests

- Target `dev` for normal feature/fix/doc work.
- Keep PRs focused and include a short why-focused description.
- Ensure local checks pass before opening or updating a PR. This list mirrors what CI runs, so a clean pass here should mean a green PR:
  - `bun run build`
  - `bun run type-check`
  - `bun run check:classids`
  - `bun run test`
  - `bun run test:integration`

`check:classids` fetches Unity's ClassID reference over the network, so it fails without a connection rather than because your change is wrong.

Three things CI does not cover, because they need a local Unity install:

- `bun run build:unity-package` — compiles the C# bridge package.
- `bun run test:integration:unity` — headless Editor validation. Needs `--unity-bin` or `UNITY_BIN` pointing at a Unity executable.
- `bun run test:integration:stress` — drives an already-open Editor through play mode while issuing reads, then reports transient failures and per-target latency. Needs `--project` or `UNITY_PROJECT` pointing at a project whose Editor is running with the bridge installed. Exits non-zero if any call failed.

Run the first two yourself when you touch `unity-package/`, and the third when you touch retry or transport behaviour in `src/editor-client.ts`.

## Release Format

GitHub release notes should contain a single section only:

`## What's Changed`

Under that heading, add 2-4 concise bullets that summarize user-visible improvements.
Avoid raw commit dumps, merge-commit lines, and extra sections.
