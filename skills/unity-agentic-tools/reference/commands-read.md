# read -- Read Unity files, settings, and build data (21 commands)

| Command | Usage |
|---------|-------|
| `read scene <file>` | GameObject hierarchy (paginated: `--page-size`, `--cursor`, `--max-depth`, `--summary`, `--properties`) |
| `read gameobject <file> <id>` | Single object by name or file ID (`-c <type>` filters components, `--properties` for values) |
| `read asset <file>` | Read any Unity YAML asset file (.asset, .mat, .anim, etc.). Mesh assets auto-decode vertex/index hex data (`--raw` to skip) |
| `read material <file>` | Read a Material file (.mat) with structured property output |
| `read component <file> <file_id>` | Read a single component by fileID |
| `read reference <file> <file_id>` | Trace fileID references |
| `read dependencies <file>` | List asset dependencies (GUIDs referenced by this file) |
| `read dependents <project> <guid>` | Find which files reference a given GUID (reverse dependency lookup) |
| `read unused <project>` | Find potentially unused assets (zero inbound GUID references) |
| `read settings <project> -s <name>` | Read settings (tags, physics, quality, time, input, audio, graphics, player, navmesh) |
| `read build <project>` | Read build settings (scene list, build profiles) |
| `read overrides <file> <instance>` | Read PrefabInstance override modifications |
| `read script <file>` | Extract C# type declarations from a .cs file or .NET DLL |
| `read scripts` | List C# types from the type registry with optional filtering |
| `read log` | Read and filter the Unity Editor.log |
| `read meta <file>` | Read a .meta file and show importer settings |
| `read animation <file>` | Read an AnimationClip file (.anim) |
| `read animator <file>` | Read an AnimatorController file (.controller) |
| `read manifest <project>` | List packages from Packages/manifest.json (`--search <pattern>`) |
| `read input-actions <file>` | Read a Unity Input Actions file (`--summary`, `--maps`, `--actions`, `--bindings`) |
| `read scriptable-object <file>` | Read a ScriptableObject .asset file |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `read prefab <file>` | Use `read scene <file>` -- it handles both `.unity` and `.prefab` files |
| `read scripts --filter <name>` | `--filter` works (alias for `--name`), but `--name` is the canonical flag |
