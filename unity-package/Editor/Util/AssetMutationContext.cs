using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityScene = UnityEngine.SceneManagement.Scene;
using UnitySceneManager = UnityEngine.SceneManagement.SceneManager;

namespace UnityAgenticTools.Util
{
    internal sealed class AssetMutationContext : IDisposable
    {
        private readonly UnityScene _originalActiveScene;
        private readonly bool _openedSceneTemporarily;
        private readonly bool _loadedPrefabContents;

        public string AssetPath { get; private set; }
        public bool IsScene { get; private set; }
        public bool IsPrefabAsset { get; private set; }
        public UnityScene Scene { get; private set; }
        public GameObject PrefabRoot { get; private set; }

        private AssetMutationContext(
            string assetPath,
            UnityScene scene,
            GameObject prefabRoot,
            bool openedSceneTemporarily,
            bool loadedPrefabContents,
            UnityScene originalActiveScene)
        {
            AssetPath = assetPath;
            Scene = scene;
            PrefabRoot = prefabRoot;
            _openedSceneTemporarily = openedSceneTemporarily;
            _loadedPrefabContents = loadedPrefabContents;
            _originalActiveScene = originalActiveScene;
            IsScene = scene.IsValid();
            IsPrefabAsset = prefabRoot != null;
        }

        public static AssetMutationContext Open(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                throw new ArgumentException("Missing required parameter: assetPath");
            }

            if (AssetDatabase.LoadMainAssetAtPath(assetPath) == null)
            {
                throw new InvalidOperationException($"Asset not found at {assetPath}.");
            }

            var originalActiveScene = UnitySceneManager.GetActiveScene();

            if (assetPath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
            {
                var targetScene = UnitySceneManager.GetSceneByPath(assetPath);
                var openedTemporarily = false;
                if (!targetScene.IsValid() || !targetScene.isLoaded)
                {
                    targetScene = EditorSceneManager.OpenScene(assetPath, OpenSceneMode.Additive);
                    openedTemporarily = true;
                }

                return new AssetMutationContext(
                    assetPath,
                    targetScene,
                    null,
                    openedTemporarily,
                    false,
                    originalActiveScene);
            }

            if (assetPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
            {
                var prefabRoot = PrefabUtility.LoadPrefabContents(assetPath);
                if (prefabRoot == null)
                {
                    throw new InvalidOperationException($"Failed to load prefab contents for {assetPath}.");
                }

                return new AssetMutationContext(
                    assetPath,
                    default(UnityScene),
                    prefabRoot,
                    false,
                    true,
                    originalActiveScene);
            }

            throw new InvalidOperationException(
                $"Unsupported mutation target \"{assetPath}\". Only .unity scenes and .prefab assets are supported.");
        }

        public IEnumerable<GameObject> GetRootGameObjects()
        {
            if (IsScene)
            {
                return Scene.GetRootGameObjects();
            }

            if (PrefabRoot != null)
            {
                return new[] { PrefabRoot };
            }

            return Array.Empty<GameObject>();
        }

        public void MarkDirty(UnityEngine.Object changedObject = null)
        {
            if (changedObject != null)
            {
                EditorUtility.SetDirty(changedObject);

                var component = changedObject as Component;
                if (component != null)
                {
                    EditorUtility.SetDirty(component.gameObject);
                }
            }

            if (IsScene)
            {
                EditorSceneManager.MarkSceneDirty(Scene);
            }
        }

        public void Save()
        {
            if (IsScene)
            {
                EditorSceneManager.MarkSceneDirty(Scene);
                if (!EditorSceneManager.SaveScene(Scene))
                {
                    throw new InvalidOperationException($"Failed to save scene {AssetPath}.");
                }

                return;
            }

            if (IsPrefabAsset)
            {
                var savedPrefab = PrefabUtility.SaveAsPrefabAsset(PrefabRoot, AssetPath);
                if (savedPrefab == null)
                {
                    throw new InvalidOperationException($"Failed to save prefab asset {AssetPath}.");
                }

                AssetDatabase.SaveAssets();
            }
        }

        public void Dispose()
        {
            if (_loadedPrefabContents && PrefabRoot != null)
            {
                PrefabUtility.UnloadPrefabContents(PrefabRoot);
                PrefabRoot = null;
            }

            if (_openedSceneTemporarily && Scene.IsValid())
            {
                if (_originalActiveScene.IsValid() && _originalActiveScene.isLoaded)
                {
                    UnitySceneManager.SetActiveScene(_originalActiveScene);
                }

                EditorSceneManager.CloseScene(Scene, true);
            }
        }
    }
}
