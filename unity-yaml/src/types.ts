export interface GameObject {
  name: string;
  file_id: string;
  active: boolean;
  tag?: string;
  layer?: number;
  component_count?: number;
  components?: Component[];
  match_score?: number;
}

export interface GameObjectWithComponents {
  name: string;
  file_id: string;
  active: boolean;
  tag?: string;
  layer?: number;
  component_count?: number;
  components: Component[];
  match_score?: number;
}

export interface Component {
  type: string;
  class_id: number;
  file_id: string;
  script_path?: string;
  script_guid?: string;
  script_name?: string;
  properties?: Record<string, any>;
}

export interface GameObjectDetail {
  name: string;
  file_id: string;
  active: boolean;
  tag: string;
  layer: number;
  components: Component[];
  children?: string[];
  parent_transform_id?: string | null;
}

export interface PrefabInstanceInfo {
  name: string;
  fileId: string;
  sourceGuid: string;
  sourcePrefab?: string;
  modificationsCount: number;
}

export interface PrefabModification {
  targetFileId: string;
  targetGuid?: string;
  propertyPath: string;
  value: string;
}

export interface FindResult {
    name: string;
    fileId: string;
    resultType: string;  // "GameObject" | "PrefabInstance"
    active?: boolean;
    matchScore?: number;
    sourceGuid?: string;
    sourcePrefab?: string;
    modificationsCount?: number;
}

export interface SceneInspection {
  file: string;
  count: number;
  gameobjects: GameObjectDetail[];
  prefabInstances?: PrefabInstanceInfo[];
}

export interface InspectOptions {
  file: string;
  identifier?: string;
  include_properties?: boolean;
  verbose?: boolean;
}

export interface ScanOptions {
  verbose?: boolean;
}

// Pagination types
export interface PaginationOptions {
  file: string;
  include_properties?: boolean;
  verbose?: boolean;
  page_size?: number;
  cursor?: number;
  max_depth?: number;
}

export interface PaginatedInspection {
  file: string;
  total: number;
  cursor: number;
  next_cursor?: number;
  truncated: boolean;
  page_size: number;
  gameobjects: GameObjectDetail[];
  prefabInstances?: PrefabInstanceInfo[];
}

// Creation types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CreateGameObjectOptions {
  file_path: string;
  name: string;
  parent?: string | number;  // Parent name or Transform fileID
}

export interface EditTransformOptions {
  file_path: string;
  transform_id: number;
  position?: Vector3;
  rotation?: Vector3;  // Euler angles in degrees
  scale?: Vector3;
}

export interface AddComponentOptions {
  file_path: string;
  game_object_name: string;
  component_type: string;  // Any Unity component name (e.g., "MeshRenderer", "Animator") or script name/path/GUID
  project_path?: string;   // Unity project root (for script GUID cache lookup)
}

export interface AddComponentResult {
  success: boolean;
  file_path: string;
  component_id?: number;
  script_guid?: string;  // Set when adding a script
  script_path?: string;  // Set when adding a script
  error?: string;
}

export interface CreatePrefabVariantOptions {
  source_prefab: string;      // Path to source .prefab file
  output_path: string;        // Path for the new variant .prefab file
  variant_name?: string;      // Optional name override (defaults to source name + " Variant")
}

export interface CreatePrefabVariantResult {
  success: boolean;
  output_path: string;
  source_guid?: string;
  prefab_instance_id?: number;
  error?: string;
}

export interface CreateGameObjectResult {
  success: boolean;
  file_path: string;
  game_object_id?: number;
  transform_id?: number;
  error?: string;
}

// Quaternion for rotation representation
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

// Native Rust module types
export interface NativeScanner {
  new(): NativeScannerInstance;
}

export interface NativeScannerInstance {
  setProjectRoot(path: string): void;
  scanSceneMinimal(file: string): GameObject[];
  scanSceneWithComponents(file: string, options?: ScanOptions): GameObjectWithComponents[];
  findByName(file: string, pattern: string, fuzzy: boolean): FindResult[];
  inspect(options: {
    file: string;
    identifier?: string;
    includeProperties?: boolean;
    verbose?: boolean;
  }): GameObjectDetail | null;
  inspectAll(file: string, includeProperties: boolean, verbose: boolean): SceneInspection;
  inspectAllPaginated(options: {
    file: string;
    includeProperties?: boolean;
    verbose?: boolean;
    pageSize?: number;
    cursor?: number;
    maxDepth?: number;
  }): PaginatedInspection;
  readAsset(file: string): AssetObject[];
}

// Asset object types (for .asset files / ScriptableObjects)
export interface AssetObject {
  class_id: number;
  file_id: string;
  type_name: string;
  name: string;
  properties: Record<string, any>;
  script_guid?: string;
  script_path?: string;
}

// Remove Component types
export interface RemoveComponentOptions {
  file_path: string;
  file_id: string;
}

export interface RemoveComponentResult {
  success: boolean;
  file_path: string;
  removed_file_id?: string;
  removed_class_id?: number;
  error?: string;
}

// Delete GameObject types
export interface DeleteGameObjectOptions {
  file_path: string;
  object_name: string;
}

export interface DeleteGameObjectResult {
  success: boolean;
  file_path: string;
  deleted_count?: number;
  error?: string;
}

// Copy Component types
export interface CopyComponentOptions {
  file_path: string;
  source_file_id: string;
  target_game_object_name: string;
}

export interface CopyComponentResult {
  success: boolean;
  file_path: string;
  source_file_id?: string;
  new_component_id?: number;
  target_game_object?: string;
  error?: string;
}

