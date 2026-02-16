import { writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import type {
    CreateGameObjectOptions, CreateGameObjectResult,
    AddComponentOptions, AddComponentResult,
    CreatePrefabVariantOptions, CreatePrefabVariantResult,
    CreateScriptableObjectOptions, CreateScriptableObjectResult,
    CreateMetaFileOptions, CreateMetaFileResult,
    CreateSceneOptions, CreateSceneResult,
    CopyComponentOptions, CopyComponentResult,
    CSharpFieldRef,
} from '../types';
import { get_class_id, UNITY_CLASS_IDS } from '../class-ids';
import { generateGuid, validate_name, validate_file_path, find_unity_project_root } from '../utils';
import { extractGuidFromMeta, resolve_script_with_fields } from './shared';
import { generate_field_yaml } from './yaml-fields';
import { UnityDocument } from './unity-document';
import type { UnityVersion } from '../build-version';
import { read_project_version } from '../build-version';

// ========== Private Helpers ==========

/**
 * Look up the m_Layer value from a parent Transform's associated GameObject.
 * Returns 0 for root-level or if lookup fails.
 */
function get_layer_from_parent(doc: UnityDocument, parentTransformId: string): number {
    if (parentTransformId === '0') return 0;

    const parentTransform = doc.find_by_file_id(parentTransformId);
    if (!parentTransform) return 0;

    const goMatch = parentTransform.raw.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
    if (!goMatch) return 0;

    const parentGo = doc.find_by_file_id(goMatch[1]);
    if (!parentGo) return 0;

    const layerMatch = parentGo.raw.match(/m_Layer:\s*(\d+)/);
    return layerMatch ? parseInt(layerMatch[1], 10) : 0;
}

/**
 * Create YAML blocks for a new GameObject with Transform.
 */
function createGameObjectYAML(
  gameObjectId: number,
  transformId: number,
  name: string,
  parentTransformId: number = 0,
  rootOrder: number = 0,
  layer: number = 0
): string {
  return `--- !u!1 &${gameObjectId}
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: ${transformId}}
  m_Layer: ${layer}
  m_Name: ${name}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &${transformId}
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: ${parentTransformId}}
  m_RootOrder: ${rootOrder}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
`;
}

/**
 * Find a GameObject's Transform fileID by name.
 * Returns an error string if multiple matches are found (ambiguous).
 */
function findTransformIdByName(doc: UnityDocument, objectName: string): string | null | { error: string } {
  const transformIds = doc.find_transforms_by_name(objectName);

  if (transformIds.length === 0) {
    // Fallback: search PrefabInstance blocks for m_Name modification
    for (const block of doc.blocks) {
      if (block.class_id !== 1001) continue;
      const nameInMods = block.raw.match(/propertyPath:\s*m_Name\s*\n\s*value:\s*(.+)/);
      if (nameInMods && nameInMods[1].trim() === objectName) {
        const stripped = findStrippedRootTransform(doc, block.file_id);
        if (stripped) return stripped.transformId;
      }
    }
    return null;
  }
  if (transformIds.length > 1) {
    const gameObjects = doc.find_game_objects_by_name(objectName);
    const ids = gameObjects.map(go => go.file_id).join(', ');
    return { error: `Multiple GameObjects named "${objectName}" found (fileIDs: ${ids}). Use numeric fileID to specify which one.` };
  }
  return transformIds[0];
}

/**
 * Find the stripped root Transform for a PrefabInstance.
 * Returns the stripped Transform's fileID and its m_CorrespondingSourceObject reference.
 */
function findStrippedRootTransform(doc: UnityDocument, prefabInstanceId: string): { transformId: string; sourceRef: string } | null {
  for (const block of doc.blocks) {
    if (block.class_id !== 4 || !block.is_stripped) continue;
    const piMatch = block.raw.match(/m_PrefabInstance:\s*\{fileID:\s*(\d+)\}/);
    if (piMatch && piMatch[1] === prefabInstanceId) {
      const sourceMatch = block.raw.match(/m_CorrespondingSourceObject:\s*(\{[^}]+\})/);
      if (sourceMatch) {
        return {
          transformId: block.file_id,
          sourceRef: sourceMatch[1]
        };
      }
    }
  }
  return null;
}

/**
 * Append a new entry to a PrefabInstance's m_AddedGameObjects array.
 */
function appendToAddedGameObjects(doc: UnityDocument, piId: string, targetSourceRef: string, newGoId: string): void {
  const piBlock = doc.find_by_file_id(piId);
  if (!piBlock) return;

  const entry = `\n    - targetCorrespondingSourceObject: ${targetSourceRef}\n      insertIndex: -1\n      addedObject: {fileID: ${newGoId}}`;

  let raw = piBlock.raw;

  // Try replacing empty array: m_AddedGameObjects: []
  const emptyPattern = /m_AddedGameObjects:\s*\[\]/;
  if (emptyPattern.test(raw)) {
    raw = raw.replace(emptyPattern, `m_AddedGameObjects:${entry}`);
    piBlock.replace_raw(raw);
    return;
  }

  // Try appending to existing entries
  const existingPattern = /(m_AddedGameObjects:\s*\n(?:\s+-[\s\S]*?(?=\n\s+m_|$))*)/;
  if (existingPattern.test(raw)) {
    raw = raw.replace(existingPattern, `$1${entry}`);
    piBlock.replace_raw(raw);
  }
}

