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
- When preparing a release (for example `0.5.0`), add its `CHANGELOG.md` section, merge `dev` into `main`, run `bun scripts/sync-version.js --set 0.5.0` and commit, then push `main`. Before tagging, run the preflight — it checks every precondition the release workflow enforces, while the tag is still cheap to not create:

```bash
bun run release:preflight 0.5.0
```

  Tag `v0.5.0` only once it passes. The preflight is read-only: it never tags, pushes, publishes, commits, or moves a branch, so it is safe to run at any point.

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

Four things CI does not cover, because they need a local Unity install:

- `bun run build:unity-package` — compiles the C# bridge package.
- `bun run test:integration:unity` — headless Editor validation. Needs `--unity-bin` or `UNITY_BIN` pointing at a Unity executable.
- `bun run test:integration:unity-tests` — runs the bridge package's EditMode tests in a throwaway Unity project. Same `--unity-bin`/`UNITY_BIN` contract. Reports total/passed/failed/skipped and exits non-zero on any failure, on a run that never reached the test runner, and on a run that executed zero tests. That last case matters: Unity exits 0 when a filter matches nothing.
- `bun run test:integration:stress` — drives an already-open Editor through play mode while issuing reads, then reports transient failures and per-target latency. Needs `--project` or `UNITY_PROJECT` pointing at a project whose Editor is running with the bridge installed. Exits non-zero if any call failed.

Run the first three when you touch `unity-package/`, and the fourth when you touch retry or transport behaviour in `src/editor-client.ts`.

These stay local on purpose, not as a gap waiting on CI. Running them in CI means a Unity licence in a GitHub secret and a licensing round trip on every job, for tests whose whole value is that a real Editor executed them. They are a pre-release gate a human runs, and `test/editor-tests-harness.test.ts` keeps the harness's own parsing under CI without needing Unity.

```bash
bun run test:integration:unity-tests -- --unity-bin /Applications/Unity/Hub/Editor/6000.4.0f1/Unity.app/Contents/MacOS/Unity
```

## Release Format

Release notes live in `CHANGELOG.md`, one `## <version>` section per release. The
workflow reads the section matching the tag and publishes it under a single
`## What's Changed` heading.

Write 2-4 concise bullets that summarize user-visible improvements. Avoid raw
commit dumps, merge-commit lines, and extra sections.

A tag with no section fails the release, deliberately before the npm publish step
rather than after it. But a workflow failure means the tag is already public and
has to be deleted locally and on the remote before retrying, so check before
tagging instead — `release:preflight` covers this along with version sync, a
clean tree, tag availability, and the `origin/main` HEAD rule:

```bash
bun run release:preflight 0.7.0
```

To check the notes alone:

```bash
bun scripts/release-notes.js --check 0.7.0
```
