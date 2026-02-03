export interface GameObject {
  name: string;
  file_id: string;
  active: boolean;
  tag?: string;
  layer?: number;
  component_count?: number;
  components?: any[];
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

export interface SceneInspection {
  file: string;
  count: number;
  gameobjects: GameObjectDetail[];
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

export interface CreateGameObjectResult {
  success: boolean;
  file_path: string;
  game_object_id?: number;
  transform_id?: number;
  error?: string;
}
