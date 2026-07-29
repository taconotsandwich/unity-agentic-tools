using System;
using System.Collections.Generic;
using System.Text;

namespace UnityAgenticTools.Util
{
    internal static class JsonArgs
    {
        internal static string[] ParseStringArray(string json)
        {
            json = (json ?? string.Empty).Trim();
            if (!json.StartsWith("[") || !json.EndsWith("]"))
            {
                return new[] { json };
            }

            json = json.Substring(1, json.Length - 2).Trim();
            if (string.IsNullOrEmpty(json))
            {
                return new string[0];
            }

            var result = new List<string>();
            var index = 0;
            while (index < json.Length)
            {
                while (index < json.Length && (json[index] == ' ' || json[index] == '\t' || json[index] == ','))
                {
                    index += 1;
                }

                if (index >= json.Length)
                {
                    break;
                }

                if (json[index] == '"')
                {
                    index += 1;
                    var builder = new StringBuilder();
                    while (index < json.Length)
                    {
                        var current = json[index++];
                        if (current == '"')
                        {
                            break;
                        }

                        if (current == '\\' && index < json.Length)
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
                                case 'b': builder.Append('\b'); break;
                                case 'f': builder.Append('\f'); break;
                                case 'u':
                                    if (index + 4 <= json.Length)
                                    {
                                        builder.Append((char)Convert.ToInt32(json.Substring(index, 4), 16));
                                        index += 4;
                                    }
                                    else
                                    {
                                        builder.Append(escaped);
                                    }
                                    break;
                                default:
                                    builder.Append(escaped);
                                    break;
                            }
                        }
                        else
                        {
                            builder.Append(current);
                        }
                    }

                    result.Add(builder.ToString());
                }
                else
                {
                    var start = index;
                    while (index < json.Length && json[index] != ',')
                    {
                        index += 1;
                    }

                    result.Add(json.Substring(start, index - start).Trim());
                }
            }

            return result.ToArray();
        }
    }
}
