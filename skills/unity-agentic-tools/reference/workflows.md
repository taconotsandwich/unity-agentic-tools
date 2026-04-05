# Workflows

Multi-step checklists for common Unity tasks.

## 1. New project setup

1. `unity-agentic-tools setup -p <project_path>` -- creates `.unity-agentic/` with GUID cache
2. `unity-agentic-tools status` -- verify native module loaded, cache populated
3. `unity-agentic-tools editor install --project <project_path>` -- install editor bridge package
4. Open project in Unity, wait for import
5. `unity-agentic-tools editor status` -- verify bridge connection

## 2. Inspect-edit-verify

Standard read-before-write pattern for any Unity YAML edit.

1. **Read** the target file to find object names and fileIDs:
   - `read scene <file>` for hierarchy overview
   - `read gameobject <file> <name> --properties` for specific object
   - `read component <file> <fileID>` for a single component
2. **Identify** the fileID or object name to target
3. **Mutate** with the appropriate update/create/delete command
4. **Verify** by re-reading the same target to confirm the change

When editor bridge is connected and target `.unity`/`.prefab` is loaded/open, mutating commands require `--bypass-loaded-protection`.

## 3. Prefab editing

1. `read scene <file> --summary` -- find PrefabInstance names and fileIDs
2. `read overrides <file> <instance_id>` -- see current modifications
3. Choose action:
   - `update prefab override <file> <instance> <path> <value>` -- add/edit override
   - `update prefab remove-override <file> <instance> <path>` -- revert to prefab default
   - `update prefab remove-component <file> <instance> <ref>` -- suppress a component
   - `update prefab unpack <file> <instance>` -- break prefab link entirely
4. `read overrides <file> <instance_id>` -- verify changes

If the prefab is open in Prefab Mode and editor bridge is connected, pass `--bypass-loaded-protection` for file-based mutations.

## 4. Editor bridge UI testing

End-to-end workflow for testing a running Unity application.

1. `editor status` -- confirm bridge is connected
2. `editor play` -- enter play mode
3. `editor wait --scene <name>` -- wait for target scene to load
4. `editor hierarchy-snapshot` -- get `@hN` refs for scene objects
5. `editor ui-snapshot` -- get `@uN` refs for interactive UI elements
6. `editor screenshot --annotate` -- capture annotated game view for visual reference
7. Interact with UI:
   - `editor ui-click @uN` -- click buttons
   - `editor ui-fill @uN "text"` -- fill input fields
   - `editor ui-toggle @uN` -- toggle checkboxes
   - `editor ui-slider @uN 0.5` -- set slider values
   - `editor ui-select @uN "Option"` -- select dropdown options
8. `editor wait --ui @uN` or `editor wait --log "text"` -- wait for result
9. `editor screenshot` -- capture result state
10. `editor console-logs` -- check for errors
11. `editor stop` -- exit play mode

Refs (`@hN`, `@uN`) invalidate on scene change, play mode transition, or domain reload. Re-snapshot to refresh.

## 5. Batch editing

For applying the same change across many objects.

1. **Search** for targets:
   - `search <project> -n "pattern"` -- find matching objects across files
   - `search <file> "pattern"` -- find within a single file
2. **Construct** the edits JSON:
   - `update batch`: `[{"object_name":"...","property":"...","value":"..."}]`
   - `update batch-components`: `[{"file_id":"...","property":"...","value":"..."}]`
3. **Execute**: `update batch <file> '<json>'` or `update batch-components <file> '<json>'`
4. **Verify**: Re-read affected objects to confirm changes

## 6. Animation editing

Read-modify-verify workflow for AnimationClips and AnimatorControllers.

1. **Read** the current state:
   - `read animation <file>` -- see curves, events, settings
   - `read animator <file> --states` -- see states per layer
   - `read animator <file> --transitions` -- see transitions with conditions
2. **Edit** curves or states:
   - `update animation-curves <file> --add-curve '<json>'` -- add a curve
   - `update animation-curves <file> --set-keyframes '<json>'` -- modify keyframes
   - `update animator-state <file> --add-state Idle --motion <clip_guid>` -- add state
   - `update animator-state <file> --add-transition Idle:Walk --condition "Speed,Greater,0.1"` -- add transition
3. **Verify** by re-reading:
   - `read animation <file>` -- confirm curves/keyframes
   - `read animator <file> --transitions` -- confirm transitions
