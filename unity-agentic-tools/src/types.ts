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
  /**
   * Called when the stream dies after it was established: reconnects exhausted,
   * or the subscribe request itself was rejected. Without this, both failures are
   * invisible to the caller and the stream just goes quiet.
   */
  on_error?: (error: Error) => void;
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

/** What the editor is busy with, as reported by editor.bridge.getInfo. */
export interface EditorReadiness {
  is_playing: boolean;
  is_paused: boolean;
  is_compiling: boolean;
  is_updating: boolean;
  is_playmode_transitioning: boolean;
  is_reloading: boolean;
  is_stable: boolean;
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

export interface AnnotatedScreenshotResult {
  success: boolean;
  path: string;
  annotated: boolean;
  width?: number;
  height?: number;
  elements: UIElementRef[];
}
