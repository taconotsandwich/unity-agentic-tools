# Add `editor invoke` and Remove 7 Thin-Wrapper Commands

## Tasks

- [x] Modify `cmd-editor.ts`: remove 7 commands, add `invoke`
- [x] Create `InvokeHandler.cs` (new C# handler)
- [x] Delete `AssetsHandler.cs`
- [x] Delete `MenuHandler.cs`
- [x] Delete `SelectionHandler.cs`
- [x] Modify `SceneHandler.cs`: remove `getActive` case
- [x] Modify `MessageDispatcherTests.cs`: remove stale tests, add invoke test
- [x] Update `commands-editor.md`
- [x] Update `SKILL.md`
- [x] Update `CLAUDE.md`
- [x] Build and verify

## Review

All changes complete. Build: clean. Tests: 888 pass.

- Removed 7 thin-wrapper commands: `refresh`, `compiling`, `active-scene`, `menu`, `selection-get`, `selection-set`, `selection-clear`
- Deleted corresponding C# handlers: `AssetsHandler.cs`, `MenuHandler.cs`, `SelectionHandler.cs`
- Removed `getActive` case from `SceneHandler.cs`
- Added `editor invoke <type> <member> [args...]` with `--set` and `--args` options
- Added `InvokeHandler.cs`: reflection-based static property/method invoker with `FindType` scanning all loaded assemblies
- Updated `MessageDispatcherTests.cs`: removed 3 stale tests, added `Dispatch_InvokeStaticProperty_ReturnsValue`
- Updated docs: `commands-editor.md` (49→43), `SKILL.md` (49→43, 125→119), `CLAUDE.md` (49→43, 125→119)
- Synced skill to global install
- All `editor refresh` references updated to `editor invoke UnityEditor.AssetDatabase Refresh`
