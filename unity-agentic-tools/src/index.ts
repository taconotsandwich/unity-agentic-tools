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

// Project search
export { search_project, grep_project, walk_project_files } from './project-search';

// Utils
export { atomicWrite, generateGuid, find_unity_project_root } from './utils';

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

// Types — Project search
export type {
    ProjectSearchOptions,
    ProjectSearchResult,
    ProjectSearchMatch,
    ProjectGrepOptions,
    ProjectGrepResult,
    GrepMatch,
} from './types';

// Types — C# type registry
export type {
    CSharpTypeRef,
    CSharpFieldRef,
    CSharpTypeInfo,
} from './types';

// Types — Setup & cleanup
export type { SetupOptions, SetupResult, GuidCache } from './setup';
export type { CleanupOptions, CleanupResult } from './cleanup';
