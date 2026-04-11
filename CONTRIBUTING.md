# Contributing

Thanks for contributing to `unity-agentic-tools`.

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
- Ensure local checks pass before opening or updating a PR:
  - `bun run build:rust`
  - `bun run build`
  - `bun run type-check`
  - `bun run test`
  - `bun run test:integration`

## Release Format

GitHub release notes should contain a single section only:

`## What's Changed`

Under that heading, add 2-4 concise bullets that summarize user-visible improvements.
Avoid raw commit dumps, merge-commit lines, and extra sections.
