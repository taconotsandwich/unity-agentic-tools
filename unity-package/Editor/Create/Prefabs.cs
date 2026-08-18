using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Create
{
    public static class Prefabs
    {
        public static object Prefab(string assetPath, string name = "")
        {
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".prefab");

            var finalName = !string.IsNullOrWhiteSpace(name)
                ? name
                : Path.GetFileNameWithoutExtension(normalizedPath);

            // The root is built in a preview scene for the same reason
            // PrefabVariant builds its instance in one: a bare new GameObject(name)
            // lands in whichever scene the user has open and leaves it dirty,
            // which is not something creating an asset should do to them.
            var previewScene = EditorSceneManager.NewPreviewScene();
            GameObject root = null;

            try
            {
                root = SceneObjects.Create(finalName, previewScene);

                CreateUtility.EnsureParentDirectory(normalizedPath);
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
                    // What Unity wrote, not what was asked for: SaveAsPrefabAsset
                    // names the root after the file, so reporting the requested
                    // name hands back a hierarchy path that will not resolve.
                    { "name", savedPrefab.name }
                };
            }
            finally
            {
                if (root != null)
                {
                    UnityEngine.Object.DestroyImmediate(root);
                }

                if (previewScene.IsValid())
                {
                    EditorSceneManager.ClosePreviewScene(previewScene);
                }
            }
        }

        public static object PrefabVariant(string sourcePrefabPath, string outputPath, string variantName = "")
        {
            var normalizedSourcePath = CreateUtility.NormalizeAssetPath(sourcePrefabPath);
            var normalizedOutputPath = CreateUtility.NormalizeAssetPath(outputPath);
            CreateUtility.EnsureNewAssetPath(normalizedOutputPath, ".prefab");

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

                CreateUtility.EnsureParentDirectory(normalizedOutputPath);
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
                var instanceObject = PrefabUtility.InstantiatePrefab(prefab, context.ObjectScene) as GameObject;
                if (instanceObject == null)
                {
                    throw new InvalidOperationException($"PrefabUtility.InstantiatePrefab did not return a GameObject for {prefabPath}.");
                }

                var parent = CreateUtility.ResolveCreateParent(context, parentPath);
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
    }
}
