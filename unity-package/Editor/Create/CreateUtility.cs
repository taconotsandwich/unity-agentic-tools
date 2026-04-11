using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityAgenticTools.Util;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityAgenticTools.Create
{
    internal static class CreateUtility
    {
        private const string InputActionsImporterGuid = "8404be70184654265930450def6a9037";
        private static readonly Regex GuidRegex = new Regex("^[a-fA-F0-9]{32}$");

        public static object Scene(string assetPath, bool includeDefaults = false)
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".unity");

            var originalActiveScene = SceneManager.GetActiveScene();
            var scene = EditorSceneManager.NewScene(
                includeDefaults ? NewSceneSetup.DefaultGameObjects : NewSceneSetup.EmptyScene,
                NewSceneMode.Additive);

            try
            {
                EnsureParentDirectory(normalizedPath);
                if (!EditorSceneManager.SaveScene(scene, normalizedPath))
                {
                    throw new InvalidOperationException($"Failed to save scene {normalizedPath}.");
                }

                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedPath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                    { "includeDefaults", includeDefaults }
                };
            }
            finally
            {
                if (scene.IsValid())
                {
                    EditorSceneManager.CloseScene(scene, true);
                }

                if (originalActiveScene.IsValid() && originalActiveScene.isLoaded)
                {
                    SceneManager.SetActiveScene(originalActiveScene);
                }
            }
        }

        public static object PrefabVariant(string sourcePrefabPath, string outputPath, string variantName = "")
        {
            var normalizedSourcePath = NormalizeAssetPath(sourcePrefabPath);
            var normalizedOutputPath = NormalizeAssetPath(outputPath);
            EnsureNewAssetPath(normalizedOutputPath, ".prefab");

            var sourcePrefab = AssetDatabase.LoadAssetAtPath<GameObject>(normalizedSourcePath);
            if (sourcePrefab == null)
            {
                throw new InvalidOperationException($"Could not load prefab at {normalizedSourcePath}.");
            }

            var previewScene = EditorSceneManager.NewPreviewScene();
            GameObject instanceRoot = null;

            try
            {
                instanceRoot = PrefabUtility.InstantiatePrefab(sourcePrefab, previewScene) as GameObject;
                if (instanceRoot == null)
                {
                    throw new InvalidOperationException(
                        $"PrefabUtility.InstantiatePrefab did not return a GameObject for {normalizedSourcePath}.");
                }

                if (!string.IsNullOrWhiteSpace(variantName))
                {
                    instanceRoot.name = variantName;
                }

                EnsureParentDirectory(normalizedOutputPath);
                var savedPrefab = PrefabUtility.SaveAsPrefabAsset(instanceRoot, normalizedOutputPath);
                if (savedPrefab == null)
                {
                    throw new InvalidOperationException($"Failed to save prefab variant at {normalizedOutputPath}.");
                }

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedOutputPath },
                    { "sourcePrefabPath", normalizedSourcePath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedOutputPath) },
                    { "name", savedPrefab.name }
                };
            }
            finally
            {
                if (instanceRoot != null)
                {
                    UnityEngine.Object.DestroyImmediate(instanceRoot);
                }

                if (previewScene.IsValid())
                {
                    EditorSceneManager.ClosePreviewScene(previewScene);
                }
            }
        }

        public static object ScriptableObject(string assetPath, string script, string initialValuesJson = "")
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".asset");

            var targetType = ResolveScriptType(script);
            if (targetType == null)
            {
                throw new InvalidOperationException($"Could not resolve script type \"{script}\".");
            }

            if (!typeof(ScriptableObject).IsAssignableFrom(targetType))
            {
                throw new InvalidOperationException(
                    $"Resolved type \"{targetType.FullName}\" does not derive from ScriptableObject.");
            }

            if (targetType.IsAbstract)
            {
                throw new InvalidOperationException(
                    $"Resolved type \"{targetType.FullName}\" is abstract and cannot be instantiated.");
            }

            var instance = UnityEngine.ScriptableObject.CreateInstance(targetType);
            if (instance == null)
            {
                throw new InvalidOperationException(
                    $"ScriptableObject.CreateInstance returned null for \"{targetType.FullName}\".");
            }

            try
            {
                if (!string.IsNullOrWhiteSpace(initialValuesJson))
                {
                    EditorJsonUtility.FromJsonOverwrite(initialValuesJson, instance);
                }

                EnsureParentDirectory(normalizedPath);
                AssetDatabase.CreateAsset(instance, normalizedPath);
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedPath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                    { "scriptType", targetType.FullName ?? targetType.Name }
                };
            }
            catch
            {
                UnityEngine.Object.DestroyImmediate(instance);
                throw;
            }
        }

        public static object Meta(string scriptPath)
        {
            var absolutePath = NormalizeFilesystemPath(scriptPath);
            if (!File.Exists(absolutePath))
            {
                throw new InvalidOperationException($"Source file not found: {absolutePath}");
            }

            var metaPath = absolutePath + ".meta";
            if (File.Exists(metaPath))
            {
                throw new InvalidOperationException($".meta file already exists: {metaPath}");
            }

            var guid = GenerateGuid();
            var metaContent = "fileFormatVersion: 2\n"
                + $"guid: {guid}\n"
                + "MonoImporter:\n"
                + "  externalObjects: {}\n"
                + "  serializedVersion: 2\n"
                + "  defaultReferences: []\n"
                + "  executionOrder: 0\n"
                + "  icon: {instanceID: 0}\n"
                + "  userData:\n"
                + "  assetBundleName:\n"
                + "  assetBundleVariant:\n";

            File.WriteAllText(metaPath, metaContent);
            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "metaPath", metaPath },
                { "guid", guid }
            };
        }

        public static object Build(string scenePath, int position = -1)
        {
            var normalizedScenePath = NormalizeAssetPath(scenePath);
            if (!normalizedScenePath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Build target must be a .unity scene asset path.");
            }

            if (!File.Exists(ToAbsolutePath(normalizedScenePath)))
            {
                throw new InvalidOperationException($"Scene file not found: {normalizedScenePath}");
            }

            var guid = AssetDatabase.AssetPathToGUID(normalizedScenePath);
            if (string.IsNullOrWhiteSpace(guid))
            {
                throw new InvalidOperationException($"Could not resolve GUID for scene: {normalizedScenePath}");
            }

            var scenes = EditorBuildSettings.scenes.ToList();
            if (scenes.Any(scene => string.Equals(scene.path, normalizedScenePath, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException($"Scene already exists in build settings: {normalizedScenePath}");
            }

            var newEntry = new EditorBuildSettingsScene(normalizedScenePath, true);
            if (position >= 0 && position <= scenes.Count)
            {
                scenes.Insert(position, newEntry);
            }
            else
            {
                scenes.Add(newEntry);
            }

            EditorBuildSettings.scenes = scenes.ToArray();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "scenePath", normalizedScenePath },
                { "buildCount", scenes.Count }
            };
        }

        public static object Material(
            string assetPath,
            string shaderGuid,
            string materialName = "")
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".mat");

            if (!GuidRegex.IsMatch(shaderGuid ?? string.Empty))
            {
                throw new InvalidOperationException("shaderGuid must be a 32-character hex string.");
            }

            var shaderPath = AssetDatabase.GUIDToAssetPath(shaderGuid);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(shaderPath);
            if (shader == null)
            {
                throw new InvalidOperationException($"Could not load shader for GUID {shaderGuid}.");
            }

            var finalName = !string.IsNullOrWhiteSpace(materialName)
                ? materialName
                : Path.GetFileNameWithoutExtension(normalizedPath);

            var material = new Material(shader)
            {
                name = finalName
            };

            try
            {
                EnsureParentDirectory(normalizedPath);
                AssetDatabase.CreateAsset(material, normalizedPath);
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedPath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                    { "name", finalName },
                    { "shaderGuid", shaderGuid }
                };
            }
            catch
            {
                UnityEngine.Object.DestroyImmediate(material);
                throw;
            }
        }

        public static object Package(string name, string version)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Missing required parameter: name");
            }

            if (string.IsNullOrWhiteSpace(version))
            {
                throw new ArgumentException("Missing required parameter: version");
            }

            var manifestPath = Path.Combine(GetProjectRoot(), "Packages", "manifest.json");
            if (!File.Exists(manifestPath))
            {
                throw new InvalidOperationException($"Package manifest not found: {manifestPath}");
            }

            var content = File.ReadAllText(manifestPath);
            if (Regex.IsMatch(content, $"\"{Regex.Escape(name)}\"\\s*:"))
            {
                throw new InvalidOperationException($"Package already exists in manifest: {name}");
            }

            var dependenciesIndex = content.IndexOf("\"dependencies\"", StringComparison.Ordinal);
            if (dependenciesIndex < 0)
            {
                throw new InvalidOperationException("Could not locate the dependencies object in Packages/manifest.json.");
            }

            var openBraceIndex = content.IndexOf('{', dependenciesIndex);
            if (openBraceIndex < 0)
            {
                throw new InvalidOperationException("Malformed Packages/manifest.json: missing dependencies object.");
            }

            var closeBraceIndex = FindMatchingBrace(content, openBraceIndex);
            if (closeBraceIndex <= openBraceIndex)
            {
                throw new InvalidOperationException("Malformed Packages/manifest.json: could not parse dependencies object.");
            }

            var lastEntryIndex = closeBraceIndex - 1;
            while (lastEntryIndex > openBraceIndex && char.IsWhiteSpace(content[lastEntryIndex]))
            {
                lastEntryIndex -= 1;
            }

            string updatedContent;
            if (lastEntryIndex == openBraceIndex)
            {
                updatedContent = content.Insert(
                    closeBraceIndex,
                    $"\n    \"{EscapeJsonString(name)}\": \"{EscapeJsonString(version)}\"\n  ");
            }
            else
            {
                updatedContent = content.Insert(
                    lastEntryIndex + 1,
                    $",\n    \"{EscapeJsonString(name)}\": \"{EscapeJsonString(version)}\"");
            }

            File.WriteAllText(manifestPath, updatedContent);
            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "manifestPath", manifestPath },
                { "name", name },
                { "version", version }
            };
        }

        public static object InputActions(string assetPath, string name)
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".inputactions");

            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Missing required parameter: name");
            }

            EnsureParentDirectory(normalizedPath);
            File.WriteAllText(
                ToAbsolutePath(normalizedPath),
                "{\n"
                + $"  \"name\": \"{EscapeJsonString(name)}\",\n"
                + "  \"maps\": [],\n"
                + "  \"controlSchemes\": []\n"
                + "}\n");

            var guid = GenerateGuid();
            File.WriteAllText(
                ToAbsolutePath(normalizedPath + ".meta"),
                "fileFormatVersion: 2\n"
                + $"guid: {guid}\n"
                + "ScriptedImporter:\n"
                + "  internalIDToNameTable: []\n"
                + "  externalObjects: {}\n"
                + "  serializedVersion: 2\n"
                + "  userData:\n"
                + "  assetBundleName:\n"
                + "  assetBundleVariant:\n"
                + $"  script: {{fileID: 11500000, guid: {InputActionsImporterGuid}, type: 3}}\n"
                + "  generateWrapperCode: 0\n"
                + "  wrapperCodePath:\n"
                + "  wrapperClassName:\n"
                + "  wrapperCodeNamespace:\n");

            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", normalizedPath },
                { "guid", guid },
                { "name", name }
            };
        }

        public static object Animation(string assetPath, string clipName = "", int sampleRate = 60, bool loopTime = false)
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".anim");
            if (sampleRate < 1)
            {
                throw new InvalidOperationException("sampleRate must be >= 1.");
            }

            var finalName = !string.IsNullOrWhiteSpace(clipName)
                ? clipName
                : Path.GetFileNameWithoutExtension(normalizedPath);

            var clip = new AnimationClip
            {
                frameRate = sampleRate,
                name = finalName
            };

            try
            {
                EnsureParentDirectory(normalizedPath);
                AssetDatabase.CreateAsset(clip, normalizedPath);
                AssetDatabase.SaveAssets();

                var savedClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(normalizedPath);
                if (savedClip != null)
                {
                    var serialized = new SerializedObject(savedClip);
                    var loopProperty = serialized.FindProperty("m_AnimationClipSettings.m_LoopTime");
                    if (loopProperty != null)
                    {
                        loopProperty.boolValue = loopTime;
                        serialized.ApplyModifiedPropertiesWithoutUndo();
                    }

                    EditorUtility.SetDirty(savedClip);
                }

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedPath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                    { "name", finalName },
                    { "sampleRate", sampleRate },
                    { "loopTime", loopTime }
                };
            }
            catch
            {
                UnityEngine.Object.DestroyImmediate(clip);
                throw;
            }
        }

        public static object Animator(string assetPath, string controllerName = "", string layerName = "Base Layer")
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".controller");

            EnsureParentDirectory(normalizedPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(normalizedPath);
            if (controller == null)
            {
                throw new InvalidOperationException($"Failed to create AnimatorController at {normalizedPath}.");
            }

            var finalName = !string.IsNullOrWhiteSpace(controllerName)
                ? controllerName
                : Path.GetFileNameWithoutExtension(normalizedPath);
            controller.name = finalName;

            var layers = controller.layers;
            if (layers.Length > 0)
            {
                layers[0].name = string.IsNullOrWhiteSpace(layerName) ? "Base Layer" : layerName;
                controller.layers = layers;
            }

            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", normalizedPath },
                { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                { "name", finalName },
                { "layer", layers.Length > 0 ? layers[0].name : string.Empty }
            };
        }

        public static object Prefab(string assetPath, string name = "")
        {
            var normalizedPath = NormalizeAssetPath(assetPath);
            EnsureNewAssetPath(normalizedPath, ".prefab");

            var finalName = !string.IsNullOrWhiteSpace(name)
                ? name
                : Path.GetFileNameWithoutExtension(normalizedPath);

            var root = new GameObject(finalName);
            try
            {
                EnsureParentDirectory(normalizedPath);
                var savedPrefab = PrefabUtility.SaveAsPrefabAsset(root, normalizedPath);
                if (savedPrefab == null)
                {
                    throw new InvalidOperationException($"Failed to save prefab asset at {normalizedPath}.");
                }

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", normalizedPath },
                    { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                    { "name", finalName }
                };
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }
        }

        public static object GameObject(string assetPath, string name, string parentPath = "")
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Missing required parameter: name");
            }

            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = new GameObject(name);
                var parent = ResolveCreateParent(context, parentPath);
                if (parent != null)
                {
                    gameObject.transform.SetParent(parent.transform, false);
                }

                context.MarkDirty(gameObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectName", gameObject.name },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "gameObjectFileId", MutationUtility.TryGetGlobalObjectIdMemberString(gameObject, "targetObjectId") },
                    { "transformFileId", MutationUtility.TryGetGlobalObjectIdMemberString(gameObject.transform, "targetObjectId") }
                };
            }
        }

        public static object Component(
            string assetPath,
            string gameObjectPath,
            string componentType)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var resolvedType = MutationUtility.ResolveComponentType(componentType);
                var component = gameObject.AddComponent(resolvedType);

                MutationUtility.ApplyPrefabOverridesIfNeeded(component);
                context.MarkDirty(component);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", resolvedType.FullName ?? resolvedType.Name },
                    { "componentFileId", MutationUtility.TryGetGlobalObjectIdMemberString(component, "targetObjectId") }
                };
            }
        }

        public static object ComponentCopy(
            string assetPath,
            string sourceGameObjectPath,
            string sourceComponentType,
            int sourceComponentIndex,
            string targetGameObjectPath)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var sourceObject = MutationUtility.ResolveGameObject(context, sourceGameObjectPath);
                var targetObject = MutationUtility.ResolveGameObject(context, targetGameObjectPath);
                var sourceComponent = MutationUtility.ResolveComponent(
                    sourceObject,
                    sourceComponentType,
                    sourceComponentIndex);

                if (sourceComponent is Transform)
                {
                    throw new InvalidOperationException("Transform components cannot be copied with ComponentCopy.");
                }

                var copiedComponent = targetObject.AddComponent(sourceComponent.GetType());
                EditorUtility.CopySerialized(sourceComponent, copiedComponent);

                MutationUtility.ApplyPrefabOverridesIfNeeded(copiedComponent);
                context.MarkDirty(copiedComponent);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "sourceGameObjectPath", MutationUtility.GetHierarchyPath(sourceObject.transform) },
                    { "targetGameObjectPath", MutationUtility.GetHierarchyPath(targetObject.transform) },
                    { "componentType", sourceComponent.GetType().FullName ?? sourceComponent.GetType().Name },
                    { "componentFileId", MutationUtility.TryGetGlobalObjectIdMemberString(copiedComponent, "targetObjectId") }
                };
            }
        }

        public static object PrefabInstance(
            string assetPath,
            string prefabPath,
            string parentPath = "",
            string instanceName = "",
            float localPosX = 0f,
            float localPosY = 0f,
            float localPosZ = 0f)
        {
            if (string.IsNullOrWhiteSpace(prefabPath))
            {
                throw new ArgumentException("Missing required parameter: prefabPath");
            }

            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (prefab == null)
            {
                throw new InvalidOperationException($"Could not load prefab at {prefabPath}.");
            }

            using (var context = AssetMutationContext.Open(assetPath))
            {
                var destinationScene = context.IsScene ? context.Scene : context.PrefabRoot.scene;
                var instanceObject = PrefabUtility.InstantiatePrefab(prefab, destinationScene) as GameObject;
                if (instanceObject == null)
                {
                    throw new InvalidOperationException($"PrefabUtility.InstantiatePrefab did not return a GameObject for {prefabPath}.");
                }

                var parent = ResolveCreateParent(context, parentPath);
                if (parent != null)
                {
                    instanceObject.transform.SetParent(parent.transform, false);
                }
                else if (context.IsPrefabAsset)
                {
                    instanceObject.transform.SetParent(context.PrefabRoot.transform, false);
                }

                if (!string.IsNullOrWhiteSpace(instanceName))
                {
                    instanceObject.name = instanceName;
                }

                instanceObject.transform.localPosition = new Vector3(localPosX, localPosY, localPosZ);

                MutationUtility.ApplyPrefabOverridesIfNeeded(instanceObject);
                MutationUtility.ApplyPrefabOverridesIfNeeded(instanceObject.transform);
                context.MarkDirty(instanceObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "prefabPath", prefabPath },
                    { "gameObjectName", instanceObject.name },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(instanceObject.transform) },
                    { "gameObjectFileId", MutationUtility.TryGetGlobalObjectIdMemberString(instanceObject, "targetObjectId") },
                    { "transformFileId", MutationUtility.TryGetGlobalObjectIdMemberString(instanceObject.transform, "targetObjectId") },
                    { "prefabInstanceFileId", MutationUtility.TryGetGlobalObjectIdMemberString(instanceObject, "targetPrefabId") }
                };
            }
        }

        private static GameObject ResolveCreateParent(AssetMutationContext context, string parentPath)
        {
            var normalizedParentPath = MutationUtility.NormalizeHierarchyPath(parentPath);
            if (normalizedParentPath == string.Empty)
            {
                if (context.IsPrefabAsset)
                {
                    return context.PrefabRoot;
                }

                return null;
            }

            return MutationUtility.ResolveGameObject(context, normalizedParentPath);
        }

        private static string NormalizeAssetPath(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                throw new ArgumentException("Missing required parameter: assetPath");
            }

            if (Path.IsPathRooted(assetPath))
            {
                var relativePath = FileUtil.GetProjectRelativePath(assetPath);
                if (!string.IsNullOrWhiteSpace(relativePath))
                {
                    return relativePath.Replace('\\', '/');
                }

                throw new InvalidOperationException(
                    $"Path \"{assetPath}\" is not inside the current Unity project.");
            }

            var normalizedPath = assetPath.Replace('\\', '/');
            if (!normalizedPath.StartsWith("Assets/", StringComparison.Ordinal) &&
                !normalizedPath.StartsWith("Packages/", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Path \"{assetPath}\" must be an asset-relative path under Assets/ or Packages/.");
            }

            return normalizedPath;
        }

        private static string NormalizeFilesystemPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Missing required path parameter.");
            }

            if (Path.IsPathRooted(path))
            {
                return path;
            }

            var normalizedAssetPath = NormalizeAssetPath(path);
            return ToAbsolutePath(normalizedAssetPath);
        }

        private static void EnsureNewAssetPath(string assetPath, string expectedExtension)
        {
            if (!assetPath.EndsWith(expectedExtension, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Output path must end with {expectedExtension}.");
            }

            if (File.Exists(ToAbsolutePath(assetPath)) || File.Exists(ToAbsolutePath(assetPath + ".meta")))
            {
                throw new InvalidOperationException(
                    $"Asset already exists at {assetPath}. Delete it first or choose a different path.");
            }
        }

        private static void EnsureParentDirectory(string assetPath)
        {
            var directory = Path.GetDirectoryName(ToAbsolutePath(assetPath));
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }

        private static string ToAbsolutePath(string assetPath)
        {
            return Path.Combine(GetProjectRoot(), assetPath);
        }

        private static string GetProjectRoot()
        {
            var assetsDirectory = Directory.GetParent(Application.dataPath);
            if (assetsDirectory == null)
            {
                throw new InvalidOperationException("Could not determine the Unity project root.");
            }

            return assetsDirectory.FullName;
        }

        private static Type ResolveScriptType(string script)
        {
            if (string.IsNullOrWhiteSpace(script))
            {
                return null;
            }

            if (GuidRegex.IsMatch(script))
            {
                var scriptAssetPath = AssetDatabase.GUIDToAssetPath(script);
                if (!string.IsNullOrWhiteSpace(scriptAssetPath))
                {
                    var monoScript = AssetDatabase.LoadAssetAtPath<MonoScript>(scriptAssetPath);
                    return monoScript != null ? monoScript.GetClass() : null;
                }
            }

            if (script.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) ||
                script.StartsWith("Assets/", StringComparison.Ordinal) ||
                script.StartsWith("Packages/", StringComparison.Ordinal))
            {
                var scriptAssetPath = NormalizeAssetPath(script);
                var monoScript = AssetDatabase.LoadAssetAtPath<MonoScript>(scriptAssetPath);
                return monoScript != null ? monoScript.GetClass() : null;
            }

            return MutationUtility.ResolveType(script);
        }

        private static string GenerateGuid()
        {
            return Guid.NewGuid().ToString("N");
        }

        private static int FindMatchingBrace(string content, int startIndex)
        {
            var depth = 0;
            var inString = false;
            for (var index = startIndex; index < content.Length; index += 1)
            {
                var character = content[index];
                if (inString)
                {
                    if (character == '\\')
                    {
                        index += 1;
                        continue;
                    }

                    if (character == '"')
                    {
                        inString = false;
                    }

                    continue;
                }

                if (character == '"')
                {
                    inString = true;
                    continue;
                }

                if (character == '{')
                {
                    depth += 1;
                    continue;
                }

                if (character == '}')
                {
                    depth -= 1;
                    if (depth == 0)
                    {
                        return index;
                    }
                }
            }

            return -1;
        }

        private static string EscapeJsonString(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"");
        }
    }
}