/** Default property values for common built-in components. */
const COMPONENT_DEFAULTS: Record<number, string> = {
  20: `  serializedVersion: 2\n  m_ClearFlags: 1\n  m_BackGroundColor: {r: 0.19215687, g: 0.3019608, b: 0.4745098, a: 0}\n  m_projectionMatrixMode: 1\n  m_FOVAxisMode: 0\n  near clip plane: 0.3\n  far clip plane: 1000\n  field of view: 60\n  orthographic: 0\n  orthographic size: 5\n  m_Depth: -1`, // Camera
  23: `  m_CastShadows: 1\n  m_ReceiveShadows: 1\n  m_Materials:\n  - {fileID: 0}`, // MeshRenderer
  33: `  m_Mesh: {fileID: 0}`, // MeshFilter
  54: `  m_Mass: 1\n  m_Drag: 0\n  m_AngularDrag: 0.05\n  m_UseGravity: 1\n  m_IsKinematic: 0`, // Rigidbody
  64: `  m_IsTrigger: 0\n  m_Convex: 0\n  m_CookingOptions: 30\n  m_Mesh: {fileID: 0}`, // MeshCollider
  65: `  m_IsTrigger: 0\n  m_Material: {fileID: 0}\n  m_Center: {x: 0, y: 0, z: 0}\n  m_Size: {x: 1, y: 1, z: 1}`, // BoxCollider
  82: `  m_PlayOnAwake: 1\n  m_Volume: 1\n  m_Pitch: 1\n  m_Loop: 0\n  m_Mute: 0\n  m_Priority: 128`, // AudioSource
  96: `  m_CastShadows: 1\n  m_ReceiveShadows: 1\n  m_Materials:\n  - {fileID: 0}\n  m_Time: 5\n  m_MinVertexDistance: 0.1`, // TrailRenderer
  108: `  m_LightType: 1\n  m_Color: {r: 1, g: 0.95686275, b: 0.8392157, a: 1}\n  m_Intensity: 1\n  m_Range: 10\n  m_SpotAngle: 30\n  m_Shadows: 2`, // Light
  111: `  m_Controller: {fileID: 0}`, // Animator
  121: `  m_CastShadows: 1\n  m_ReceiveShadows: 1\n  m_Materials:\n  - {fileID: 0}`, // LineRenderer
  135: `  m_IsTrigger: 0\n  m_Material: {fileID: 0}\n  m_Center: {x: 0, y: 0, z: 0}\n  m_Radius: 0.5`, // SphereCollider
  136: `  m_IsTrigger: 0\n  m_Material: {fileID: 0}\n  m_Center: {x: 0, y: 0, z: 0}\n  m_Radius: 0.5\n  m_Height: 2\n  m_Direction: 1`, // CapsuleCollider
  137: `  m_CastShadows: 1\n  m_ReceiveShadows: 1\n  m_Quality: 0\n  m_Materials:\n  - {fileID: 0}`, // SkinnedMeshRenderer
  143: `  m_Height: 2\n  m_Radius: 0.5\n  m_SlopeLimit: 45\n  m_StepOffset: 0.3\n  m_SkinWidth: 0.08\n  m_Center: {x: 0, y: 0, z: 0}`, // CharacterController
  198: `  m_PlayOnAwake: 1`, // ParticleSystem
  205: `  serializedVersion: 2\n  m_FadeMode: 0\n  m_AnimateCrossFading: 0`, // LODGroup
  212: `  m_CastShadows: 0\n  m_ReceiveShadows: 0\n  m_Materials:\n  - {fileID: 0}\n  m_Color: {r: 1, g: 1, b: 1, a: 1}`, // SpriteRenderer
  222: ``, // CanvasRenderer
  223: `  m_RenderMode: 0\n  m_PixelPerfect: 0\n  m_SortingOrder: 0`, // Canvas
  225: `  m_Alpha: 1\n  m_Interactable: 1\n  m_BlocksRaycasts: 1\n  m_IgnoreParentGroups: 0`, // CanvasGroup
};

function createGenericComponentYAML(
  componentName: string,
  classId: number,
  componentId: number,
  gameObjectId: number
): string {
  const defaults = COMPONENT_DEFAULTS[classId] ? '\n' + COMPONENT_DEFAULTS[classId] + '\n' : '';
  return `--- !u!${classId} &${componentId}
${componentName}:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
${defaults}`;
}

/**
 * Add a component reference to a GameObject's m_Component array.
 */
function addComponentToGameObject(doc: UnityDocument, gameObjectId: string, componentId: string): void {
  const goBlock = doc.find_by_file_id(gameObjectId);
  if (!goBlock) return;

  let raw = goBlock.raw;
  raw = raw.replace(
    /(m_Component:\s*\n(?:\s*-\s*component:\s*\{fileID:\s*\d+\}\s*\n)*)/,
    `$1  - component: {fileID: ${componentId}}\n`
  );
  goBlock.replace_raw(raw);
}

