using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Experimental.SceneManagement;
using UnityEngine.SceneManagement;

namespace UnityAgenticTools.Server
{
    public class SceneHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.scene.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "save":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
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
                        for (int i = 0; i < SceneManager.sceneCount; i++)
                        {
                            var scene = SceneManager.GetSceneAt(i);
                            var scenePath = string.IsNullOrEmpty(scene.path) ? "(unsaved)" : scene.path;
                            details.Append($" [{scene.name}: path={scenePath}, dirty={scene.isDirty}, loaded={scene.isLoaded}]");
                        }
                        throw new InvalidOperationException(details.ToString());
                    });

                case "open":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        if (!parameters.TryGetValue("path", out var pathObj) || !(pathObj is string scenePath))
                        {
                            throw new ArgumentException("Missing required parameter: path");
                        }

                        var additive = false;
                        if (parameters.TryGetValue("additive", out var additiveObj))
                        {
                            additive = additiveObj is bool b ? b : false;
                        }

                        var mode = additive
                            ? OpenSceneMode.Additive
                            : OpenSceneMode.Single;

                        var scene = EditorSceneManager.OpenScene(scenePath, mode);
                        return new Dictionary<string, object>
                        {
                            { "success", scene.IsValid() },
                            { "name", scene.name },
                            { "path", scene.path },
                            { "buildIndex", scene.buildIndex }
                        };
                    });

                case "loaded":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        var loadedScenePaths = new List<string>();
                        string activeScenePath = string.Empty;
                        string prefabStagePath = string.Empty;

                        var activeScene = SceneManager.GetActiveScene();
                        if (activeScene.IsValid() && !string.IsNullOrEmpty(activeScene.path))
                        {
                            activeScenePath = activeScene.path;
                        }

                        for (int i = 0; i < SceneManager.sceneCount; i++)
                        {
                            var scene = SceneManager.GetSceneAt(i);
                            if (scene.isLoaded && !string.IsNullOrEmpty(scene.path))
                            {
                                loadedScenePaths.Add(scene.path);
                            }
                        }

                        var stage = PrefabStageUtility.GetCurrentPrefabStage();
                        if (stage != null && !string.IsNullOrEmpty(stage.assetPath))
                        {
                            prefabStagePath = stage.assetPath;
                        }

                        return new Dictionary<string, object>
                        {
                            { "loaded_scene_paths", loadedScenePaths.ToArray() },
                            { "active_scene_path", activeScenePath },
                            { "prefab_stage_path", prefabStagePath },
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown scene action: {action}");
            }
        }
    }
}
