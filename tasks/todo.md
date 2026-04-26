# Bug Fixes: Prefab Variant and Component Workflows

## Tasks

- [x] Bug 2: Fix Rust FIELD_DECL_RE regex to exclude expression-bodied properties
- [x] Bug 1: Fix BigInt precision loss in create component fileIDs
- [x] Bug 7: Fix read target to return source prefab GUID for variants
- [x] Bug 4: Add --managed-reference flag + --object-reference validation
- [x] Fix SamplePrefabVariant.prefab fixture format
- [x] Bugs 3, 5, 6: Add regression tests for already-fixed bugs (Bug 3 already had tests; 5 and 6 added)
- [x] Verify: cargo test + bun test pass (178 Rust + 922 TS + 105 doc-indexer)

## Review

### Bug 1 (fileID precision)
- Changed `createGenericComponentYAML`, `createMonoBehaviourYAML`, `createGameObjectYAML` to accept `string` IDs
- Removed all `parseInt` on fileIDs in `create.ts` and `update.ts`
- Updated `types.ts` interfaces: `component_id`, `game_object_id`, `transform_id`, `prefab_instance_id` now `string`
- Also fixed `ReparentGameObjectResult` and `EditTransformOptions` for consistency

### Bug 2 (expression-bodied properties)
- Changed `FIELD_DECL_RE` regex in `rust-core/src/csharp/mod.rs`: `[;=]` to `(?:;|=[^>])` to exclude `=>`

### Bug 4 (managed reference)
- Added managed reference support for prefab override editing
- Added PPtr format validation warning for object references
- Both `editPrefabOverride` and `batchEditPrefabOverrides` support `managed_reference`

### Bug 7 (read target GUID)
- `read target` on PrefabVariants now extracts source GUID from `m_SourcePrefab` instead of variant's `.meta`

### Files modified
- `rust-core/src/csharp/mod.rs` (regex + test)
- `unity-agentic-tools/src/editor/create.ts` (parseInt removal, string signatures)
- `unity-agentic-tools/src/editor/update.ts` (managed_reference, parseInt removal)
- `unity-agentic-tools/src/types.ts` (number to string, managed_reference fields)
- `unity-agentic-tools/test/editor.test.ts` (assertion fixes + 4 new tests)
- `unity-agentic-tools/test/fixtures/SamplePrefabVariant.prefab` (correct managed ref format)