/**
 * Create MonoBehaviour YAML for a custom script.
 * When fields are provided, appends serialized field defaults after m_EditorClassIdentifier.
 * Version-gated types (Hash128, RenderingLayerMask) are skipped if the project is too old.
 */
function createMonoBehaviourYAML(
  componentId: number,
  gameObjectId: number,
  scriptGuid: string,
  fields?: CSharpFieldRef[],
  version?: UnityVersion
): string {
  const field_yaml = fields && fields.length > 0 ? generate_field_yaml(fields, version) : '\n';
  return `--- !u!114 &${componentId}
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
  m_Name:
  m_EditorClassIdentifier:${field_yaml}`;
}

// ========== Exported Functions ==========

/**
 * Create a new GameObject in a Unity YAML file.
 */
export function createGameObject(options: CreateGameObjectOptions): CreateGameObjectResult {
  const { file_path, name, parent } = options;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  // Validate inputs
  if (!name || name.trim() === '') {
    return {
      success: false,
      file_path,
      error: 'GameObject name cannot be empty'
    };
  }

  const nameError = validate_name(name, 'GameObject name');
  if (nameError) {
    return { success: false, file_path, error: nameError };
  }

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  // Load document
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Resolve parent Transform ID if specified
  let parentTransformIdStr = '0';
  if (parent !== undefined) {
    if (typeof parent === 'number') {
      // Direct Transform fileID
      const parentIdStr = String(parent);
      const parentBlock = doc.find_by_file_id(parentIdStr);
      if (!parentBlock) {
        return {
          success: false,
          file_path,
          error: `Parent with fileID ${parent} not found. Provide a GameObject or Transform fileID.`
        };
      }
      if (parentBlock.class_id === 4) {
        parentTransformIdStr = parentIdStr;
      } else if (parentBlock.class_id === 1) {
        // It's a GO, find its transform
        const compMatch = parentBlock.raw.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
        if (compMatch) {
          parentTransformIdStr = compMatch[1];
        } else {
          return {
            success: false,
            file_path,
            error: `Parent with fileID ${parent} not found. Provide a GameObject or Transform fileID.`
          };
        }
      } else {
        return {
          success: false,
          file_path,
          error: `Parent with fileID ${parent} is not a GameObject or Transform.`
        };
      }
    } else {
      // Parent name - find its Transform
      const foundResult = findTransformIdByName(doc, parent);
      if (foundResult === null) {
        return {
          success: false,
          file_path,
          error: `Parent GameObject "${parent}" not found`
        };
      }
      if (typeof foundResult === 'object') {
        return { success: false, file_path, error: foundResult.error };
      }
      parentTransformIdStr = foundResult;
    }
  }

  // Detect if this is a prefab variant (contains PrefabInstance blocks) and no explicit parent was given
  let variantPiId: string | undefined;
  let strippedSourceRef: string | undefined;
  const prefabInstanceBlocks = doc.find_by_class_id(1001);

  if (prefabInstanceBlocks.length > 0 && parentTransformIdStr === '0') {
    const piId = prefabInstanceBlocks[0].file_id;
    const strippedInfo = findStrippedRootTransform(doc, piId);
    if (strippedInfo) {
      parentTransformIdStr = strippedInfo.transformId;
      strippedSourceRef = strippedInfo.sourceRef;
      variantPiId = piId;
    }
  }

  // Calculate root order and layer inheritance
  const rootOrder = doc.calculate_root_order(parentTransformIdStr);
  const layer = get_layer_from_parent(doc, parentTransformIdStr);

  // Generate unique IDs for the new GameObject and Transform
  const gameObjectIdStr = doc.generate_file_id();
  const transformIdStr = doc.generate_file_id();

  // Create the YAML blocks
  const gameObjectId = parseInt(gameObjectIdStr, 10);
  const transformId = parseInt(transformIdStr, 10);
  const parentTransformId = parseInt(parentTransformIdStr, 10);
  const newBlocks = createGameObjectYAML(gameObjectId, transformId, name.trim(), parentTransformId, rootOrder, layer);

  // Append blocks to document
  doc.append_raw(newBlocks);

  // If parented to a non-stripped transform, add child to parent's m_Children array
  if (parentTransformIdStr !== '0' && !variantPiId) {
    doc.add_child_to_parent(parentTransformIdStr, transformIdStr);
  }

  // If variant, register in PrefabInstance's m_AddedGameObjects
  if (variantPiId && strippedSourceRef) {
    appendToAddedGameObjects(doc, variantPiId, strippedSourceRef, gameObjectIdStr);
  }

  // Save
  const saveResult = doc.save();
  if (!saveResult.success) {
    return {
      success: false,
      file_path,
      error: saveResult.error
    };
  }

  return {
    success: true,
    file_path,
    game_object_id: gameObjectId,
    transform_id: transformId,
    prefab_instance_id: variantPiId ? parseInt(variantPiId, 10) : undefined
  };
}

