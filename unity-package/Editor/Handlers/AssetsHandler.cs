using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;

namespace UnityAgenticTools.Server
{
    public class AssetsHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.assets.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "refresh":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        AssetDatabase.Refresh();
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "message", "AssetDatabase refreshed" }
                        };
                    });

                case "getStatus":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        return new Dictionary<string, object>
                        {
                            { "isCompiling", EditorApplication.isCompiling },
                            { "isUpdating", EditorApplication.isUpdating },
                            { "isPlaying", EditorApplication.isPlaying },
                            { "isPaused", EditorApplication.isPaused },
                            { "timeSinceStartup", EditorApplication.timeSinceStartup }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown assets action: {action}");
            }
        }
    }
}
