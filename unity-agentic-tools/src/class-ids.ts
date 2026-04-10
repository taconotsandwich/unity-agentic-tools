/**
 * Unity Class IDs - comprehensive mapping of class ID to component name.
 * Reference: https://docs.unity3d.com/Manual/ClassIDReference.html
 */
export const UNITY_CLASS_IDS: Record<number, string> = {
    // Core
    1: "GameObject",
    2: "Component",
    3: "LevelGameManager",
    4: "Transform",
    5: "TimeManager",
    6: "GlobalGameManager",
    8: "Behaviour",
    9: "GameManager",
    11: "AudioManager",
    13: "InputManager",
    18: "EditorExtension",
    19: "Physics2DSettings",
    20: "Camera",
    21: "Material",
    23: "MeshRenderer",
    25: "Renderer",
    27: "Texture",
    28: "Texture2D",
    29: "OcclusionCullingSettings",
    30: "GraphicsSettings",
    33: "MeshFilter",
    41: "OcclusionPortal",
    43: "Mesh",
    45: "Skybox",
    47: "QualitySettings",
    48: "Shader",
    49: "TextAsset",
    50: "Rigidbody2D",
    53: "Collider2D",
    54: "Rigidbody",
    55: "PhysicsManager",
    56: "Collider",
    57: "Joint",
    58: "CircleCollider2D",
    59: "HingeJoint",
    60: "PolygonCollider2D",
    61: "BoxCollider2D",
    62: "PhysicsMaterial2D",
    64: "MeshCollider",
    65: "BoxCollider",
    66: "CompositeCollider2D",
    68: "EdgeCollider2D",
    70: "CapsuleCollider2D",
    72: "ComputeShader",
    74: "AnimationClip",
    75: "ConstantForce",
    78: "TagManager",
    81: "AudioListener",
    82: "AudioSource",
    83: "AudioClip",
    84: "RenderTexture",
    86: "CustomRenderTexture",
    89: "Cubemap",
    90: "Avatar",
    91: "AnimatorController",
    93: "RuntimeAnimatorController",
    94: "ScriptMapper",
    95: "Animator",
    96: "TrailRenderer",
    98: "DelayedCallManager",
    102: "TextMesh",
    104: "RenderSettings",
    108: "Light",
    109: "CGProgram",
    110: "BaseAnimationTrack",
    111: "Animation",
    114: "MonoBehaviour",
    115: "MonoScript",
    117: "Texture3D",
    118: "NewAnimationTrack",
    119: "Projector",
    120: "LineRenderer",
    121: "Flare",
    122: "Halo",
    123: "LensFlare",
    124: "FlareLayer",
    126: "NavMeshProjectSettings",
    128: "Font",
    129: "PlayerSettings",
    130: "NamedObject",
    134: "PhysicMaterial",
    135: "SphereCollider",
    136: "CapsuleCollider",
    137: "SkinnedMeshRenderer",
    138: "FixedJoint",
    141: "BuildSettings",
    142: "AssetBundle",
    143: "CharacterController",
    144: "CharacterJoint",
    145: "SpringJoint",
    146: "WheelCollider",
    147: "ResourceManager",
    150: "PreloadData",
    153: "ConfigurableJoint",
    154: "TerrainCollider",
    156: "TerrainData",
    157: "LightmapSettings",
    158: "WebCamTexture",
    159: "EditorSettings",
    162: "EditorUserSettings",
    164: "AudioReverbFilter",
    165: "AudioHighPassFilter",
    166: "AudioChorusFilter",
    1660057539: "SceneRoots",
    167: "AudioReverbZone",
    168: "AudioEchoFilter",
    169: "AudioLowPassFilter",
    170: "AudioDistortionFilter",
    171: "SparseTexture",
    180: "AudioBehaviour",
    181: "AudioFilter",
    182: "WindZone",
    183: "Cloth",
    184: "SubstanceArchive",
    185: "ProceduralMaterial",
    186: "ProceduralTexture",
    187: "Texture2DArray",
    188: "CubemapArray",
    191: "OffMeshLink",
    192: "OcclusionArea",
    193: "Tree",
    195: "NavMeshAgent",
    196: "NavMeshSettings",
    198: "ParticleSystem",
    199: "ParticleSystemRenderer",
    200: "ShaderVariantCollection",
    205: "LODGroup",
    206: "BlendTree",
    207: "Motion",
    208: "NavMeshObstacle",
    210: "SortingGroup",
    212: "SpriteRenderer",
    213: "Sprite",
    214: "CachedSpriteAtlas",
    215: "ReflectionProbe",
    218: "Terrain",
    220: "LightProbeGroup",
    221: "AnimatorOverrideController",
    222: "CanvasRenderer",
    223: "Canvas",
    224: "RectTransform",
    225: "CanvasGroup",
    226: "BillboardAsset",
    227: "BillboardRenderer",
    228: "SpeedTreeWindAsset",
    229: "AnchoredJoint2D",
    230: "Joint2D",
    231: "SpringJoint2D",
    232: "DistanceJoint2D",
    233: "HingeJoint2D",
    234: "SliderJoint2D",
    235: "WheelJoint2D",
    236: "ClusterInputManager",
    237: "BaseVideoTexture",
    238: "NavMeshData",
    240: "AudioMixer",
    241: "AudioMixerController",
    243: "AudioMixerGroupController",
    244: "AudioMixerEffectController",
    245: "AudioMixerSnapshotController",
    246: "PhysicsUpdateBehaviour2D",
    247: "ConstantForce2D",
    248: "Effector2D",
    249: "AreaEffector2D",
    250: "PointEffector2D",
    251: "PlatformEffector2D",
    252: "SurfaceEffector2D",
    253: "BuoyancyEffector2D",
    254: "RelativeJoint2D",
    255: "FixedJoint2D",
    256: "FrictionJoint2D",
    257: "TargetJoint2D",
    258: "LightProbes",
    259: "LightProbeProxyVolume",
    260: "SampleClipLegacy",
    261: "AudioMixerSnapshotLegacy",
    262: "AudioMixerGroupLegacy",
    265: "NScreenBridge",
    271: "SampleClip",
    272: "UnityAdsManager",
    273: "AudioMixerGroup",
    280: "UnityConnectSettingsLegacy",
    281: "AvatarMaskLegacy",
    290: "AssetBundleManifest",
    292: "VideoPlayerLegacy",
    293: "VideoClipLegacy",
    294: "ParticleSystemForceFieldLegacy",
    298: "SpriteMaskLegacy",
    300: "WorldAnchor",
    301: "OcclusionCullingDataLegacy",
    310: "UnityConnectSettings",
    1001: "PrefabInstance",
    319: "AvatarMask",
    320: "PlayableDirector",
    328: "VideoPlayer",
    329: "VideoClip",
    330: "ParticleSystemForceField",
    331: "SpriteMask",
    363: "OcclusionCullingData",
    1006: "TextureImporter",
    181963792: "Preset",
    687078895: "SpriteAtlas",
    156049354: "Grid",
    1742807556: "GridLayout",
    // UI components
    1839735485: "Tilemap",
    19719996: "TilemapCollider2D",
    483693784: "TilemapRenderer",
    1839735486: "TilemapCollider2DLegacy",
    1839735487: "TilemapRendererLegacy",
};