/**
 * Create a new Unity scene file with the 4 required global blocks.
 * Optionally includes default Main Camera and Directional Light.
 */
export function createScene(options: CreateSceneOptions): CreateSceneResult {
  const { output_path, include_defaults, scene_guid } = options;

  // Validate file path security
  const pathError = validate_file_path(output_path, 'write');
  if (pathError) {
    return { success: false, output_path, error: pathError };
  }

  if (!output_path.endsWith('.unity')) {
    return {
      success: false,
      output_path,
      error: 'Output path must have .unity extension',
    };
  }

  if (existsSync(output_path)) {
    return {
      success: false,
      output_path,
      error: `File already exists: ${output_path}. Delete it first or choose a different path.`,
    };
  }

  const guid = scene_guid || generateGuid();

  let yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
  m_OcclusionCullingData: {fileID: 0}
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.133, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
  m_HaloStrength: 0.5
  m_FlareStrength: 1
  m_FlareFadeSpeed: 3
  m_HaloTexture: {fileID: 0}
  m_SpotCookie: {fileID: 10001, guid: 0000000000000000e000000000000000, type: 0}
  m_DefaultReflectionMode: 0
  m_DefaultReflectionResolution: 128
  m_ReflectionBounces: 1
  m_ReflectionIntensity: 1
  m_CustomReflection: {fileID: 0}
  m_Sun: {fileID: 0}
  m_IndirectSpecularColor: {r: 0.44657898, g: 0.4964133, b: 0.5748178, a: 1}
  m_UseRadianceAmbientProbe: 0
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 12
  m_GIWorkflowMode: 1
  m_GISettings:
    serializedVersion: 2
    m_BounceScale: 1
    m_IndirectOutputScale: 1
    m_AlbedoBoost: 1
    m_EnvironmentLightingMode: 0
    m_EnableBakedLightmaps: 1
    m_EnableRealtimeLightmaps: 0
  m_LightmapEditorSettings:
    serializedVersion: 12
    m_Resolution: 2
    m_BakeResolution: 40
    m_AtlasSize: 1024
    m_AO: 0
    m_AOMaxDistance: 1
    m_CompAOExponent: 1
    m_CompAOExponentDirect: 0
    m_ExtractAmbientOcclusion: 0
    m_Padding: 2
    m_LightmapParameters: {fileID: 0}
    m_LightmapsBakeMode: 1
    m_TextureCompression: 1
    m_FinalGather: 0
    m_FinalGatherFiltering: 1
    m_FinalGatherRayCount: 256
    m_ReflectionCompression: 2
    m_MixedBakeMode: 2
    m_BakeBackend: 1
    m_PVRSampling: 1
    m_PVRDirectSampleCount: 32
    m_PVRSampleCount: 512
    m_PVRBounces: 2
    m_PVREnvironmentSampleCount: 256
    m_PVREnvironmentReferencePointCount: 2048
    m_PVRFilteringMode: 1
    m_PVRDenoiserTypeDirect: 1
    m_PVRDenoiserTypeIndirect: 1
    m_PVRDenoiserTypeAO: 1
    m_PVRFilterTypeDirect: 0
    m_PVRFilterTypeIndirect: 0
    m_PVRFilterTypeAO: 0
    m_PVREnvironmentMIS: 1
    m_PVRCulling: 1
    m_PVRFilteringGaussRadiusDirect: 1
    m_PVRFilteringGaussRadiusIndirect: 5
    m_PVRFilteringGaussRadiusAO: 2
    m_PVRFilteringAtrousPositionSigmaDirect: 0.5
    m_PVRFilteringAtrousPositionSigmaIndirect: 2
    m_PVRFilteringAtrousPositionSigmaAO: 1
    m_ExportTrainingData: 0
    m_TrainingDataDestination: TrainingData
    m_LightProbeSampleCountMultiplier: 4
  m_LightingDataAsset: {fileID: 0}
  m_LightingSettings: {fileID: 0}
--- !u!196 &4
NavMeshSettings:
  serializedVersion: 2
  m_ObjectHideFlags: 0
  m_BuildSettings:
    serializedVersion: 3
    agentTypeID: 0
    agentRadius: 0.5
    agentHeight: 2
    agentSlope: 45
    agentClimb: 0.4
    ledgeDropHeight: 0
    maxJumpAcrossDistance: 0
    minRegionArea: 2
    manualCellSize: 0
    cellSize: 0.16666667
    manualTileSize: 0
    tileSize: 256
    buildHeightMesh: 0
    maxJobWorkers: 0
    preserveTilesOutsideBounds: 0
    debug:
      m_Flags: 0
  m_NavMeshData: {fileID: 0}
`;

  if (include_defaults) {
    // Add Main Camera: GameObject + Transform + Camera + AudioListener
    yaml += `--- !u!1 &519420028
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 519420032}
  - component: {fileID: 519420031}
  - component: {fileID: 519420029}
  m_Layer: 0
  m_Name: Main Camera
  m_TagString: MainCamera
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &519420032
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 1, z: -10}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 0
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!20 &519420031
Camera:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
  serializedVersion: 2
  m_ClearFlags: 1
  m_BackGroundColor: {r: 0.19215687, g: 0.3019608, b: 0.4745098, a: 0}
  m_projectionMatrixMode: 1
  m_GateFitMode: 2
  m_FOVAxisMode: 0
  m_Iso: 200
  m_ShutterSpeed: 0.005
  m_Aperture: 16
  m_FocusDistance: 10
  m_FocalLength: 50
  m_BladeCount: 5
  m_Curvature: {x: 2, y: 11}
  m_BarrelClipping: 0.25
  m_Anamorphism: 0
  m_SensorSize: {x: 36, y: 24}
  m_LensShift: {x: 0, y: 0}
  m_NormalizedViewPortRect:
    serializedVersion: 2
    x: 0
    y: 0
    width: 1
    height: 1
  near clip plane: 0.3
  far clip plane: 1000
  field of view: 60
  orthographic: 0
  orthographic size: 5
  m_Depth: -1
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingPath: -1
  m_TargetTexture: {fileID: 0}
  m_TargetDisplay: 0
  m_TargetEye: 3
  m_HDR: 1
  m_AllowMSAA: 1
  m_AllowDynamicResolution: 0
  m_ForceIntoRT: 0
  m_OcclusionCulling: 1
  m_StereoConvergence: 10
  m_StereoSeparation: 0.022
