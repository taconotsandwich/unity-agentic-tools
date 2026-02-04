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

export type BuiltInComponent =
  | 'BoxCollider'
  | 'SphereCollider'
  | 'CapsuleCollider'
  | 'MeshCollider'
  | 'Rigidbody'
  | 'AudioSource'
  | 'Light'
  | 'Camera';

export interface AddComponentOptions {
  file_path: string;
  game_object_name: string;
  component_type: BuiltInComponent | string;  // Built-in type or script name/path/GUID
  project_path?: string;  // Unity project root (for script GUID cache lookup)
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
