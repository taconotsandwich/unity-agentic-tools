using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public class SelectionHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.selection.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "get":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        var objects = Selection.objects;
                        var items = new List<object>();
                        foreach (var obj in objects)
                        {
                            var item = new Dictionary<string, object>
                            {
                                { "name", obj.name },
                                { "instanceId", obj.GetInstanceID() },
                                { "type", obj.GetType().Name }
                            };

                            if (obj is GameObject go)
                            {
                                item["activeSelf"] = go.activeSelf;
                                item["tag"] = go.tag;
                                item["layer"] = go.layer;
                            }

                            items.Add(item);
                        }

                        return new Dictionary<string, object>
                        {
                            { "count", items.Count },
                            { "objects", items.ToArray() }
                        };
                    });

                case "set":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        if (!parameters.TryGetValue("instanceIds", out var idsObj))
                        {
                            throw new ArgumentException("Missing required parameter: instanceIds");
                        }

                        var ids = ParseIntArray(idsObj);
                        var objects = new List<UnityEngine.Object>();

                        foreach (var id in ids)
                        {
                            var obj = EditorUtility.InstanceIDToObject(id);
                            if (obj != null) objects.Add(obj);
                        }

                        Selection.objects = objects.ToArray();
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "selectedCount", Selection.objects.Length }
                        };
                    });

                case "clear":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        Selection.objects = new UnityEngine.Object[0];
                        return new Dictionary<string, object>
                        {
                            { "success", true }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown selection action: {action}");
            }
        }

        private static int[] ParseIntArray(object value)
        {
            if (value is string s)
            {
                return s.Split(',')
                    .Select(x => x.Trim())
                    .Where(x => !string.IsNullOrEmpty(x))
                    .Select(x => int.Parse(x))
                    .ToArray();
            }
            if (value is IEnumerable<object> arr)
            {
                return arr.Select(x => Convert.ToInt32(x)).ToArray();
            }
            return new int[0];
        }
    }
}
