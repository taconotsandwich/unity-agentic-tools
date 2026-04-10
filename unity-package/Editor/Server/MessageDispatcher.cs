using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityAgenticTools.Refs;
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
            string method = null;
            int timeoutMs = 30000;
            try
            {
                var request = JsonRpcParser.ParseRequest(message);
                id = request.Id;
                method = request.Method;
                timeoutMs = ResolveRequestTimeoutMs(request.Params);

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
                var transportResult = JsonRpcParser.IsTransportSafeValue(result)
                    ? result
                    : await EditorWebSocketServer.RunOnMainThread(
                        () => JsonRpcParser.NormalizeValueForTransport(result),
                        timeoutMs);
                return JsonRpcParser.BuildResult(id, transportResult);
            }
            catch (TaskCanceledException ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Dispatch was canceled (likely bridge restart): {ex.Message}");
                return JsonRpcParser.BuildError(
                    id ?? "0",
                    -32000,
                    method == "editor.invoke"
                        ? "Editor invoke was interrupted by a server transition before its response could be delivered."
                        : "Bridge request was canceled by server transition. Retry the request.");
            }
            catch (TimeoutException ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Dispatch timed out: {ex.Message}");
                return JsonRpcParser.BuildError(
                    id ?? "0",
                    -32000,
                    method == "editor.invoke"
                        ? "Editor invoke timed out while waiting for a stable main-thread response."
                        : "Bridge request timed out while waiting for main thread work.");
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

        private static int ResolveRequestTimeoutMs(Dictionary<string, object> parameters)
        {
            if (parameters == null || !parameters.TryGetValue("_timeout", out var timeoutObj))
            {
                return 30000;
            }

            if (timeoutObj is int timeoutInt)
            {
                return Math.Max(1, timeoutInt);
            }

            if (timeoutObj is long timeoutLong)
            {
                return (int)Math.Max(1L, Math.Min(timeoutLong, int.MaxValue));
            }

            if (timeoutObj is double timeoutDouble)
            {
                return (int)Math.Max(1d, Math.Min(timeoutDouble, int.MaxValue));
            }

            if (timeoutObj is string timeoutString && int.TryParse(timeoutString, out var parsedTimeout))
            {
                return Math.Max(1, parsedTimeout);
            }

            return 30000;
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
            var paramsJson = SerializeValue(NormalizeValueForTransport(data));
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

        public static object NormalizeValueForTransport(object value)
        {
            return NormalizeValueForTransport(value, 0);
        }

        public static bool IsTransportSafeValue(object value)
        {
            return IsTransportSafeValue(value, 0);
        }

        private static object NormalizeValueForTransport(object value, int depth)
        {
            if (depth > 8)
            {
                return value == null ? null : value.ToString();
            }

            if (value == null ||
                value is string ||
                value is bool ||
                value is int ||
                value is long ||
                value is float ||
                value is double)
            {
                return value;
            }

            if (value is Enum enumValue)
            {
                return enumValue.ToString();
            }

            if (value is UnityEngine.Object unityObject)
            {
                return BuildUnityObjectPayload(unityObject);
            }

            if (value is Dictionary<string, object> typedDict)
            {
                var normalized = new Dictionary<string, object>();
                foreach (var kvp in typedDict)
                {
                    normalized[kvp.Key] = NormalizeValueForTransport(kvp.Value, depth + 1);
                }
                return normalized;
            }

            if (value is IDictionary dictionary)
            {
                var normalized = new Dictionary<string, object>();
                foreach (DictionaryEntry entry in dictionary)
                {
                    var key = entry.Key == null ? "null" : entry.Key.ToString();
                    normalized[key] = NormalizeValueForTransport(entry.Value, depth + 1);
                }
                return normalized;
            }

            if (value is Array array)
            {
                var normalized = new List<object>();
                foreach (var item in array)
                {
                    normalized.Add(NormalizeValueForTransport(item, depth + 1));
                }
                return normalized;
            }

            if (value is IEnumerable enumerable)
            {
                var normalized = new List<object>();
                foreach (var item in enumerable)
                {
                    normalized.Add(NormalizeValueForTransport(item, depth + 1));
                }
                return normalized;
            }

            return NormalizeObject(value, depth);
        }

        private static bool IsTransportSafeValue(object value, int depth)
        {
            if (depth > 8)
            {
                return false;
            }

            if (value == null ||
                value is string ||
                value is bool ||
                value is int ||
                value is long ||
                value is float ||
                value is double)
            {
                return true;
            }

            if (value is UnityEngine.Object)
            {
                return false;
            }

            if (value is Dictionary<string, object> typedDict)
            {
                foreach (var kvp in typedDict)
                {
                    if (!IsTransportSafeValue(kvp.Value, depth + 1))
                    {
                        return false;
                    }
                }

                return true;
            }

            if (value is IDictionary dictionary)
            {
                foreach (DictionaryEntry entry in dictionary)
                {
                    if (!(entry.Key is string) || !IsTransportSafeValue(entry.Value, depth + 1))
                    {
                        return false;
                    }
                }

                return true;
            }

            if (value is Array array)
            {
                foreach (var item in array)
                {
                    if (!IsTransportSafeValue(item, depth + 1))
                    {
                        return false;
                    }
                }

                return true;
            }

            if (value is IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    if (!IsTransportSafeValue(item, depth + 1))
                    {
                        return false;
                    }
                }

                return true;
            }

            return false;
        }

        private static string SerializeUnityObject(UnityEngine.Object unityObject)
        {
            return SerializeValue(BuildUnityObjectPayload(unityObject));
        }

        private static Dictionary<string, object> BuildUnityObjectPayload(UnityEngine.Object unityObject)
        {
            if (unityObject == null)
            {
                return null;
            }

            var payload = new Dictionary<string, object>
            {
                { "type", GetUnityTypeName(unityObject) },
            };

            TryAddUnityProperty(payload, "name", () => unityObject.name);
            TryAddUnityProperty(payload, "instanceId", () => UnityObjectCompat.GetObjectId(unityObject));

            if (unityObject is GameObject gameObject)
            {
                TryAddUnityProperty(payload, "path", () => GetHierarchyPath(gameObject.transform));
                TryAddUnityProperty(payload, "activeSelf", () => gameObject.activeSelf);
                TryAddUnityProperty(payload, "activeInHierarchy", () => gameObject.activeInHierarchy);

                if (gameObject.scene.IsValid())
                {
                    TryAddUnityProperty(payload, "scene", () => gameObject.scene.name);
                    TryAddUnityProperty(payload, "scenePath", () => gameObject.scene.path);
                }
            }
            else if (unityObject is Component component)
            {
                TryAddUnityProperty(payload, "gameObjectName", () => component.gameObject.name);
                TryAddUnityProperty(payload, "gameObjectInstanceId", () => UnityObjectCompat.GetObjectId(component.gameObject));
                TryAddUnityProperty(payload, "path", () => GetHierarchyPath(component.transform));

                if (component.gameObject.scene.IsValid())
                {
                    TryAddUnityProperty(payload, "scene", () => component.gameObject.scene.name);
                    TryAddUnityProperty(payload, "scenePath", () => component.gameObject.scene.path);
                }
            }

            TryAddUnityProperty(payload, "assetPath", () => AssetDatabase.GetAssetPath(unityObject));

            return payload;
        }

        private static string GetUnityTypeName(UnityEngine.Object unityObject)
        {
            try
            {
                return unityObject == null ? "UnityEngine.Object" : unityObject.GetType().Name;
            }
            catch
            {
                return "UnityEngine.Object";
            }
        }

        private static void TryAddUnityProperty(Dictionary<string, object> payload, string key, Func<object> supplier)
        {
            try
            {
                var value = supplier();
                if (value != null)
                {
                    payload[key] = value;
                }
            }
            catch
            {
            }
        }

        private static string GetHierarchyPath(Transform transform)
        {
            if (transform == null)
            {
                return string.Empty;
            }

            try
            {
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
            catch
            {
                return string.Empty;
            }
        }

        private static string SerializeObject(object obj)
        {
            return SerializeValue(NormalizeObject(obj, 0));
        }

        private static Dictionary<string, object> NormalizeObject(object obj, int depth)
        {
            var type = obj.GetType();
            var fields = type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            var props = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);

            var normalized = new Dictionary<string, object>();

            foreach (var field in fields)
            {
                var val = field.GetValue(obj);
                normalized[field.Name] = NormalizeValueForTransport(val, depth + 1);
            }

            foreach (var prop in props)
            {
                if (!prop.CanRead || prop.GetIndexParameters().Length > 0) continue;
                try
                {
                    var val = prop.GetValue(obj);
                    normalized[prop.Name] = NormalizeValueForTransport(val, depth + 1);
                }
                catch { }
            }

            return normalized;
        }

        private static string EscapeString(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
        }
    }
}