--- !u!81 &519420029
AudioListener:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
--- !u!1 &705507993
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 705507995}
  - component: {fileID: 705507994}
  m_Layer: 0
  m_Name: Directional Light
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &705507995
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  serializedVersion: 2
  m_LocalRotation: {x: 0.40821788, y: -0.23456968, z: 0.10938163, w: 0.8754261}
  m_LocalPosition: {x: 0, y: 3, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_RootOrder: 1
  m_LocalEulerAnglesHint: {x: 50, y: -30, z: 0}
--- !u!108 &705507994
Light:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  m_Enabled: 1
  serializedVersion: 10
  m_Type: 1
  m_Shape: 0
  m_Color: {r: 1, g: 0.95686275, b: 0.8392157, a: 1}
  m_Intensity: 1
  m_Range: 10
  m_SpotAngle: 30
  m_InnerSpotAngle: 21.80208
  m_CookieSize: 10
  m_Shadows:
    m_Type: 2
    m_Resolution: -1
    m_CustomResolution: -1
    m_Strength: 1
    m_Bias: 0.05
    m_NormalBias: 0.4
    m_NearPlane: 0.2
    m_CullingMatrixOverride:
      e00: 1
      e01: 0
      e02: 0
      e03: 0
      e10: 0
      e11: 1
      e12: 0
      e13: 0
      e20: 0
      e21: 0
      e22: 1
      e23: 0
      e30: 0
      e31: 0
      e32: 0
      e33: 1
    m_UseCullingMatrixOverride: 0
  m_Cookie: {fileID: 0}
  m_DrawHalo: 0
  m_Flare: {fileID: 0}
  m_RenderMode: 0
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingLayerMask: 1
  m_Lightmapping: 4
  m_LightShadowCasterMode: 0
  m_AreaSize: {x: 1, y: 1}
  m_BounceIntensity: 1
  m_ColorTemperature: 6570
  m_UseColorTemperature: 0
  m_BoundingSphereOverride: {x: 0, y: 0, z: 0, w: 0}
  m_UseBoundingSphereOverride: 0
  m_UseViewFrustumForShadowCasterCull: 1
  m_ShadowRadius: 0
  m_ShadowAngle: 0
`;
  }

  // Write the scene file
  try {
    writeFileSync(output_path, yaml, 'utf-8');
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write scene file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Generate .meta file
  const metaContent = `fileFormatVersion: 2
guid: ${guid}
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  const metaPath = output_path + '.meta';
  try {
    writeFileSync(metaPath, metaContent, 'utf-8');
  } catch (err) {
    // Clean up scene file if meta write fails
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore */ }

    return {
      success: false,
      output_path,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    success: true,
    output_path,
    scene_guid: guid,
    meta_path: metaPath,
  };
}

/**
 * Create a Prefab Variant from a source prefab.
 */
