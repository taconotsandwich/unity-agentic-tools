using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;

namespace UnityAgenticTools.Server
{
    public class InvokeHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.invoke";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            // Extract per-request timeout from params (default: 30s)
            int timeoutMs = 30000;
            if (parameters.TryGetValue("_timeout", out var timeoutObj))
            {
                if (timeoutObj is long tl) timeoutMs = (int)Math.Min(tl, int.MaxValue);
                else if (timeoutObj is double td) timeoutMs = (int)td;
                else if (timeoutObj is string ts && int.TryParse(ts, out var tp)) timeoutMs = tp;
            }

            // Fire-and-forget mode: enqueue and return immediately
            if (parameters.TryGetValue("no_wait", out var nwObj) && (nwObj is true || nwObj is string nws && nws == "true"))
            {
                var task = EditorWebSocketServer.RunOnMainThread(() =>
                {
                    ExecuteInvoke(parameters);
                }, timeoutMs);
                _ = task.ContinueWith(t =>
                {
                    if (t.IsFaulted)
                        UnityEngine.Debug.LogWarning($"[UnityAgenticTools] Fire-and-forget invoke failed: {t.Exception?.InnerException?.Message ?? t.Exception?.Message}");
                });
                return new Dictionary<string, object> { { "queued", true } };
            }

            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                return ExecuteInvoke(parameters);
            }, timeoutMs);
        }

        private static object ExecuteInvoke(Dictionary<string, object> parameters)
        {
            if (!parameters.TryGetValue("type", out var typeObj) || !(typeObj is string typeName))
                throw new ArgumentException("Missing required parameter: type");
            if (!parameters.TryGetValue("member", out var memberObj) || !(memberObj is string memberName))
                throw new ArgumentException("Missing required parameter: member");

            var type = FindType(typeName);
            if (type == null)
                throw new ArgumentException($"Type not found: {typeName}. Ensure the assembly is loaded.");

            // --set: write a static property
            if (parameters.TryGetValue("set", out var setObj) && setObj is string setValue)
            {
                var prop = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
                if (prop == null)
                    throw new ArgumentException($"Static property not found: {typeName}.{memberName}");
                if (!prop.CanWrite)
                    throw new ArgumentException($"Property is read-only: {typeName}.{memberName}");
                var converted = Convert.ChangeType(setValue, prop.PropertyType);
                prop.SetValue(null, converted);
                return (object)new Dictionary<string, object> { { "success", true } };
            }

            // parse args (JSON string array or empty)
            string[] argsArr = new string[0];
            if (parameters.TryGetValue("args", out var argsObj) && argsObj is string argsStr)
                argsArr = ParseJsonStringArray(argsStr);

            // try static property getter (only when no args)
            var propInfo = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
            if (propInfo != null && argsArr.Length == 0)
            {
                if (!propInfo.CanRead)
                    throw new ArgumentException($"Property is write-only: {typeName}.{memberName}");
                var value = propInfo.GetValue(null);
                return (object)new Dictionary<string, object> { { "value", value } };
            }

            // try static method -- resolve by arg count to handle overloaded methods
            MethodInfo methodInfo = null;
            var allMethods = type.GetMethods(BindingFlags.Public | BindingFlags.Static);
            var matchCount = 0;
            var availableArities = new List<int>();
            foreach (var m in allMethods)
            {
                if (m.Name != memberName || m.IsGenericMethodDefinition) continue;
                var paramCount = m.GetParameters().Length;
                availableArities.Add(paramCount);
                if (paramCount == argsArr.Length)
                {
                    methodInfo = m;
                    matchCount++;
                }
            }
            if (matchCount > 1)
                throw new ArgumentException(
                    $"Ambiguous: {typeName}.{memberName} has multiple overloads with " +
                    $"{argsArr.Length} parameter(s). Cannot resolve automatically.");
            if (matchCount == 0 && availableArities.Count > 0)
            {
                availableArities.Sort();
                var arityStrs = new List<string>();
                foreach (var a in availableArities) arityStrs.Add(a.ToString());
                throw new ArgumentException(
                    $"No overload of {typeName}.{memberName} takes {argsArr.Length} argument(s). " +
                    $"Available overloads take: {string.Join(", ", arityStrs)} arg(s).");
            }
            if (methodInfo != null)
            {
                var methodParams = methodInfo.GetParameters();
                object[] invokeArgs;
                if (argsArr.Length == 0)
                {
                    invokeArgs = new object[0];
                }
                else
                {
                    int count = Math.Min(argsArr.Length, methodParams.Length);
                    invokeArgs = new object[count];
                    for (int i = 0; i < count; i++)
                    {
                        invokeArgs[i] = methodParams[i].ParameterType == typeof(string)
                            ? argsArr[i]
                            : Convert.ChangeType(argsArr[i], methodParams[i].ParameterType);
                    }
                }
                var result = methodInfo.Invoke(null, invokeArgs);
                return (object)new Dictionary<string, object>
                {
                    { "success", true },
                    { "result", result }
                };
            }

            throw new ArgumentException($"No public static property or method '{memberName}' found on {typeName}");
        }

        private static Type FindType(string fullName)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var t = asm.GetType(fullName);
                    if (t != null) return t;
                }
                catch { }
            }
            return null;
        }

        private static string[] ParseJsonStringArray(string json)
        {
            json = json.Trim();
            if (!json.StartsWith("[") || !json.EndsWith("]"))
                return new[] { json };
            json = json.Substring(1, json.Length - 2).Trim();
            if (string.IsNullOrEmpty(json)) return new string[0];

            var result = new List<string>();
            int i = 0;
            while (i < json.Length)
            {
                // skip whitespace and commas between elements
                while (i < json.Length && (json[i] == ' ' || json[i] == '\t' || json[i] == ',')) i++;
                if (i >= json.Length) break;

                if (json[i] == '"')
                {
                    // quoted string element with proper escape handling
                    i++;
                    var sb = new StringBuilder();
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
                                case 'b': sb.Append('\b'); break;
                                case 'f': sb.Append('\f'); break;
                                case 'u':
                                    if (i + 4 <= json.Length)
                                    {
                                        sb.Append((char)Convert.ToInt32(json.Substring(i, 4), 16));
                                        i += 4;
                                    }
                                    else
                                    {
                                        sb.Append(esc);
                                    }
                                    break;
                                default: sb.Append(esc); break;
                            }
                        }
                        else sb.Append(c);
                    }
                    result.Add(sb.ToString());
                }
                else
                {
                    // unquoted value (number, bool, null)
                    int start = i;
                    while (i < json.Length && json[i] != ',') i++;
                    result.Add(json.Substring(start, i - start).Trim());
                }
            }

            return result.ToArray();
        }
    }
}