/**
 * Reverse lookup: component name to class ID.
 */
export const UNITY_CLASS_NAMES: Record<string, number> = Object.fromEntries(
    Object.entries(UNITY_CLASS_IDS).map(([id, name]) => [name, parseInt(id, 10)])
);

/**
 * Class IDs that can legally appear in a GameObject's m_Component list.
 *
 * This is intentionally narrower than UNITY_CLASS_IDS, which also includes
 * project settings, assets, and other serialized Unity object types such as
 * AudioManager and GameManager.
 */
const UNITY_COMPONENT_CLASS_IDS = new Set<number>([
    4, 8, 20, 23, 25, 33, 50, 53, 54, 56, 57, 58, 59, 60, 61, 64, 65, 66, 68, 70,
    75, 81, 82, 95, 96, 102, 108, 111, 114, 119, 120, 124, 135, 136, 137, 138, 143,
    144, 145, 146, 153, 154, 164, 165, 166, 167, 168, 169, 170, 180, 181, 182, 183,
    191, 192, 193, 195, 198, 199, 205, 208, 210, 212, 215, 220, 222, 223, 224, 225,
    229, 230, 231, 232, 233, 234, 235, 247, 248, 249, 250, 251, 252, 253, 254, 255,
    256, 257, 259, 300, 320, 328, 330, 331, 156049354, 1742807556, 1839735485,
    19719996, 483693784, 1839735486, 1839735487,
]);

