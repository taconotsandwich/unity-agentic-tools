# create -- Create Unity objects (14 commands)

| Command | Usage |
|---------|-------|
| `create gameobject <file> <name>` | New GameObject (`-p <parent>` for hierarchy) |
| `create scene <path>` | New .unity file (`--defaults` for Camera+Light) |
| `create prefab-variant <source> <output>` | Prefab Variant from source prefab |
| `create scriptable-object <path> <script>` | New .asset file for a script |
| `create meta <script_path>` | Generate .meta file (MonoImporter) |
| `create component <file> <name> <component>` | Add component (built-in or script with `-p <project>`) |
| `create component-copy <file> <src_id> <target>` | Copy component to another object |
| `create build <project> <scene>` | Add scene to build settings |
| `create material <path> --shader <guid>` | New Material file (.mat) (`--shader` required; `--name`, `--properties` optional) |
| `create package <project> <name> <version>` | Add a package to Packages/manifest.json |
| `create input-actions <path> <name>` | Create a blank .inputactions file |
| `create animation <path> [name]` | Create a blank .anim file (name defaults to filename, `--sample-rate`, `--loop`) |
| `create animator <path> [name]` | Create a blank .controller file |
| `create prefab <file> <name>` | Create prefab from GameObject |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `create gameobject <file> --name Foo` | Works (alias for positional). Canonical: `create gameobject <file> Foo` |
