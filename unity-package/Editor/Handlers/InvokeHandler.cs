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
            return await EditorWebSocketServer.RunOnMainThread(() =>
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

                // try static method
                var methodInfo = type.GetMethod(memberName, BindingFlags.Public | BindingFlags.Static);
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
            });
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
