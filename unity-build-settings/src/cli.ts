#!/usr/bin/env node

import * as path from 'path';
import { get_project_info } from './version';
import { get_build_settings, SceneEntry } from './build-settings';
import {
    add_scene,
    remove_scene,
    enable_scene,
    disable_scene,
    move_scene,
    reorder_scenes,
    EditResult,
} from './editor';

const args = process.argv.slice(2);
const command = args[0];

function print_help(): void {
    console.log(`Unity Build Settings CLI

Usage: unity-build-settings <command> [options]

Read Commands:
  version <project-path>     Show Unity version info
  scenes <project-path>      List scenes in build settings
  profiles <project-path>    List build profiles (Unity 6+)
  info <project-path>        Show complete build settings info

Edit Commands:
  add-scene <project> <scene-path>           Add scene to build settings
  remove-scene <project> <scene-path>        Remove scene from build settings
  enable-scene <project> <scene-path>        Enable scene in build
  disable-scene <project> <scene-path>       Disable scene in build
  move-scene <project> <scene-path> <pos>    Move scene to position
  reorder-scenes <project> <scene1,scene2>   Reorder all scenes (comma-separated)

Options:
  --json                     Output as JSON
  --enabled-only             Only show enabled scenes
  --disabled                 Add scene as disabled (for add-scene)
  --position <n>             Insert at position (for add-scene)

Examples:
  unity-build-settings version /path/to/project
  unity-build-settings scenes /path/to/project --enabled-only
  unity-build-settings add-scene /path/to/project Assets/Scenes/NewLevel.unity
  unity-build-settings move-scene /path/to/project Assets/Scenes/Menu.unity 0
  unity-build-settings enable-scene /path/to/project Assets/Scenes/Debug.unity
`);
}

function format_scene(scene: SceneEntry): string {
    const status = scene.enabled ? '[x]' : '[ ]';
    const buildIdx = scene.enabled ? `#${scene.buildIndex}` : '---';
    return `  ${buildIdx.padStart(4)} ${status} ${scene.path}`;
}

function print_edit_result(result: EditResult, jsonOutput: boolean): void {
    if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        if (result.success) {
            console.log(`Success: ${result.message}`);
            if (result.scenes) {
                console.log('\nUpdated scene list:');
                result.scenes.forEach((scene) => {
                    console.log(format_scene(scene));
                });
            }
        } else {
            console.error(`Error: ${result.message}`);
            process.exit(1);
        }
    }
}