// Duplicate GameObject types
export interface DuplicateGameObjectOptions {
  file_path: string;
  object_name: string;
  new_name?: string;
}

export interface DuplicateGameObjectResult {
  success: boolean;
  file_path: string;
  game_object_id?: number;
  transform_id?: number;
  total_duplicated?: number;
  error?: string;
}

// Create ScriptableObject types
export interface CreateScriptableObjectOptions {
  output_path: string;
  script: string;
  project_path?: string;
}

export interface CreateScriptableObjectResult {
  success: boolean;
  output_path: string;
  script_guid?: string;
  asset_guid?: string;
  error?: string;
}

// Unpack Prefab types
export interface UnpackPrefabOptions {
  file_path: string;
  prefab_instance: string;
  project_path?: string;
}

export interface UnpackPrefabResult {
  success: boolean;
  file_path: string;
  unpacked_count?: number;
  root_game_object_id?: number;
  error?: string;
}

// Reparent GameObject types
export interface ReparentGameObjectOptions {
  file_path: string;
  object_name: string;
  new_parent: string;  // Parent name or "root" for scene root
}

export interface ReparentGameObjectResult {
  success: boolean;
  file_path: string;
  child_transform_id?: number;
  old_parent_transform_id?: number;
  new_parent_transform_id?: number;
  error?: string;
}

// Create .meta file types
export interface CreateMetaFileOptions {
  script_path: string;
}

export interface CreateMetaFileResult {
  success: boolean;
  meta_path: string;
  guid?: string;
  error?: string;
}

// Batch edit types
export interface PropertyEdit {
  object_name: string;
  property: string;
  new_value: string;
}

// Generic component edit options
export interface EditComponentByFileIdOptions {
  file_path: string;
  file_id: string;  // The file ID of the component to edit (from --- !u!<class_id> &<file_id>)
  property: string;  // Property name (with or without m_ prefix)
  new_value: string;
}

export interface EditComponentResult {
  success: boolean;
  file_path: string;
  file_id?: string;
  class_id?: number;
  bytes_written?: number;
  error?: string;
}

// ========== Settings Types ==========

export interface ReadSettingsOptions {
  project_path: string;
  setting: string;
}

export interface ReadSettingsResult {
  success: boolean;
  project_path: string;
  setting: string;
  file_path?: string;
  data?: TagManagerData | PhysicsData | QualitySettingsData | TimeSettingsData | Record<string, any>;
  error?: string;
}

export interface TagManagerData {
  tags: string[];
  layers: { index: number; name: string }[];
  sorting_layers: { name: string; unique_id: number; locked: number }[];
}

export interface PhysicsData {
  gravity: { x: number; y: number; z: number };
  default_contact_offset: number;
  default_solver_iterations: number;
  default_solver_velocity_iterations: number;
  bounce_threshold: number;
  sleep_threshold: number;
  queries_hit_triggers: boolean;
  auto_simulation: boolean;
  [key: string]: any;
}

export interface QualitySettingsData {
  current_quality: number;
  quality_levels: QualityLevel[];
}

export interface QualityLevel {
  name: string;
  pixel_light_count: number;
  shadows: number;
  shadow_resolution: number;
  shadow_distance: number;
  anti_aliasing: number;
  vsync_count: number;
  lod_bias: number;
  [key: string]: any;
}

export interface TimeSettingsData {
  fixed_timestep: number;
  max_timestep: number;
  time_scale: number;
  max_particle_timestep: number;
}

export interface EditSettingsOptions {
  project_path: string;
  setting: string;
  property: string;
  value: string;
}

export interface EditSettingsResult {
  success: boolean;
  project_path: string;
  setting: string;
  file_path?: string;
  bytes_written?: number;
  error?: string;
}

export interface TagEditOptions {
  project_path: string;
  action: 'add' | 'remove';
  tag: string;
}

export interface LayerEditOptions {
  project_path: string;
  index: number;
  name: string;
}

export interface SortingLayerEditOptions {
  project_path: string;
  action: 'add' | 'remove';
  name: string;
}

// ========== Scene Creator Types ==========

export interface CreateSceneOptions {
  output_path: string;
  include_defaults?: boolean;
  scene_guid?: string;
}

export interface CreateSceneResult {
  success: boolean;
  output_path: string;
  scene_guid?: string;
  meta_path?: string;
  error?: string;
}

// ========== Project Search Types ==========

export interface ProjectSearchOptions {
  project_path: string;
  name?: string;
  component?: string;
  tag?: string;
  layer?: number;
  file_type?: 'scene' | 'prefab' | 'all';
  page_size?: number;
  cursor?: number;
  max_matches?: number;
}

export interface ProjectSearchMatch {
  file: string;
  game_object: string;
  file_id: string;
  tag?: string;
  layer?: number;
  components?: string[];
}

export interface ProjectSearchResult {
  success: boolean;
  project_path: string;
  total_files_scanned: number;
  total_matches: number;
  cursor: number;
  next_cursor?: number;
  truncated: boolean;
  matches: ProjectSearchMatch[];
  error?: string;
}

// ========== Project Grep Types ==========

export interface ProjectGrepOptions {
  project_path: string;
  pattern: string;
  file_type?: 'cs' | 'yaml' | 'unity' | 'prefab' | 'asset' | 'all';
  max_results?: number;
  context_lines?: number;
}

export interface GrepMatch {
  file: string;
  line_number: number;
  line: string;
  context_before?: string[];
  context_after?: string[];
}

export interface ProjectGrepResult {
  success: boolean;
  project_path: string;
  pattern: string;
  total_files_scanned: number;
  total_matches: number;
  truncated: boolean;
  matches: GrepMatch[];
  error?: string;
}
