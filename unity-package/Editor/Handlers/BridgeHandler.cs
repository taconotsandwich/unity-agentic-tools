using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public class BridgeHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.bridge.";

        public Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "getInfo":
                    return EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        var projectPath = Path.GetDirectoryName(Application.dataPath) ?? string.Empty;
                        return (object)new Dictionary<string, object>
                        {
                            { "port", EditorWebSocketServer.Port },
                            { "pid", Process.GetCurrentProcess().Id },
                            { "version", "0.1.0" },
                            { "project_path", projectPath },
                            { "project_name", Path.GetFileName(projectPath) ?? string.Empty },
                            { "unity_version", Application.unityVersion }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown bridge action: {action}");
            }
        }
    }
}