export function createPrefabVariant(options: CreatePrefabVariantOptions): CreatePrefabVariantResult {
  const { source_prefab, output_path, variant_name } = options;

  // Check source prefab exists
  if (!existsSync(source_prefab)) {
    return {
      success: false,
      output_path,
      error: `Source prefab not found: ${source_prefab}`
    };
  }

  // Check source prefab has .prefab extension
  if (!source_prefab.endsWith('.prefab')) {
    return {
      success: false,
      output_path,
      error: 'Source file must be a .prefab file'
    };
  }

  // Check output path has .prefab extension
  if (!output_path.endsWith('.prefab')) {
    return {
      success: false,
      output_path,
      error: 'Output path must have .prefab extension'
    };
  }

  // Check output doesn't already exist
  if (existsSync(output_path)) {
    return {
      success: false,
      output_path,
      error: `File already exists: ${output_path}. Delete it first or choose a different path.`
    };
  }

  if (existsSync(output_path + '.meta')) {
    return {
      success: false,
      output_path,
      error: `Meta file already exists: ${output_path}.meta. Delete it first or choose a different path.`
    };
  }

  // Get source prefab GUID from .meta file
  const metaPath = source_prefab + '.meta';
  const sourceGuid = extractGuidFromMeta(metaPath);

  if (!sourceGuid) {
    return {
      success: false,
      output_path,
      error: `Could not find or read .meta file for source prefab: ${metaPath}`
    };
  }

  // Read source prefab to find root GameObject info
  let sourceDoc: UnityDocument;
  try {
    sourceDoc = UnityDocument.from_file(source_prefab);
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  const rootInfo = sourceDoc.find_prefab_root();
  if (!rootInfo) {
    return {
      success: false,
      output_path,
      error: 'Could not find root GameObject in source prefab'
    };
  }

  // Generate IDs for the variant (use temp doc for generation)
  const tempDoc = UnityDocument.from_string('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n');
  const prefabInstanceId = parseInt(tempDoc.generate_file_id(), 10);
  const strippedGoId = parseInt(tempDoc.generate_file_id(), 10);
  const strippedTransformId = parseInt(tempDoc.generate_file_id(), 10);

  // Determine variant name
  const finalName = variant_name || `${rootInfo.name} Variant`;

  // Create the Prefab Variant YAML
  const variantYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &${strippedGoId} stripped
GameObject:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.game_object.file_id}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!4 &${strippedTransformId} stripped
Transform:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.transform.file_id}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!1001 &${prefabInstanceId}
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: ${rootInfo.game_object.file_id}, guid: ${sourceGuid}, type: 3}
      propertyPath: m_Name
      value: ${finalName}
      objectReference: {fileID: 0}
    m_RemovedComponents: []
    m_RemovedGameObjects: []
    m_AddedGameObjects: []
    m_AddedComponents: []
  m_SourcePrefab: {fileID: 100100000, guid: ${sourceGuid}, type: 3}
`;

  // Write the variant prefab
  try {
    writeFileSync(output_path, variantYaml, 'utf-8');
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write variant prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Generate .meta file for the variant
  const variantGuid = generateGuid();
  const variantMetaContent = `fileFormatVersion: 2
guid: ${variantGuid}
PrefabImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(output_path + '.meta', variantMetaContent, 'utf-8');
  } catch (err) {
    // Clean up the prefab file if meta write fails
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore cleanup error */ }

    return {
      success: false,
      output_path,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return {
    success: true,
    output_path,
    source_guid: sourceGuid,
    prefab_instance_id: prefabInstanceId
  };
}

/**
 * Create a new ScriptableObject .asset file.
 */
