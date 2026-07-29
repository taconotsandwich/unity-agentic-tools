using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools
{
    public static partial class JsonRpcParser
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
            if (value is int i) return i.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is long l) return l.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is uint ui) return ui.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is ulong ul) return ul.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is short sh) return sh.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is ushort ush) return ush.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is byte by) return by.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is sbyte sb) return sb.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (value is decimal dec) return dec.ToString(System.Globalization.CultureInfo.InvariantCulture);
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
