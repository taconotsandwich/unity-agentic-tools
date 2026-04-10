using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public static class MessageDispatcher
    {
        private static readonly Dictionary<string, IRequestHandler> _handlers =
            new Dictionary<string, IRequestHandler>();

        private static bool _initialized;

        static MessageDispatcher()
        {
            Initialize();
        }

        public static void Initialize()
        {
            if (_initialized) return;

            _handlers.Clear();

            var handlerType = typeof(IRequestHandler);
            var types = AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(a =>
                {
                    try { return a.GetTypes(); }
                    catch { return Type.EmptyTypes; }
                })
                .Where(t => handlerType.IsAssignableFrom(t) && !t.IsInterface && !t.IsAbstract);

            foreach (var type in types)
            {
                try
                {
                    var handler = (IRequestHandler)Activator.CreateInstance(type);
                    _handlers[handler.MethodPrefix] = handler;
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityAgenticTools] Failed to create handler {type.Name}: {ex.Message}");
                }
            }

            _initialized = true;
        }

        public static async Task<string> Dispatch(string message)
        {
            string id = null;
            try
            {
                var request = JsonRpcParser.ParseRequest(message);
                id = request.Id;

                if (string.IsNullOrEmpty(request.Method))
                {
                    return JsonRpcParser.BuildError(id, -32600, "Invalid Request: missing method");
                }

                var handler = FindHandler(request.Method);
                if (handler == null)
                {
                    return JsonRpcParser.BuildError(id, -32601, $"Method not found: {request.Method}");
                }

                var result = await handler.HandleAsync(request.Method, request.Params);
                return JsonRpcParser.BuildResult(id, result);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UnityAgenticTools] Dispatch error: {ex}");
                return JsonRpcParser.BuildError(id ?? "0", -32603, ex.Message);
            }
        }

        private static IRequestHandler FindHandler(string method)
        {
            foreach (var kvp in _handlers)
            {
                if (method.StartsWith(kvp.Key))
                {
                    return kvp.Value;
                }
            }
            return null;
        }

        public static void Reset()
        {
            _initialized = false;
            _handlers.Clear();
            Initialize();
        }
    }

    public struct JsonRpcRequest
    {
        public string Id;
        public string Method;
        public Dictionary<string, object> Params;
    }

    public static class JsonRpcParser
    {
        public static JsonRpcRequest ParseRequest(string json)
        {
            var request = new JsonRpcRequest();
            request.Params = new Dictionary<string, object>();

            request.Id = ExtractStringField(json, "id") ?? "0";
            request.Method = ExtractStringField(json, "method");

            var paramsStart = json.IndexOf("\"params\"", StringComparison.Ordinal);
            if (paramsStart >= 0)
            {
                var colonPos = json.IndexOf(':', paramsStart + 8);
                if (colonPos >= 0)
                {
                    var braceStart = json.IndexOf('{', colonPos);
                    if (braceStart >= 0)
                    {
                        var braceEnd = FindMatchingBrace(json, braceStart);
                        if (braceEnd >= 0)
                        {
                            var paramsJson = json.Substring(braceStart, braceEnd - braceStart + 1);
                            request.Params = ParseFlatObject(paramsJson);
                        }
                    }
                }
            }

            return request;
        }

        public static string BuildResult(string id, object result)
        {
            var resultJson = SerializeValue(result);
            return $"{{\"jsonrpc\":\"2.0\",\"id\":\"{EscapeString(id)}\",\"result\":{resultJson}}}";
        }

        public static string BuildError(string id, int code, string message)
        {
            return $"{{\"jsonrpc\":\"2.0\",\"id\":\"{EscapeString(id)}\",\"error\":{{\"code\":{code},\"message\":\"{EscapeString(message)}\"}}}}";
        }

        public static string BuildNotification(string method, object data)
        {
            var paramsJson = SerializeValue(data);
            return $"{{\"jsonrpc\":\"2.0\",\"method\":\"{EscapeString(method)}\",\"params\":{paramsJson}}}";
        }

        private static string ExtractStringField(string json, string field)
        {
            var target = $"\"{field}\"";
            int idx = json.IndexOf(target, StringComparison.Ordinal);
            if (idx < 0) return null;
            int pos = idx + target.Length;
            // skip whitespace and colon
            while (pos < json.Length && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == ':')) pos++;
            if (pos >= json.Length) return null;
            if (json[pos] == '"') return ReadJsonString(json, ref pos);
            // numeric fallback
            int start = pos;
            while (pos < json.Length && json[pos] >= '0' && json[pos] <= '9') pos++;
            return pos > start ? json.Substring(start, pos - start) : null;
        }

        private static Dictionary<string, object> ParseFlatObject(string json)
        {
            var result = new Dictionary<string, object>();
            int i = 0;
            int len = json.Length;

            while (i < len && json[i] != '{') i++;
            if (i >= len) return result;
            i++;

            while (i < len)
            {
                // skip to key or closing brace
                while (i < len && json[i] != '"' && json[i] != '}') i++;
                if (i >= len || json[i] == '}') break;

                string key = ReadJsonString(json, ref i);

                // skip to colon
                while (i < len && json[i] != ':') i++;
                if (i >= len) break;
                i++;

                // skip whitespace
                while (i < len && (json[i] == ' ' || json[i] == '\t' || json[i] == '\n' || json[i] == '\r')) i++;
                if (i >= len) break;

                char c = json[i];
                if (c == '"')
                {
                    result[key] = ReadJsonString(json, ref i);
                }
                else if (c == '{')
                {
                    int end = FindMatchingBrace(json, i);
                    result[key] = end > i ? json.Substring(i, end - i + 1) : "{}";
                    i = end + 1;
                }
                else if (c == '[')
                {
                    int end = FindMatchingBracket(json, i);
                    result[key] = end > i ? json.Substring(i, end - i + 1) : "[]";
                    i = end + 1;
                }
                else
                {
                    int start = i;
                    while (i < len && json[i] != ',' && json[i] != '}' && json[i] != '\n') i++;
                    var raw = json.Substring(start, i - start).Trim();
                    if (raw == "true") result[key] = true;
                    else if (raw == "false") result[key] = false;
                    else if (raw == "null") result[key] = null;
                    else if (raw.Contains(".") && double.TryParse(raw,
                        System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var d))
                        result[key] = d;
                    else if (int.TryParse(raw, out var n)) result[key] = n;
                    else result[key] = raw;
                }

                // skip comma
                while (i < len && json[i] != ',' && json[i] != '}') i++;
                if (i < len && json[i] == ',') i++;
            }
            return result;
        }

        private static string ReadJsonString(string json, ref int i)
        {
            if (i >= json.Length || json[i] != '"') return "";
            i++;
            var sb = new System.Text.StringBuilder();
            while (i < json.Length)
            {
                char c = json[i++];
                if (c == '"') break;
                if (c == '\\' && i < json.Length)
                {
                    char esc = json[i++];
                    switch (esc)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 <= json.Length && int.TryParse(
                                json.Substring(i, 4),
                                System.Globalization.NumberStyles.HexNumber,
                                null, out var code))
                            {
                                sb.Append((char)code);
                                i += 4;
                            }
                            break;
                        default: sb.Append(esc); break;
                    }
                }
                else sb.Append(c);
            }
            return sb.ToString();
        }

        private static int FindMatchingBracket(string json, int start)
        {
            int depth = 0;
            bool inString = false;
            for (int i = start; i < json.Length; i++)
            {
                char c = json[i];
                if (inString) { if (c == '\\') { i++; continue; } if (c == '"') inString = false; continue; }
                if (c == '"') { inString = true; continue; }
                if (c == '[') depth++;
                if (c == ']') { depth--; if (depth == 0) return i; }
            }
            return json.Length - 1;
        }

        private static int FindMatchingBrace(string json, int start)
        {
            int depth = 0;
            bool inString = false;
            for (int i = start; i < json.Length; i++)
            {
                char c = json[i];
                if (inString)
                {
                    if (c == '\\') { i++; continue; }
                    if (c == '"') inString = false;
                    continue;
                }
                if (c == '"') { inString = true; continue; }
                if (c == '{') depth++;
                if (c == '}') { depth--; if (depth == 0) return i; }
            }
            return -1;
        }

        public static string SerializeValue(object value)
        {
            if (value == null) return "null";
            if (value is string s) return $"\"{EscapeString(s)}\"";
            if (value is bool b) return b ? "true" : "false";
            if (value is int i) return i.ToString();
            if (value is long l) return l.ToString();
            if (value is float f) return f.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is double d) return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is UnityEngine.Object unityObject) return SerializeUnityObject(unityObject);
            if (value is Dictionary<string, object> dict)
            {
                var entries = dict.Select(kvp => $"\"{EscapeString(kvp.Key)}\":{SerializeValue(kvp.Value)}");
                return "{" + string.Join(",", entries) + "}";
            }
            if (value is IEnumerable<object> arr)
            {
                var items = arr.Select(v => SerializeValue(v));
                return "[" + string.Join(",", items) + "]";
            }
            if (value is Array array)
            {
                var items = new List<string>();
                foreach (var item in array)
                {
                    items.Add(SerializeValue(item));
                }
                return "[" + string.Join(",", items) + "]";
            }

            return SerializeObject(value);
        }

        private static string SerializeUnityObject(UnityEngine.Object unityObject)
        {
            if (unityObject == null)
            {
                return "null";
            }

            var payload = new Dictionary<string, object>
            {
                { "type", unityObject.GetType().Name },
                { "name", string.IsNullOrEmpty(unityObject.name) ? unityObject.GetType().Name : unityObject.name },
                { "instanceId", unityObject.GetInstanceID() },
            };

            if (unityObject is GameObject gameObject)
            {
                payload["path"] = GetHierarchyPath(gameObject.transform);
                payload["activeSelf"] = gameObject.activeSelf;
                payload["activeInHierarchy"] = gameObject.activeInHierarchy;

                if (gameObject.scene.IsValid())
                {
                    payload["scene"] = gameObject.scene.name;
                    payload["scenePath"] = gameObject.scene.path;
                }
            }
            else if (unityObject is Component component)
            {
                payload["gameObjectName"] = component.gameObject.name;
                payload["gameObjectInstanceId"] = component.gameObject.GetInstanceID();
                payload["path"] = GetHierarchyPath(component.transform);

                if (component.gameObject.scene.IsValid())
                {
                    payload["scene"] = component.gameObject.scene.name;
                    payload["scenePath"] = component.gameObject.scene.path;
                }
            }

            var assetPath = AssetDatabase.GetAssetPath(unityObject);
            if (!string.IsNullOrEmpty(assetPath))
            {
                payload["assetPath"] = assetPath;
            }

            return SerializeValue(payload);
        }

        private static string GetHierarchyPath(Transform transform)
        {
            if (transform == null)
            {
                return string.Empty;
            }

            var names = new List<string>();
            var current = transform;
            while (current != null)
            {
                names.Add(current.name);
                current = current.parent;
            }

            names.Reverse();
            return string.Join("/", names);
        }

        private static string SerializeObject(object obj)
        {
            var type = obj.GetType();
            var fields = type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            var props = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);

            var entries = new List<string>();

            foreach (var field in fields)
            {
                var val = field.GetValue(obj);
                entries.Add($"\"{EscapeString(field.Name)}\":{SerializeValue(val)}");
            }

            foreach (var prop in props)
            {
                if (!prop.CanRead) continue;
                try
                {
                    var val = prop.GetValue(obj);
                    entries.Add($"\"{EscapeString(prop.Name)}\":{SerializeValue(val)}");
                }
                catch { }
            }

            return "{" + string.Join(",", entries) + "}";
        }

        private static string EscapeString(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
        }
    }
}
