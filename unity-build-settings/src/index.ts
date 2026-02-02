// Version detection
export {
    parse_version,
    is_unity6_or_later,
    read_project_version,
    has_build_profiles,
    get_project_info,
    UnityVersion,
    UnityProjectInfo,
} from './version';

// Build settings reading
export {
    parse_editor_build_settings,
    parse_build_profile,
    list_build_profiles,
    get_build_settings,
    SceneEntry,
    EditorBuildSettings,
    BuildProfile,
    BuildSettingsResult,
} from './build-settings';

// Build settings editing
export {
    add_scene,
    remove_scene,
    enable_scene,
    disable_scene,
    move_scene,
    reorder_scenes,
    EditResult,
} from './editor';
