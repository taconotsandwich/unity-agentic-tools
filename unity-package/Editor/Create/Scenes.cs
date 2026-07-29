using System;
using System.Collections.Generic;
using UnityEditor;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Create
{
    public static class Scenes
    {
        /// <summary>
        /// Editor/Templates/EmptyScene.unity. Resolved by guid rather than path
        /// so it is found whether the package is UPM-installed, embedded, or
        /// dropped straight into Assets/.
        /// </summary>
        private const string EmptySceneTemplateGuid = "0cdf943ee52643c5bacf32aa5f21fccc";

        /// <summary>
        /// Copies the shipped empty-scene template rather than calling
        /// EditorSceneManager.NewScene.
        ///
        /// NewScene(..., Additive) is refused outright while any open scene has
        /// never been saved -- which is what every fresh editor and every
        /// batchmode run starts with -- so building the scene that way made
        /// create.scene fail for reasons that had nothing to do with its
        /// argument. CopyAsset works in every editor state and leaves the open
        /// scenes untouched. NewPreviewScene is not an alternative: SaveScene
        /// activates the scene internally and throws on a preview one.
        ///
        /// The defaults are added afterwards through the normal mutation path so
        /// the running editor serializes the Camera and Light, rather than
        /// shipping them frozen at whatever version authored the template.
        /// </summary>
        public static object Scene(string assetPath, bool includeDefaults = false)
        {
            var normalizedPath = CreateUtility.NormalizeAssetPath(assetPath);
            CreateUtility.EnsureNewAssetPath(normalizedPath, ".unity");
            CreateUtility.EnsureParentDirectory(normalizedPath);

            var templatePath = AssetDatabase.GUIDToAssetPath(EmptySceneTemplateGuid);
            if (string.IsNullOrEmpty(templatePath))
            {
                throw new InvalidOperationException(
                    $"The empty-scene template (guid {EmptySceneTemplateGuid}) is not in this project. "
                    + "Reinstall the bridge package -- Editor/Templates/EmptyScene.unity is part of it.");
            }

            if (!AssetDatabase.CopyAsset(templatePath, normalizedPath))
            {
                throw new InvalidOperationException(
                    $"Failed to copy the scene template to {normalizedPath}.");
            }

            AssetDatabase.Refresh();

            if (includeDefaults)
            {
                AddDefaultSceneObjects(normalizedPath);
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", normalizedPath },
                { "guid", AssetDatabase.AssetPathToGUID(normalizedPath) },
                { "includeDefaults", includeDefaults }
            };
        }

        /// <summary>
        /// What NewSceneSetup.DefaultGameObjects produces: a main camera and a
        /// directional light, at Unity's own default transforms.
        /// </summary>
        private static void AddDefaultSceneObjects(string scenePath)
        {
            using (var context = AssetMutationContext.Open(scenePath))
            {
                var camera = SceneObjects.Create("Main Camera", context.ObjectScene);
                camera.tag = "MainCamera";
                camera.transform.position = new Vector3(0f, 1f, -10f);
                camera.AddComponent<Camera>();
                camera.AddComponent<AudioListener>();

                var light = SceneObjects.Create("Directional Light", context.ObjectScene);
                light.transform.position = new Vector3(0f, 3f, 0f);
                light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
                light.AddComponent<Light>().type = LightType.Directional;

                context.MarkDirty(camera);
                context.MarkDirty(light);
                context.Save();
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
                var gameObject = SceneObjects.Create(name, context.ObjectScene);
                var parent = CreateUtility.ResolveCreateParent(context, parentPath);
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

        public static object Component(string assetPath, string gameObjectPath, string componentType)
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
    }
}