export function createScriptableObject(options: CreateScriptableObjectOptions): CreateScriptableObjectResult {
  const { output_path, script } = options;
  // Auto-detect project root from output path if not explicitly provided
  const project_path = options.project_path || find_unity_project_root(path.dirname(output_path)) || undefined;

  if (!output_path.endsWith('.asset')) {
    return { success: false, output_path, error: 'Output path must have .asset extension' };
  }

  if (existsSync(output_path)) {
    return { success: false, output_path, error: `File already exists: ${output_path}. Delete it first or choose a different path.` };
  }

  if (existsSync(output_path + '.meta')) {
    return { success: false, output_path, error: `Meta file already exists: ${output_path}.meta. Delete it first or choose a different path.` };
  }

  // Reject built-in Unity class names -- ScriptableObjects require a custom script
  const builtInClassId = get_class_id(script);
  if (builtInClassId !== null) {
    return { success: false, output_path, error: `"${script}" is a built-in Unity class (class ${builtInClassId}), not a custom script. ScriptableObjects require a custom script that derives from ScriptableObject. Provide a script GUID, .cs file path, or script name with --project.` };
  }

  const resolved = resolve_script_with_fields(script, project_path);
  if (!resolved) {
    const hints: string[] = [];
    if (project_path) {
      const cacheExists = existsSync(path.join(project_path, '.unity-agentic', 'guid-cache.json'));
      const registryExists = existsSync(path.join(project_path, '.unity-agentic', 'type-registry.json'));
      if (!cacheExists && !registryExists) {
        hints.push(`No GUID cache or type registry found at ${path.join(project_path, '.unity-agentic/')}. Run "unity-agentic-tools setup" first.`);
      } else if (!registryExists) {
        hints.push('Type registry not found. Re-run "unity-agentic-tools setup" to rebuild.');
      }
    } else {
      hints.push('No Unity project detected. Provide --project or run from inside a Unity project directory.');
    }
    return { success: false, output_path, error: `Script not found: "${script}". Provide a GUID, script path, or script name.${hints.length > 0 ? ' ' + hints.join(' ') : ''}` };
  }

  // Validate: reject non-ScriptableObject types when base class is known
  if (resolved.kind === 'enum' || resolved.kind === 'interface') {
    return { success: false, output_path, error: `"${script}" is ${resolved.kind === 'enum' ? 'an enum' : 'an interface'}, not a ScriptableObject.` };
  }
  if (resolved.base_class && resolved.base_class !== 'ScriptableObject') {
    return { success: false, output_path, error: `"${script}" extends ${resolved.base_class}, not ScriptableObject. Cannot create as a ScriptableObject asset.` };
  }

  // Read project version for version-gated field defaults
  let version: UnityVersion | undefined;
  if (project_path) {
    try { version = read_project_version(project_path); } catch { /* no version info */ }
  }

  const baseName = path.basename(output_path, '.asset');
  const field_yaml = resolved.fields && resolved.fields.length > 0
    ? generate_field_yaml(resolved.fields, version)
    : '\n';

  const assetYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 0}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${resolved.guid}, type: 3}
  m_Name: ${baseName}
  m_EditorClassIdentifier:${field_yaml}`;

  try {
    writeFileSync(output_path, assetYaml, 'utf-8');
  } catch (err) {
    return { success: false, output_path, error: `Failed to write asset file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Generate .meta file
  const assetGuid = generateGuid();
  const metaContent = `fileFormatVersion: 2
guid: ${assetGuid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 11400000
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(output_path + '.meta', metaContent, 'utf-8');
  } catch (err) {
    try {
      const fs = require('fs');
      fs.unlinkSync(output_path);
    } catch { /* ignore */ }
    return { success: false, output_path, error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const result: CreateScriptableObjectResult = {
    success: true,
    output_path,
    script_guid: resolved.guid,
    asset_guid: assetGuid,
  };
  if (resolved.extraction_error) {
    result.warning = resolved.extraction_error;
  }
  return result;
}

/**
 * Create a Unity .meta file for a script, using a generated GUID.
 * Will not overwrite existing .meta files.
 */
export function createMetaFile(options: CreateMetaFileOptions): CreateMetaFileResult {
  const { script_path } = options;
  const metaPath = script_path + '.meta';

  if (!existsSync(script_path)) {
    return {
      success: false,
      meta_path: metaPath,
      error: `Source file not found: ${script_path}`
    };
  }

  if (existsSync(metaPath)) {
    return {
      success: false,
      meta_path: metaPath,
      error: `.meta file already exists: ${metaPath}`
    };
  }

  const guid = generateGuid();

  const metaContent = `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
