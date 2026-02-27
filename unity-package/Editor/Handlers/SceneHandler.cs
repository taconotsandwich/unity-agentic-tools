using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.SceneManagement;
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
                        return new Dictionary<string, object>
                        {
                            { "success", saved },
                            { "message", saved ? "All open scenes saved" : "Failed to save scenes" }
                        };
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

                case "getActive":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        var scene = SceneManager.GetActiveScene();
                        return new Dictionary<string, object>
                        {
                            { "name", scene.name },
                            { "path", scene.path },
                            { "buildIndex", scene.buildIndex },
                            { "isDirty", scene.isDirty },
                            { "rootCount", scene.rootCount },
                            { "isLoaded", scene.isLoaded }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown scene action: {action}");
            }
        }
    }
}
