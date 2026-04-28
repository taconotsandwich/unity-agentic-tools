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
  properties?: Record<string, unknown>;
}

export interface GameObjectDetail {
  name: string;
  file_id: string;
  active: boolean;
  tag: string;
  layer: number;
  depth?: number;
  components: Component[];
  children?: string[];
  parent_transform_id?: string | null;
  is_error?: boolean;
  error?: string;
  isPrefabInstance?: boolean;
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
  filter_component?: string;
}

export interface PaginatedInspection {
  file: string;
  total: number;
  totalInScene: number;
  cursor: number;
  next_cursor?: number;
  truncated: boolean;
  page_size: number;
  gameobjects: GameObjectDetail[];
  prefabInstances?: PrefabInstanceInfo[];
  error?: string;
  warning?: string;
}

// Native Rust module types
export interface NativeScanner {
  new(): NativeScannerInstance;
}

export interface NativeScannerInstance {
  setProjectRoot(path: string): void;
  scanSceneMinimal(file: string): GameObject[];
  scanSceneWithComponents(file: string, options?: ScanOptions): GameObjectWithComponents[];
  scanSceneMetadata(file: string): GameObjectWithComponents[];
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
    filterComponent?: string;
  }): PaginatedInspection;
  readAsset(file: string, decodeMesh?: boolean): AssetObject[];
}

// Asset object types (for .asset files / ScriptableObjects)
export interface AssetObject {
  class_id: number;
  file_id: string;
  type_name: string;
  name: string;
  properties: Record<string, unknown>;
  script_guid?: string;
  script_path?: string;
}

// ========== Project Search Types ==========

export interface ProjectSearchOptions {
  project_path: string;
  name?: string;
  exact?: boolean;
  component?: string;
  tag?: string;
  layer?: number;
  file_type?: 'scene' | 'prefab' | 'mat' | 'anim' | 'controller' | 'asset' | 'all';
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
  files_with_errors?: number;
  cursor?: number;
  truncated: boolean;
  matches: ProjectSearchMatch[];
  error?: string;
}

// ========== Project Grep Types ==========

export type ProjectGrepFileType = 'cs' | 'yaml' | 'unity' | 'prefab' | 'asset' | 'mat' | 'anim' | 'controller' | 'all';

export interface ProjectGrepOptions {
  project_path: string;
  pattern: string;
  file_type?: ProjectGrepFileType;
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

// ========== C# Type Registry Types ==========

export interface CSharpTypeRef {
  /** Type name (e.g., "PlayerController") */
  name: string;
  /** Kind: "class", "struct", "enum", or "interface" */
  kind: string;
  /** Namespace (e.g., "UnityEngine.UI") */
  namespace: string | null;
  /** Source file or DLL path relative to project root */
  filePath: string;
  /** GUID from adjacent .meta file (null for DLL types) */
  guid: string | null;
}

/** A serializable field extracted from a C# type. */
export interface CSharpFieldRef {
  /** Field name (e.g., "health", "moveSpeed") */
  name: string;
  /** C# type name (e.g., "int", "Vector3", "List<string>", "GameObject") */
  typeName: string;
  /** Whether [SerializeField] attribute is present */
  hasSerializeField: boolean;
  /** Whether [SerializeReference] attribute is present */
  hasSerializeReference: boolean;
  /** Whether the field is public */
  isPublic: boolean;
  /** Which type this field belongs to */
  ownerType: string;
}

/** Extended type info with fields and base class, extracted on demand. */
export interface CSharpTypeInfo {
  /** Type name (e.g., "PlayerController") */
  name: string;
  /** Kind: "class", "struct", "enum", or "interface" */
  kind: string;
  /** Namespace (e.g., "UnityEngine.UI") */
  namespace: string | null;
  /** Base class (e.g., "MonoBehaviour", "ScriptableObject") */
  baseClass: string | null;
  /** Serializable fields */
  fields: CSharpFieldRef[];
}

// ========== Editor Bridge Types ==========

export interface EditorConfig {
  port: number;
  pid: number;
  version: string;
  project_path?: string;
  source?: 'lockfile' | 'discovered' | 'cached' | 'manual';
}

export interface EditorBridgeInfo {
  port: number;
  pid: number;
  version: string;
  project_path: string;
  project_name?: string;
  unity_version?: string;
}

export interface CallEditorOptions {
  project_path: string;
  method: string;
  params?: Record<string, unknown>;
  timeout?: number;
  port?: number;
  /** Number of retry attempts for transient connection errors (default: 2) */
  retries?: number;
  /** Fire-and-forget: send request and return immediately without waiting for response */
  no_wait?: boolean;
}

export interface StreamEditorOptions extends CallEditorOptions {
  on_event: (event: RpcEvent) => void;
}

export interface RpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface RpcEvent {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface EditorStatusResult {
  port: number;
  pid: number;
  version: string;
  connected: boolean;
}

export interface PlayModeResult {
  state: string;
  isPlaying?: boolean;
  isPaused?: boolean;
}

export interface ConsoleLogEntry {
  message: string;
  stackTrace: string;
  type: string;
  timestamp: string;
}

export interface ScreenshotResult {
  success: boolean;
  path: string;
  superSize?: number;
}

export interface TestRunResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

export interface TestResult {
  name: string;
  fullName: string;
  status: string;
  duration: number;
  message: string;
}

// ========== Agent-Browser-Aligned Types ==========

export interface UIElementRef {
  ref: string;
  type: string;
  name: string;
  label?: string;
  interactable: boolean;
  source: 'uGUI' | 'UIToolkit';
  parentRef?: string;
  rect?: { x: number; y: number; w: number; h: number };
}

export interface UISnapshotResult {
  refCount: number;
  elements: UIElementRef[];
}

export interface HierarchyNodeRef {
  ref: string;
  name: string;
  active: boolean;
  tag?: string;
  layer?: string;
  components?: string[];
  children?: HierarchyNodeRef[];
  childCount?: number;
}

export interface HierarchySnapshotResult {
  scene: string;
  scenePath: string;
  refCount: number;
  tree: HierarchyNodeRef[];
}

export interface InputAction {
  map: string;
  name: string;
  type: string;
  controlType: string;
  bindings: string[];
}

export interface LegacyAxis {
  name: string;
  positiveButton?: string;
  negativeButton?: string;
  altPositiveButton?: string;
  altNegativeButton?: string;
  type: string;
  axis?: number;
}

export interface InputMapResult {
  inputSystemAvailable: boolean;
  actions: InputAction[];
  legacyAxes: LegacyAxis[];
}

export interface WaitResult {
  success: boolean;
  condition: string;
  elapsed?: number;
  error?: string;
}

export interface AnnotatedScreenshotResult {
  success: boolean;
  path: string;
  annotated: boolean;
  width?: number;
  height?: number;
  elements: UIElementRef[];
}