/**
 * Built-in component class IDs that users can explicitly add with
 * create component. Excludes non-addable base/internal types such as
 * Transform, RectTransform, MonoBehaviour, Collider, Joint, etc.
 */
const UNITY_ADDABLE_COMPONENT_CLASS_IDS = new Set<number>([
    20, 23, 33, 50, 54, 58, 59, 60, 61, 64, 65, 66, 68, 70, 75, 81, 82, 95, 96, 102,
    108, 111, 119, 120, 124, 135, 136, 137, 138, 143, 144, 145, 146, 153, 154, 164,
    165, 166, 167, 168, 169, 170, 182, 183, 191, 192, 193, 195, 198, 199, 205, 208,
    210, 212, 215, 220, 222, 223, 225, 231, 232, 233, 234, 235, 247, 249, 250, 251,
    252, 253, 254, 255, 256, 257, 259, 300, 320, 328, 330, 331, 156049354, 1742807556,
    1839735485, 19719996, 483693784,
]);

const UNITY_BUILTIN_NAMESPACE_PREFIXES = ['UnityEngine', 'UnityEditor'];

function find_namespaced_class_id(component_name: string, allowed_class_ids?: Set<number>): number | null {
    const dot_index = component_name.lastIndexOf('.');
    if (dot_index <= 0) return null;

    const namespace_name = component_name.slice(0, dot_index);
    const short_name = component_name.slice(dot_index + 1);
    const is_unity_namespace = UNITY_BUILTIN_NAMESPACE_PREFIXES.some(prefix =>
        namespace_name === prefix || namespace_name.startsWith(`${prefix}.`)
    );

    if (!is_unity_namespace || short_name.length === 0) {
        return null;
    }

    return find_class_id(short_name, allowed_class_ids);
}

function find_class_id(component_name: string, allowed_class_ids?: Set<number>): number | null {
    const matches_allowed = (class_id: number): boolean => {
        return allowed_class_ids ? allowed_class_ids.has(class_id) : true;
    };

    if (UNITY_CLASS_NAMES[component_name] !== undefined) {
        const class_id = UNITY_CLASS_NAMES[component_name];
        return matches_allowed(class_id) ? class_id : null;
    }

    const lowerName = component_name.toLowerCase();
    for (const [name, id] of Object.entries(UNITY_CLASS_NAMES)) {
        if (name.toLowerCase() === lowerName) {
            return matches_allowed(id) ? id : null;
        }
    }

    const namespaced_match = find_namespaced_class_id(component_name, allowed_class_ids);
    if (namespaced_match !== null) {
        return namespaced_match;
    }

    return null;
}

/**
 * Get component name from class ID.
 */
export function get_class_id_name(class_id: number): string {
    return UNITY_CLASS_IDS[class_id] || `Unknown_${class_id}`;
}

/**
 * Get class ID from component name (case-insensitive).
 */
export function get_class_id(component_name: string): number | null {
    return find_class_id(component_name);
}

/**
 * Get the class ID for a Unity type that can appear on a GameObject.
 */
export function get_component_class_id(component_name: string): number | null {
    return find_class_id(component_name, UNITY_COMPONENT_CLASS_IDS);
}

/**
 * Get the class ID for a built-in component that can be added to a GameObject.
 */
export function get_addable_component_class_id(component_name: string): number | null {
    return find_class_id(component_name, UNITY_ADDABLE_COMPONENT_CLASS_IDS);
}

/**
 * Check if a component name is a known Unity built-in type.
 */
export function is_builtin_component(component_name: string): boolean {
    return get_component_class_id(component_name) !== null;
}
