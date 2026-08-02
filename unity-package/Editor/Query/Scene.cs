using System;
using System.Collections.Generic;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Query
{
    public static class Scene
    {
        public static object Hierarchy(string assetPath = "", int maxDepth = 99, bool includeInactive = false)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                return Util.Hierarchy.Snapshot(maxDepth, includeInactive);
            }

            using (var context = AssetMutationContext.Open(assetPath, forMutation: false))
            {
                var roots = new List<object>();
                foreach (var root in context.GetRootGameObjects())
                {
                    AddGameObject(roots, root, 0, maxDepth, includeInactive, context.AssetPath);
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "roots", roots.ToArray() }
                };
            }
        }

        public static object Object(string assetPath, string gameObjectPath)
        {
            using (var context = AssetMutationContext.Open(assetPath, forMutation: false))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                return DescribeGameObject(gameObject, 0, context.AssetPath);
            }
        }

        private static void AddGameObject(List<object> output, GameObject gameObject, int depth, int maxDepth, bool includeInactive, string assetPath)
        {
            if (gameObject == null || (!includeInactive && !gameObject.activeInHierarchy))
            {
                return;
            }

            output.Add(DescribeGameObject(gameObject, depth, assetPath));

            if (depth >= maxDepth)
            {
                return;
            }

            for (var index = 0; index < gameObject.transform.childCount; index += 1)
            {
                AddGameObject(output, gameObject.transform.GetChild(index).gameObject, depth + 1, maxDepth, includeInactive, assetPath);
            }
        }

        /// <summary>
        /// A GameObject loaded out of a prefab has no scene, and the fallback used
        /// to be the active scene's path -- naming a scene the object is not in
        /// and never was. The asset the caller asked about is the honest answer.
        /// </summary>
        private static Dictionary<string, object> DescribeGameObject(GameObject gameObject, int depth, string assetPath)
        {
            var components = new List<object>();
            foreach (var component in gameObject.GetComponents<Component>())
            {
                if (component == null)
                {
                    continue;
                }

                components.Add(new Dictionary<string, object>
                {
                    { "type", component.GetType().FullName }
                });
            }

            return new Dictionary<string, object>
            {
                { "name", gameObject.name },
                { "path", MutationUtility.GetHierarchyPath(gameObject.transform) },
                { "active", gameObject.activeSelf },
                { "activeInHierarchy", gameObject.activeInHierarchy },
                { "tag", gameObject.tag },
                { "layer", gameObject.layer },
                { "depth", depth },
                { "scene", gameObject.scene.IsValid() ? gameObject.scene.path : assetPath },
                { "components", components.ToArray() }
            };
        }
    }
}
