# delete -- 6 commands

| Command | What it does |
|---------|-------------|
| `delete gameobject <file> <name>` | Delete GameObject and its hierarchy |
| `delete component <file> <file_id>` | Remove component by fileID |
| `delete build <scene>` | Remove scene from build settings (`--project <path>` optional; defaults to cwd) |
| `delete prefab <file> <instance>` | Delete PrefabInstance and stripped/added blocks |
| `delete asset <file>` | Delete asset file + `.meta` sidecar (missing `.meta` => warning + success) |
| `delete package <name>` | Remove package from manifest.json (`--project <path>` optional; defaults to cwd) |

## Loaded edit protection

When the editor bridge is connected, mutating `.unity` and `.prefab` files requires `--bypass-loaded-protection` if the target is currently loaded/open in Unity.
