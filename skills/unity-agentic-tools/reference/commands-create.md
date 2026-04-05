# create -- 15 commands

| Command | What it does |
|---------|-------------|
| `create gameobject <file> <name>` | New GameObject (`-p <parent>`) |
| `create scene <path>` | New .unity file (`--defaults` for Camera+Light) |
| `create prefab-variant <source> <output>` | Prefab Variant from source (`-n <name>`) |
| `create prefab-instance <scene> <prefab>` | Instantiate prefab in scene (`-p <parent>`, `--position x,y,z`) |
| `create scriptable-object <path> <script>` | New .asset (`-p <project>`, `--set <json>` -- supports nested objects/arrays) |
| `create meta <script_path>` | Generate .meta file (MonoImporter) |
| `create component <file> <name> <component>` | Add component to GameObject |
| `create component-copy <file> <src_id> <target>` | Copy component to another object |
| `create build <scene>` | Add scene to build settings (`--index <n>`, `--project <path>` optional; defaults to cwd) |
| `create material <path> --shader <guid>` | New Material (.mat) |
| `create package <name> <version>` | Add package to manifest.json (`--project <path>` optional; defaults to cwd) |
| `create input-actions <path> <name>` | Blank .inputactions file |
| `create animation <path> [name]` | Blank .anim file (`--sample-rate`, `--loop`) |
| `create animator <path> [name]` | Blank .controller file (`--layer <name>`) |
| `create prefab <path> [name]` | Blank .prefab file (name defaults to filename) |

## create material

`--shader <guid>` is required. Optional `--name`, `--properties <json>`.

Properties JSON format:
```
--properties '{"floats":{"_Metallic":0.5},"colors":{"_Color":[1,0,0,1]}}'
```

## create component

For custom scripts, pass `-p <project>` so the tool can resolve the script GUID from the type registry.

Built-in types (MeshRenderer, Rigidbody, etc.) don't need `-p`.

`MonoBehaviour` is a base class and cannot be added directly. Provide a concrete script type/path/GUID.

All-zero script GUID (`00000000000000000000000000000000`) is rejected.

Abstract scripts are rejected for component/ScriptableObject creation.

## Loaded edit protection

When the editor bridge is connected, mutating `.unity`/`.prefab` commands (for example `create gameobject`, `create component`, `create component-copy`, `create prefab-instance`) require `--bypass-loaded-protection` if the target file is currently loaded/open in Unity.
