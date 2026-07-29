# Changelog

The release workflow reads the section matching the tag and uses it as the
GitHub release body, so tagging fails when the section is missing. Keep entries
to a few bullets covering user-visible changes -- see "Release Format" in
`CONTRIBUTING.md`.

Versions before 0.7.0 are not recorded here; their notes were generated from
commit subjects.

## 0.7.0

- Reads and play mode transitions now wait out Unity domain reloads instead of failing, bounded by a 30s deadline while the Editor is alive. Transient read failures across repeated play cycles measure zero.
- `stream` reconnects across domain reloads on its own, and reports a lost stream instead of sitting silently connected to nothing.
- `play.enter`/`play.exit` report the state Unity is actually in rather than the one requested, and `status` now reports what the Editor is busy with.
- Dropped the Rust native module and doc-indexer -- a smaller, pure Bun/TypeScript install.
