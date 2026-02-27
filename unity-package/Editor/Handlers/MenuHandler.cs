using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;

namespace UnityAgenticTools.Server
{
    public class MenuHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.menu.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "execute":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        if (!parameters.TryGetValue("path", out var pathObj) || !(pathObj is string menuPath))
                        {
                            throw new ArgumentException("Missing required parameter: path");
                        }

                        var result = EditorApplication.ExecuteMenuItem(menuPath);
                        return new Dictionary<string, object>
                        {
                            { "success", result },
                            { "menuPath", menuPath },
                            { "message", result ? "Menu item executed" : $"Menu item not found: {menuPath}" }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown menu action: {action}");
            }
        }
    }
}