`;

  try {
    writeFileSync(metaPath, metaContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      meta_path: metaPath,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return {
    success: true,
    meta_path: metaPath,
    guid
  };
}

/**
 * Add a component to an existing GameObject.
 * Supports any Unity built-in component by name (e.g., "MeshRenderer", "Animator", "Canvas")
 * and custom scripts by name, path, or GUID.
 */
export function addComponent(options: AddComponentOptions): AddComponentResult {
  const { file_path, game_object_name, component_type } = options;
  // Auto-detect project root from scene file if not explicitly provided
  const project_path = options.project_path || find_unity_project_root(path.dirname(file_path)) || undefined;

  // Validate file path security
  const pathError = validate_file_path(file_path, 'write');
  if (pathError) {
    return { success: false, file_path, error: pathError };
  }

  // Check if file exists
  if (!existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }

  // Load document
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Find the GameObject (must be unique for destructive operation)
  const goResult = doc.require_unique_game_object(game_object_name);
  if ('error' in goResult) {
    return { success: false, file_path, error: goResult.error };
  }
  const gameObjectIdStr = goResult.file_id;
  const gameObjectId = parseInt(gameObjectIdStr, 10);

  // Check if it's a known Unity built-in component
  const classId = get_class_id(component_type);

  // Check for existing component of the same type (warn but allow — some like AudioSource can be duplicated)
  let duplicateWarning: string | undefined;
  const goBlock = doc.find_by_file_id(gameObjectIdStr);
  if (goBlock && classId !== null) {
    const compRefs = [...goBlock.raw.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g)].map(m => m[1]);
    for (const refId of compRefs) {
      const compBlock = doc.find_by_file_id(refId);
      if (compBlock && compBlock.class_id === classId) {
        duplicateWarning = `GameObject already has a ${component_type} component (fileID: ${refId}). Adding duplicate.`;
        break;
      }
    }
  }

  // Generate unique component ID
  const componentIdStr = doc.generate_file_id();
  const componentId = parseInt(componentIdStr, 10);

  let componentYAML: string;
  let scriptGuid: string | undefined;
  let scriptPath: string | undefined;
  let extractionError: string | undefined;
  if (classId !== null) {
    // Get the canonical component name from the class ID mapping
    const componentName = UNITY_CLASS_IDS[classId] || component_type;
    componentYAML = createGenericComponentYAML(componentName, classId, componentId, gameObjectId);
  } else {
    // Treat as custom script -- resolve with field extraction
    const resolved = resolve_script_with_fields(component_type, project_path);
    if (!resolved) {
      const hints: string[] = [];
      if (project_path) {
        const cacheExists = existsSync(path.join(project_path, '.unity-agentic', 'guid-cache.json'));
        const registryExists = existsSync(path.join(project_path, '.unity-agentic', 'type-registry.json'));
        if (!cacheExists && !registryExists) {
          hints.push(`No GUID cache or type registry found at ${path.join(project_path, '.unity-agentic/')}. Run "unity-agentic-tools setup" first.`);
        } else if (!registryExists) {
          hints.push('Type registry not found. Re-run "unity-agentic-tools setup" to rebuild.');
        }
      } else {
        hints.push('No Unity project detected. Provide --project or run from inside a Unity project directory.');
      }
      return {
        success: false,
        file_path,
        error: `Component or script not found: "${component_type}". Use a Unity component name (e.g., "MeshRenderer", "Animator") or provide a script name, path (Assets/Scripts/Foo.cs), or GUID.${hints.length > 0 ? ' ' + hints.join(' ') : ''}`
      };
    }

    // Validate: reject non-component types when base class is known
    if (resolved.kind === 'enum' || resolved.kind === 'interface') {
      return {
        success: false,
        file_path,
        error: `"${component_type}" is ${resolved.kind === 'enum' ? 'an enum' : 'an interface'}, not a MonoBehaviour. Cannot add as a component.`
      };
    }
    if (resolved.base_class && !['MonoBehaviour', 'NetworkBehaviour', 'StateMachineBehaviour'].includes(resolved.base_class)) {
      return {
        success: false,
        file_path,
        error: `"${component_type}" extends ${resolved.base_class}, not MonoBehaviour. Cannot add as a component.`
      };
    }

    // Read project version for version-gated field defaults
    let version: UnityVersion | undefined;
    if (project_path) {
      try { version = read_project_version(project_path); } catch { /* no version info */ }
    }

    componentYAML = createMonoBehaviourYAML(componentId, gameObjectId, resolved.guid, resolved.fields, version);
    scriptGuid = resolved.guid;
    scriptPath = resolved.path || undefined;
    extractionError = resolved.extraction_error;
  }

  // Add component reference to GameObject
  addComponentToGameObject(doc, gameObjectIdStr, componentIdStr);

  // Append component block to document
  doc.append_raw(componentYAML);

  // Save
  const saveResult = doc.save();
  if (!saveResult.success) {
    return {
      success: false,
      file_path,
      error: saveResult.error
    };
  }

  // Collect warnings: duplicate component + extraction errors
  const warnings: string[] = [];
  if (duplicateWarning) warnings.push(duplicateWarning);
  if (extractionError) warnings.push(extractionError);

  const result: AddComponentResult = {
    success: true,
    file_path,
    component_id: componentId,
    script_guid: scriptGuid,
    script_path: scriptPath,
  };
  if (warnings.length > 0) {
    result.warning = warnings.join(' ');
  }
  return result;
}

/**
 * Copy a component to a different (or same) GameObject.
 */
export function copyComponent(options: CopyComponentOptions): CopyComponentResult {
  const { file_path, source_file_id, target_game_object_name } = options;

  if (!existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }

  // Load document
  let doc: UnityDocument;
  try {
    doc = UnityDocument.from_file(file_path);
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const sourceBlock = doc.find_by_file_id(source_file_id);
  if (!sourceBlock) {
    return { success: false, file_path, error: `Component with file ID ${source_file_id} not found` };
  }

  if (sourceBlock.class_id === 1) {
    return { success: false, file_path, error: 'Cannot copy a GameObject. Use duplicate instead.' };
  }
  if (sourceBlock.class_id === 4) {
    return { success: false, file_path, error: 'Cannot copy a Transform component.' };
  }

  const targetResult = doc.require_unique_game_object(target_game_object_name);
  if ('error' in targetResult) {
    return { success: false, file_path, error: targetResult.error };
  }
  const targetGoIdStr = targetResult.file_id;
  const targetGoId = parseInt(targetGoIdStr, 10);

  const newIdStr = doc.generate_file_id();
  const newId = parseInt(newIdStr, 10);

  // Clone the block with new fileId and updated m_GameObject
  let clonedBlock = sourceBlock.raw.replace(
    new RegExp(`^(--- !u!${sourceBlock.class_id} &)${source_file_id}`),
    `$1${newId}`
  );
  clonedBlock = clonedBlock.replace(
    /m_GameObject:\s*\{fileID:\s*\d+\}/,
    `m_GameObject: {fileID: ${targetGoId}}`
  );

  // Add component reference to target GO
  addComponentToGameObject(doc, targetGoIdStr, newIdStr);

  // Append cloned block
  doc.append_raw(clonedBlock);

  // Validate and save
  if (!doc.validate()) {
    return { success: false, file_path, error: 'Validation failed after copying component' };
  }

  const saveResult = doc.save();
  if (!saveResult.success) {
    return { success: false, file_path, error: saveResult.error };
  }

  return {
    success: true,
    file_path,
    source_file_id,
    new_component_id: newId,
    target_game_object: target_game_object_name
  };
}
