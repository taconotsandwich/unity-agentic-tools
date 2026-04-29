# Troubleshooting

## Bridge Not Reachable

1. Run `unity-agentic-tools status -p <project>`.
2. If the package is missing, run `unity-agentic-tools install -p <project>`.
3. Open Unity and wait for import/compile.
4. If lock state is stale, run `unity-agentic-tools cleanup -p <project>`.
5. Re-run `unity-agentic-tools status -p <project>`.

Use `--port <n>` only when targeting a known bridge port manually.

## Stale Refs

Hierarchy refs (`@hN`) and UI refs (`@uN`) are temporary. Refresh them after:

- scene changes
- play mode transitions
- domain reloads
- object destruction
- UI rebuilds

Use:

```bash
unity-agentic-tools run scene.hierarchy -p <project>
unity-agentic-tools run ui.snapshot -p <project>
```

## Duplicate Hierarchy Paths

Duplicate paths fail explicitly. Query the scene, identify the exact hierarchy location, then use a unique path or ref-based workflow.

## JSON Args

Use `--args '<json array>'` when positional quoting becomes ambiguous or an argument is structured JSON.

```bash
unity-agentic-tools run update.batch --args '["Assets/Scenes/Main.unity","[{\"gameObjectPath\":\"Player\",\"propertyPath\":\"m_Name\",\"value\":\"Hero\"}]"]' -p <project>
```

## Verification

After mutations:

- Check the command JSON for `success: false`.
- Re-query the target object or scene.
- Use `stream console --duration 5000` when Unity-side errors are possible.
- Use screenshots or tests for UI and play mode work.