async function main(): Promise<void> {
    if (!command || command === '--help' || command === '-h') {
        print_help();
        process.exit(0);
    }

    const projectPath = args[1];
    const flags = args.slice(2);
    const jsonOutput = flags.includes('--json');
    const enabledOnly = flags.includes('--enabled-only');

    if (!projectPath) {
        console.error('Error: Project path required');
        process.exit(1);
    }

    const resolvedPath = path.resolve(projectPath);

    try {
        switch (command) {
            case 'version': {
                const info = get_project_info(resolvedPath);
                if (jsonOutput) {
                    console.log(JSON.stringify(info, null, 2));
                } else {
                    console.log(`Unity Version: ${info.version.raw}`);
                    console.log(`Unity 6+: ${info.isUnity6OrLater ? 'Yes' : 'No'}`);
                    console.log(`Build Profiles: ${info.hasBuildProfiles ? 'Yes' : 'No'}`);
                    if (info.version.fullRevision) {
                        console.log(`Full Revision: ${info.version.fullRevision}`);
                    }
                }
                break;
            }

            case 'scenes': {
                const settings = get_build_settings(resolvedPath);
                let scenes = settings.editorBuildSettings.scenes;

                if (enabledOnly) {
                    scenes = scenes.filter(s => s.enabled);
                }

                if (jsonOutput) {
                    console.log(JSON.stringify(scenes, null, 2));
                } else {
                    console.log(`Build Scenes (${scenes.length} total):\n`);
                    scenes.forEach((scene) => {
                        console.log(format_scene(scene));
                    });
                }
                break;
            }

            case 'profiles': {
                const settings = get_build_settings(resolvedPath);

                if (!settings.projectInfo.isUnity6OrLater) {
                    console.log('Build Profiles are only available in Unity 6+');
                    console.log(`This project uses Unity ${settings.projectInfo.version.raw}`);
                    process.exit(0);
                }

                if (jsonOutput) {
                    console.log(JSON.stringify(settings.buildProfiles, null, 2));
                } else {
                    if (settings.buildProfiles.length === 0) {
                        console.log('No build profiles found.');
                        console.log('Build profiles are stored in: Assets/Settings/Build Profiles/');
                    } else {
                        console.log(`Build Profiles (${settings.buildProfiles.length}):\n`);
                        for (const profile of settings.buildProfiles) {
                            console.log(`  - ${profile.name}`);
                            if (profile.platform) {
                                console.log(`    Platform: ${profile.platform}`);
                            }
                            if (profile.scriptingDefines?.length) {
                                console.log(`    Defines: ${profile.scriptingDefines.join(', ')}`);
                            }
                            if (profile.scenes?.length) {
                                console.log(`    Scenes: ${profile.scenes.length} (overridden)`);
                            }
                        }
                    }
                }
                break;
            }

            case 'info': {
                const settings = get_build_settings(resolvedPath);

                if (jsonOutput) {
                    console.log(JSON.stringify(settings, null, 2));
                } else {
                    const { projectInfo, editorBuildSettings, buildProfiles } = settings;

                    console.log('=== Unity Project Info ===\n');
                    console.log(`Version: ${projectInfo.version.raw}`);
                    console.log(`Unity 6+: ${projectInfo.isUnity6OrLater ? 'Yes' : 'No'}`);

                    console.log('\n=== Build Scenes ===\n');
                    const enabledScenes = editorBuildSettings.scenes.filter(s => s.enabled);
                    console.log(`Total: ${editorBuildSettings.scenes.length} (${enabledScenes.length} enabled)\n`);
                    editorBuildSettings.scenes.forEach((scene) => {
                        console.log(format_scene(scene));
                    });

                    if (projectInfo.isUnity6OrLater) {
                        console.log('\n=== Build Profiles ===\n');
                        if (buildProfiles.length === 0) {
                            console.log('  No build profiles configured');
                        } else {
                            for (const profile of buildProfiles) {
                                console.log(`  - ${profile.name} (${profile.platform || 'unknown platform'})`);
                            }
                        }
                    }
                }
                break;
            }

            // Edit commands
            case 'add-scene': {
                const scenePath = args[2];
                if (!scenePath) {
                    console.error('Error: Scene path required');
                    process.exit(1);
                }

                const disabled = flags.includes('--disabled');
                const posIndex = flags.indexOf('--position');
                const position = posIndex >= 0 ? parseInt(flags[posIndex + 1], 10) : undefined;

                const result = add_scene(resolvedPath, scenePath, {
                    enabled: !disabled,
                    position,
                });
                print_edit_result(result, jsonOutput);
                break;
            }

            case 'remove-scene': {
                const scenePath = args[2];
                if (!scenePath) {
                    console.error('Error: Scene path required');
                    process.exit(1);
                }

                const result = remove_scene(resolvedPath, scenePath);
                print_edit_result(result, jsonOutput);
                break;
            }

            case 'enable-scene': {
                const scenePath = args[2];
                if (!scenePath) {
                    console.error('Error: Scene path required');
                    process.exit(1);
                }

                const result = enable_scene(resolvedPath, scenePath);
                print_edit_result(result, jsonOutput);
                break;
            }

            case 'disable-scene': {
                const scenePath = args[2];
                if (!scenePath) {
                    console.error('Error: Scene path required');
                    process.exit(1);
                }

                const result = disable_scene(resolvedPath, scenePath);
                print_edit_result(result, jsonOutput);
                break;
            }

            case 'move-scene': {
                const scenePath = args[2];
                const newPosition = args[3];
                if (!scenePath || newPosition === undefined) {
                    console.error('Error: Scene path and position required');
                    process.exit(1);
                }

                const result = move_scene(resolvedPath, scenePath, parseInt(newPosition, 10));
                print_edit_result(result, jsonOutput);
                break;
            }

            case 'reorder-scenes': {
                const sceneList = args[2];
                if (!sceneList) {
                    console.error('Error: Comma-separated scene list required');
                    process.exit(1);
                }

                const scenePaths = sceneList.split(',').map(s => s.trim());
                const result = reorder_scenes(resolvedPath, scenePaths);
                print_edit_result(result, jsonOutput);
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                print_help();
                process.exit(1);
        }
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
}

main();
