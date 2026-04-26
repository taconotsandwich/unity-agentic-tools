using System;
using System.Collections.Generic;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Delete
{
    public static class Objects
    {
        public static object GameObject(string assetPath, string gameObjectPath)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                if (context.IsPrefabAsset && gameObject == context.PrefabRoot)
                {
                    throw new InvalidOperationException("Cannot delete the root GameObject of a prefab asset. Delete the asset instead.");
                }

                var deletedPath = MutationUtility.GetHierarchyPath(gameObject.transform);
                UnityEngine.Object.DestroyImmediate(gameObject);
                context.MarkDirty();
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", deletedPath }
                };
            }
        }

        public static object Component(string assetPath, string gameObjectPath, string componentType, int componentIndex = 0)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var component = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                if (component is Transform)
                {
                    throw new InvalidOperationException("Cannot delete a Transform component.");
                }

                var resolvedType = component.GetType().FullName;
                UnityEngine.Object.DestroyImmediate(component);
                context.MarkDirty(gameObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", resolvedType },
                    { "componentIndex", componentIndex }
                };
            }
        }
    }
}
