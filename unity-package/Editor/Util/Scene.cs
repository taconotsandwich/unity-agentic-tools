using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnitySceneManager = UnityEngine.SceneManagement.SceneManager;

namespace UnityAgenticTools.Util
{
    public static class Scene
    {
        public static object Save()
        {
            var saved = EditorSceneManager.SaveOpenScenes();
            if (saved)
            {
                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "message", "All open scenes saved" }
                };
            }

            var details = new StringBuilder("Failed to save scenes.");
            for (int i = 0; i < UnitySceneManager.sceneCount; i++)
            {
                var scene = UnitySceneManager.GetSceneAt(i);
                var scenePath = string.IsNullOrEmpty(scene.path) ? "(unsaved)" : scene.path;
                details.Append($" [{scene.name}: path={scenePath}, dirty={scene.isDirty}, loaded={scene.isLoaded}]");
            }
            throw new InvalidOperationException(details.ToString());
        }

        public static object Open(string scenePath, bool additive = false)
        {
            if (string.IsNullOrEmpty(scenePath))
            {
                throw new ArgumentException("Missing required parameter: scenePath");
            }

            var mode = additive ? OpenSceneMode.Additive : OpenSceneMode.Single;
            var scene = EditorSceneManager.OpenScene(scenePath, mode);
            
            return new Dictionary<string, object>
            {
                { "success", scene.IsValid() },
                { "name", scene.name },
                { "path", scene.path },
                { "buildIndex", scene.buildIndex }
            };
        }

    }
}
