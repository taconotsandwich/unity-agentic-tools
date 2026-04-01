// Scanner
export {
    UnityScanner,
    isNativeModuleAvailable,
    getNativeModuleError,
    getNativeExtractCsharpTypes,
    getNativeExtractDllTypes,
    getNativeBuildTypeRegistry,
} from './scanner';

// Setup & cleanup
export { setup } from './setup';
export { cleanup } from './cleanup';

// Settings
export { read_settings, edit_settings, edit_tag, edit_layer, edit_sorting_layer } from './settings';

// Project search
export { search_project, grep_project, walk_project_files } from './project-search';

// Utils
export { atomicWrite, generateGuid, find_unity_project_root } from './utils';

// Editor — Create
export {
    createGameObject,
    createScene,
    createPrefabVariant,
    createScriptableObject,
    createMetaFile,
    addComponent,
    copyComponent,
} from './editor';

// Editor — Update
export {
    editProperty,
    editComponentByFileId,
    editPrefabOverride,
    editTransform,
    batchEditProperties,
    reparentGameObject,
    editArray,
    batchEditComponentProperties,
    removePrefabOverride,
    addRemovedComponent,
    removeRemovedComponent,
    addRemovedGameObject,
    removeRemovedGameObject,
} from './editor';

// Editor — Delete
export {
    deleteGameObject,
    removeComponent,
    removeComponentBatch,
    deletePrefabInstance,
} from './editor';

// Editor — Duplicate & unpack
export {
    duplicateGameObject,
    unpackPrefab,
} from './editor';

// Editor — Utilities
export { validateUnityYAML, resolve_script_with_fields } from './editor';
export { UnityBlock } from './editor';
export { UnityDocument } from './editor';
export { yaml_default_for_type, generate_field_yaml } from './editor';

// Types — Scanner & inspection
export type {
    FindResult,
    GameObject,
    GameObjectWithComponents,
    GameObjectDetail,
    Component,
    SceneInspection,
    InspectOptions,
    PaginationOptions,
    PaginatedInspection,
    AssetObject,
} from './types';

// Types — Settings
export type {
    ReadSettingsOptions,
    ReadSettingsResult,
    TagManagerData,
    PhysicsData,
    QualitySettingsData,
    TimeSettingsData,
    EditSettingsOptions,
    EditSettingsResult,
    TagEditOptions,
    LayerEditOptions,
    SortingLayerEditOptions,
} from './types';

// Types — Scene creation
export type {
    CreateSceneOptions,
    CreateSceneResult,
} from './types';

// Types — Project search
export type {
    ProjectSearchOptions,
    ProjectSearchResult,
    ProjectSearchMatch,
    ProjectGrepOptions,
    ProjectGrepResult,
    GrepMatch,
} from './types';

// Types — Editor results
export type {
    EditResult,
    PropertyEditOptions,
    EditComponentByFileIdOptions,
    EditComponentResult,
    EditPrefabOverrideOptions,
    EditPrefabOverrideResult,
    RemovePrefabOverrideOptions,
    RemovePrefabOverrideResult,
} from './types';

// Types — Create operations
export type {
    CreateGameObjectOptions,
    CreateGameObjectResult,
    AddComponentOptions,
    AddComponentResult,
    CreatePrefabVariantOptions,
    CreatePrefabVariantResult,
    CreateScriptableObjectOptions,
    CreateScriptableObjectResult,
    CreateMetaFileOptions,
    CreateMetaFileResult,
} from './types';

// Types — Transform & geometry
export type {
    EditTransformOptions,
    Vector3,
    Quaternion,
} from './types';

// Types — Delete operations
export type {
    RemoveComponentOptions,
    RemoveComponentResult,
    DeleteGameObjectOptions,
    DeleteGameObjectResult,
    DeletePrefabInstanceOptions,
    DeletePrefabInstanceResult,
} from './types';

// Types — Copy, duplicate, reparent
export type {
    CopyComponentOptions,
    CopyComponentResult,
    DuplicateGameObjectOptions,
    DuplicateGameObjectResult,
    UnpackPrefabOptions,
    UnpackPrefabResult,
    ReparentGameObjectOptions,
    ReparentGameObjectResult,
} from './types';

// Types — Batch & array edits
export type {
    PropertyEdit,
    ComponentPropertyEdit,
    ArrayEditOptions,
    ArrayEditResult,
} from './types';

// Types — Prefab sub-array management
export type {
    PrefabSubArrayOptions,
    PrefabSubArrayResult,
} from './types';

// Types — Reference graph & C# type registry
export type {
    ReferenceEdge,
    CSharpTypeRef,
    CSharpFieldRef,
    CSharpTypeInfo,
} from './types';

// Types — Setup & cleanup
export type { SetupOptions, SetupResult, GuidCache } from './setup';
export type { CleanupOptions, CleanupResult } from './cleanup';

// Types — Editor shared
export type { ResolvedScript } from './editor';
