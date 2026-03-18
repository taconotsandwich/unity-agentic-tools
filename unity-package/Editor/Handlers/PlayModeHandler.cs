using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;

namespace UnityAgenticTools.Server
{
    public class PlayModeHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.playMode.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "enter":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        EditorApplication.isPlaying = true;
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "state", "Playing" }
                        };
                    });

                case "exit":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        EditorApplication.isPlaying = false;
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "state", "Stopped" }
                        };
                    });

                case "pause":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        EditorApplication.isPaused = !EditorApplication.isPaused;
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "paused", EditorApplication.isPaused },
                            { "state", GetStateString() }
                        };
                    });

                case "step":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        EditorApplication.Step();
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "state", GetStateString() }
                        };
                    });

                case "getState":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        return new Dictionary<string, object>
                        {
                            { "state", GetStateString() },
                            { "isPlaying", EditorApplication.isPlaying },
                            { "isPaused", EditorApplication.isPaused },
                            { "isCompiling", EditorApplication.isCompiling }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown play mode action: {action}");
            }
        }

        private static string GetStateString()
        {
            if (!EditorApplication.isPlaying) return "Stopped";
            if (EditorApplication.isPaused) return "Paused";
            return "Playing";
        }
    }
}
