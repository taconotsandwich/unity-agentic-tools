using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools
{
    public static class JsonRpcParser
    {
        public static JsonRpcRequest ParseRequest(string json)
        {
            var request = new JsonRpcRequest
            {
                Params = new Dictionary<string, object>()
            };

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

            if (value is IEnumerable<object> items)
            {
                return "[" + string.Join(",", items.Select(SerializeValue)) + "]";
            }

            if (value is Array array)
            {
                var serialized = new List<string>();
                foreach (var item in array)
                {
                    serialized.Add(SerializeValue(item));
                }

                return "[" + string.Join(",", serialized) + "]";
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

        private static string ExtractStringField(string json, string field)
        {
            var target = $"\"{field}\"";
            var idx = json.IndexOf(target, StringComparison.Ordinal);
            if (idx < 0)
            {
                return null;
            }

            var pos = idx + target.Length;
            while (pos < json.Length && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == ':'))
            {
                pos++;
            }

            if (pos >= json.Length)
            {
                return null;
            }

            if (json[pos] == '"')
            {
                return ReadJsonString(json, ref pos);
            }

            var start = pos;
            while (pos < json.Length && json[pos] >= '0' && json[pos] <= '9')
            {
                pos++;
            }

            return pos > start ? json.Substring(start, pos - start) : null;
        }

        private static Dictionary<string, object> ParseFlatObject(string json)
        {
            var result = new Dictionary<string, object>();
            var index = 0;
            var length = json.Length;

            while (index < length && json[index] != '{')
            {
                index++;
            }

            if (index >= length)
            {
                return result;
            }

            index++;

            while (index < length)
            {
                while (index < length && json[index] != '"' && json[index] != '}')
                {
                    index++;
                }

                if (index >= length || json[index] == '}')
                {
                    break;
                }

                var key = ReadJsonString(json, ref index);

                while (index < length && json[index] != ':')
                {
                    index++;
                }

                if (index >= length)
                {
                    break;
                }

                index++;

                while (index < length && (json[index] == ' ' || json[index] == '\t' || json[index] == '\n' || json[index] == '\r'))
                {
                    index++;
                }

                if (index >= length)
                {
                    break;
                }

                var character = json[index];
                if (character == '"')
                {
                    result[key] = ReadJsonString(json, ref index);
                }
                else if (character == '{')
                {
                    var end = FindMatchingBrace(json, index);
                    result[key] = end > index ? json.Substring(index, end - index + 1) : "{}";
                    index = end + 1;
                }
                else if (character == '[')
                {
                    var end = FindMatchingBracket(json, index);
                    result[key] = end > index ? json.Substring(index, end - index + 1) : "[]";
                    index = end + 1;
                }
                else
                {
                    var start = index;
                    while (index < length && json[index] != ',' && json[index] != '}' && json[index] != '\n')
                    {
                        index++;
                    }

                    var raw = json.Substring(start, index - start).Trim();
                    if (raw == "true")
                    {
                        result[key] = true;
                    }
                    else if (raw == "false")
                    {
                        result[key] = false;
                    }
                    else if (raw == "null")
                    {
                        result[key] = null;
                    }
                    else if (raw.Contains(".") && double.TryParse(
                        raw,
                        System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture,
                        out var doubleValue))
                    {
                        result[key] = doubleValue;
                    }
                    else if (int.TryParse(raw, out var intValue))
                    {
                        result[key] = intValue;
                    }
                    else
                    {
                        result[key] = raw;
                    }
                }

                while (index < length && json[index] != ',' && json[index] != '}')
                {
                    index++;
                }

                if (index < length && json[index] == ',')
                {
                    index++;
                }
            }

            return result;
        }

        private static string ReadJsonString(string json, ref int index)
        {
            if (index >= json.Length || json[index] != '"')
            {
                return string.Empty;
            }

            index++;
            var builder = new System.Text.StringBuilder();
            while (index < json.Length)
            {
                var character = json[index++];
                if (character == '"')
                {
                    break;
                }

                if (character == '\\' && index < json.Length)
                {
                    var escaped = json[index++];
                    switch (escaped)
                    {
                        case '"': builder.Append('"'); break;
                        case '\\': builder.Append('\\'); break;
                        case '/': builder.Append('/'); break;
                        case 'n': builder.Append('\n'); break;
                        case 'r': builder.Append('\r'); break;
                        case 't': builder.Append('\t'); break;
                        case 'u':
                            if (index + 4 <= json.Length && int.TryParse(
                                json.Substring(index, 4),
                                System.Globalization.NumberStyles.HexNumber,
                                null,
                                out var code))
                            {
                                builder.Append((char)code);
                                index += 4;
                            }
                            break;
                        default: builder.Append(escaped); break;
                    }
                }
                else
                {
                    builder.Append(character);
                }
            }

            return builder.ToString();
        }

        private static int FindMatchingBracket(string json, int start)
        {
            var depth = 0;
            var inString = false;
            for (var index = start; index < json.Length; index++)
            {
                var character = json[index];
                if (inString)
                {
                    if (character == '\\')
                    {
                        index++;
                        continue;
                    }

                    if (character == '"')
                    {
                        inString = false;
                    }

                    continue;
                }

                if (character == '"')
                {
                    inString = true;
                    continue;
                }

                if (character == '[')
                {
                    depth++;
                }

                if (character == ']')
                {
                    depth--;
                    if (depth == 0)
                    {
                        return index;
                    }
                }
            }

            return json.Length - 1;
        }

        private static int FindMatchingBrace(string json, int start)
        {
            var depth = 0;
            var inString = false;
            for (var index = start; index < json.Length; index++)
            {
                var character = json[index];
                if (inString)
                {
                    if (character == '\\')
                    {
                        index++;
                        continue;
                    }

                    if (character == '"')
                    {
                        inString = false;
                    }

                    continue;
                }

                if (character == '"')
                {
                    inString = true;
                    continue;
                }

                if (character == '{')
                {
                    depth++;
                }

                if (character == '}')
                {
                    depth--;
                    if (depth == 0)
                    {
                        return index;
                    }
                }
            }

            return -1;
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
                { "type", GetUnityTypeName(unityObject) }
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
            var properties = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            var normalized = new Dictionary<string, object>();

            foreach (var field in fields)
            {
                var value = field.GetValue(obj);
                normalized[field.Name] = NormalizeValueForTransport(value, depth + 1);
            }

            foreach (var property in properties)
            {
                if (!property.CanRead || property.GetIndexParameters().Length > 0)
                {
                    continue;
                }

                try
                {
                    var value = property.GetValue(obj);
                    normalized[property.Name] = NormalizeValueForTransport(value, depth + 1);
                }
                catch
                {
                }
            }

            return normalized;
        }

        private static string EscapeString(string value)
        {
            if (value == null)
            {
                return string.Empty;
            }

            return value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
        }
    }
}
