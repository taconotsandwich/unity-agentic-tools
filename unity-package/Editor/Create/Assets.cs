using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Animations;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Create
{
    public static class Assets
    {
        private const string InputActionsImporterGuid = "8404be70184654265930450def6a9037";

        private static readonly Regex GuidRegex = new Regex("^[a-fA-F0-9]{32}$");

        public static object ScriptableObject(string assetPath, string script, string initialValuesJson = "")
        {
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".asset");

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

                CreateUtility.EnsureParentDirectory(normalizedPath);
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
            var absolutePath = CreateUtility.NormalizeFilesystemPath(scriptPath);
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

        public static object Material(string assetPath, string shaderGuid, string materialName = "")
        {
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".mat");

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
                CreateUtility.EnsureParentDirectory(normalizedPath);
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

        public static object InputActions(string assetPath, string name)
        {
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".inputactions");

            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Missing required parameter: name");
            }

            CreateUtility.EnsureParentDirectory(normalizedPath);
            File.WriteAllText(
                CreateUtility.ToAbsolutePath(normalizedPath),
                "{\n"
                + $"  \"name\": \"{CreateUtility.EscapeJsonString(name)}\",\n"
                + "  \"maps\": [],\n"
                + "  \"controlSchemes\": []\n"
                + "}\n");

            var guid = GenerateGuid();
            File.WriteAllText(
                CreateUtility.ToAbsolutePath(normalizedPath + ".meta"),
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
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".anim");
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
                CreateUtility.EnsureParentDirectory(normalizedPath);
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
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".controller");

            CreateUtility.EnsureParentDirectory(normalizedPath);
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
                var scriptAssetPath = CreateUtility.NormalizeAssetPath(script);
                var monoScript = AssetDatabase.LoadAssetAtPath<MonoScript>(scriptAssetPath);
                return monoScript != null ? monoScript.GetClass() : null;
            }

            return MutationUtility.ResolveType(script);
        }

        private static string GenerateGuid()
        {
            return Guid.NewGuid().ToString("N");
        }
    }
}
