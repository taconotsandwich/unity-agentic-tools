# Core Unity Agentic Tools Guidance

Use this guidance for the unified `unity-agentic-tools` skill.

## Contract

- Treat `unity-agentic-tools` as the stable public interface.
- Use the compact command runner: `status`, `list`, `run`, `stream`, `install`, `uninstall`, and `cleanup`.
- Do not add a new CLI command for each Unity operation. Add Unity-side aliases or `[AgenticCommand]` wrappers.
- Prefer built-in aliases before raw public static C# targets.
- Do not manually mutate Unity serialized files unless the user explicitly asks for raw file work.

Avoid raw edits to:

- `.unity`
- `.prefab`
- `.asset`
- `.mat`
- `.anim`
- `.controller`
- `.meta`
- `ProjectSettings/`

## Routing

Use `unity-agentic-tools` for CLI setup, command discovery, command execution, high-level project automation, and live Unity Editor bridge workflows.

## Default Loop

1. Check connection with `unity-agentic-tools status -p <project>`.
2. Discover commands with `unity-agentic-tools list <query> -p <project>`.
3. Inspect current state with `query.*`, `scene.hierarchy`, `ui.snapshot`, or screenshots.
4. Mutate through `unity-agentic-tools run <alias> ... -p <project>`.
5. Verify with the matching query, snapshot, screenshot, tests, or console stream.

## Raw API Rule

Raw public static APIs are allowed only when no alias or project `[AgenticCommand]` wrapper exists.

```bash
unity-agentic-tools run UnityEditor.AssetDatabase.Refresh -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.isCompiling -p <project>
unity-agentic-tools run UnityEditor.EditorApplication.ExecuteMenuItem "File/Save" -p <project>
```
