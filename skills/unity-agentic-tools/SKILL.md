---
name: unity-agentic-tools
description: "Parse, inspect, create, edit, and search Unity YAML files (.unity, .prefab, .asset, .mat, .anim, .controller). Use when working with Unity projects, GameObjects, components, materials, animations, prefabs, build settings, or project configuration. Provides fast CLI operations instead of manual YAML editing. Not for C# scripts or shaders."
---

# Unity YAML CLI

CLI: `unity-agentic-tools <command>`

76 commands across 4 CRUD groups + top-level utilities. Always inspect before editing, verify after.

## read -- Read Unity files, settings, and build data

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

## create -- Create Unity objects

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

## update -- Modify properties, transforms, settings

| Command | Usage |
|---------|-------|
| `update gameobject <file> <name> <prop> <value>` | Edit property by object name |
| `update component <file> <file_id> <prop> <value>` | Edit any component by file ID (supports dotted paths, array paths) |
| `update transform <file> <id> -p x,y,z -r x,y,z -s x,y,z` | Edit position/rotation/scale |
| `update scriptable-object <file> <prop> <value>` | Edit first MonoBehaviour in .asset file |
| `update settings <project> -s <name> --property <p> --value <v>` | Edit setting property |
| `update tag <project> add\|remove <tag>` | Add/remove tag |
| `update layer <project> <index> <name>` | Set named layer (3-31) |
| `update sorting-layer <project> add\|remove <name>` | Add/remove sorting layer |
| `update parent <file> <name> <new_parent>` | Move under new parent ("root" for scene root) |
| `update build <project> <scene>` | Enable (`--enable`), disable (`--disable`), or move (`--move <idx>`) scene |
| `update array <file> <file_id> <array_prop> <action> [args]` | Insert, append, or remove array elements in a component |
| `update batch <file> <edits_json>` | Batch edit multiple GameObject properties. JSON: `[{"object_name":"...","property":"...","value":"..."}]` |
| `update batch-components <file> <edits_json>` | Batch edit multiple component properties by fileID |
| `update material <file>` | Edit Material properties (`--set`, `--set-color`, `--set-texture`, `--shader`, `--keyword-add`, `--keyword-remove`) |
| `update meta <file>` | Edit .meta file importer settings |
| `update animation <file>` | Edit AnimationClip settings and events |
| `update animator <file>` | Edit AnimatorController parameters |
| `update sibling-index <file> <name> <index>` | Set sibling index of a GameObject, renumbering siblings |
| `update input-actions <file>` | Edit Input Actions (add/remove maps, actions, bindings, control schemes) |
| `update animation-curves <file>` | Add, remove, or modify animation curves (`--add-curve`, `--remove-curve`, `--set-keyframes`) |
| `update animator-state <file>` | Add/remove states and transitions (`--add-state`, `--remove-state`, `--add-transition`, `--remove-transition`) |
| `update prefab unpack <file> <instance>` | Unpack PrefabInstance to standalone objects |
| `update prefab override <file> <instance> <path> <value>` | Edit/add property override |
| `update prefab remove-override <file> <instance> <path>` | Remove property override |
| `update prefab remove-component <file> <instance> <ref>` | Remove a component from prefab |
| `update prefab restore-component <file> <instance> <ref>` | Restore a removed component |
| `update prefab remove-gameobject <file> <instance> <ref>` | Remove a GameObject from prefab |
| `update prefab restore-gameobject <file> <instance> <ref>` | Restore a removed GameObject |

## delete -- Remove objects and components

| Command | Usage |
|---------|-------|
| `delete gameobject <file> <name>` | Delete GameObject and hierarchy |
| `delete component <file> <file_id>` | Remove component by file ID |
| `delete build <project> <scene>` | Remove scene from build settings |
| `delete prefab <file> <instance>` | Delete PrefabInstance and stripped/added blocks |
| `delete package <project> <name>` | Remove a package from Packages/manifest.json |

## Top-level utilities

| Command | Usage |
|---------|-------|
| `search <file> <pattern>` | Find GameObjects by name in a file (`--exact` for exact match) |
| `search <project> -n <pattern>` | Search across scenes/prefabs (`-c`, `-t`, `-l` filters, `-T <type>` file type, `-m <n>` max matches) |
| `grep <project> <regex>` | Regex search across project files (`--type cs\|yaml\|unity\|prefab\|asset\|mat\|anim\|controller\|all`, `-m <n>` overrides default 100-result cap) |
| `clone <file> <name>` | Duplicate a GameObject and its hierarchy (`-n <new_name>`) |
| `version <project>` | Read Unity project version |
| `docs <query>` | Search Unity docs (auto-indexes on first use) |
| `setup` | Initialize tools for Unity project (`-p <path>`, `--index-docs`) |
| `cleanup` | Remove .unity-agentic files (`--all` for full removal) |
| `status` | Show config, GUID cache count, native module status |

## Setting aliases

`read settings` and `update settings` accept: tags/tagmanager, physics/dynamics, quality, time, input, audio, editor, graphics, physics2d, player/project, navmesh, build/editorbuild.

## Key patterns

- Always `read` before `update` -- inspect first, verify after
- Use `--properties` flag when you need component values; omit for structure-only (saves tokens)
- `setup` creates `.unity-agentic/` with GUID cache mapping scripts to file paths
- Use `read gameobject -c <type>` to filter to specific component types
- Batch commands (`update batch`, `update batch-components`) for multiple edits in one operation
- Doc index stored at `.unity-agentic/doc-index.json`, re-indexes only when files change
