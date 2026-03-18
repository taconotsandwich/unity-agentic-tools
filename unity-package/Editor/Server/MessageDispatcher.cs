using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
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
            var pattern = $"\"{field}\"\\s*:\\s*\"([^\"]*?)\"";
            var match = Regex.Match(json, pattern);
            if (match.Success) return match.Groups[1].Value;

            var numPattern = $"\"{field}\"\\s*:\\s*(\\d+)";
            var numMatch = Regex.Match(json, numPattern);
            if (numMatch.Success) return numMatch.Groups[1].Value;

            return null;
        }

        private static Dictionary<string, object> ParseFlatObject(string json)
        {
            var result = new Dictionary<string, object>();
            var pattern = new Regex("\"([^\"]+)\"\\s*:\\s*(\"([^\"]*)\"|(-?\\d+\\.?\\d*)|true|false|null)");
            foreach (Match m in pattern.Matches(json))
            {
                var key = m.Groups[1].Value;
                if (m.Groups[3].Success)
                {
                    result[key] = m.Groups[3].Value;
                }
                else
                {
                    var val = m.Groups[2].Value;
                    if (val == "true") result[key] = true;
                    else if (val == "false") result[key] = false;
                    else if (val == "null") result[key] = null;
                    else if (double.TryParse(val, out var num))
                    {
                        if (val.Contains(".")) result[key] = num;
                        else result[key] = (int)num;
                    }
                    else result[key] = val;
                }
            }
            return result;
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
