# create -- 14 commands

| Command | What it does |
|---------|-------------|
| `create gameobject <file> <name>` | New GameObject (`-p <parent>`) |
| `create scene <path>` | New .unity file (`--defaults` for Camera+Light) |
| `create prefab-variant <source> <output>` | Prefab Variant from source |
| `create scriptable-object <path> <script>` | New .asset for a script |
| `create meta <script_path>` | Generate .meta file (MonoImporter) |
| `create component <file> <name> <component>` | Add component to GameObject |
| `create component-copy <file> <src_id> <target>` | Copy component to another object |
| `create build <project> <scene>` | Add scene to build settings |
| `create material <path> --shader <guid>` | New Material (.mat) |
| `create package <project> <name> <version>` | Add package to manifest.json |
| `create input-actions <path> <name>` | Blank .inputactions file |
| `create animation <path> [name]` | Blank .anim file (`--sample-rate`, `--loop`) |
| `create animator <path> [name]` | Blank .controller file |
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
