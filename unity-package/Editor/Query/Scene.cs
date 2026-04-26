using System;
using System.Collections.Generic;
using UnityAgenticTools.Util;
using UnityEngine;
using UnitySceneManager = UnityEngine.SceneManagement.SceneManager;

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

            using (var context = AssetMutationContext.Open(assetPath))
            {
                var roots = new List<object>();
                foreach (var root in context.GetRootGameObjects())
                {
                    AddGameObject(roots, root, 0, maxDepth, includeInactive);
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
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                return DescribeGameObject(gameObject, 0);
            }
        }

        private static void AddGameObject(List<object> output, GameObject gameObject, int depth, int maxDepth, bool includeInactive)
        {
            if (gameObject == null || (!includeInactive && !gameObject.activeInHierarchy))
            {
                return;
            }

            output.Add(DescribeGameObject(gameObject, depth));

            if (depth >= maxDepth)
            {
                return;
            }

            for (var index = 0; index < gameObject.transform.childCount; index += 1)
            {
                AddGameObject(output, gameObject.transform.GetChild(index).gameObject, depth + 1, maxDepth, includeInactive);
            }
        }

        private static Dictionary<string, object> DescribeGameObject(GameObject gameObject, int depth)
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
                    { "type", component.GetType().FullName },
                    { "name", component.GetType().Name }
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
                { "scene", gameObject.scene.IsValid() ? gameObject.scene.path : UnitySceneManager.GetActiveScene().path },
                { "components", components.ToArray() }
            };
        }
    }
}
