using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    [InitializeOnLoad]
    public class ConsoleHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.console.";

        private static readonly List<LogEntry> _logBuffer = new List<LogEntry>();
        private static readonly object _logLock = new object();
        private const int MaxBufferSize = 1000;

        private static readonly HashSet<WebSocketConnection> _subscribers =
            new HashSet<WebSocketConnection>();
        private static readonly object _subscriberLock = new object();

        static ConsoleHandler()
        {
            Application.logMessageReceived += OnLogMessage;
        }

        public Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "getLogs":
                {
                    var count = 50;
                    if (parameters.TryGetValue("count", out var countObj))
                    {
                        count = Convert.ToInt32(countObj);
                    }

                    string typeFilter = null;
                    if (parameters.TryGetValue("type", out var typeObj) && typeObj is string tf)
                    {
                        typeFilter = tf;
                    }

                    lock (_logLock)
                    {
                        IEnumerable<LogEntry> entries = _logBuffer;

                        if (typeFilter != null)
                        {
                            entries = entries.Where(e => e.Type.Equals(typeFilter, StringComparison.OrdinalIgnoreCase));
                        }

                        var result = entries.TakeLast(count).Select(e => e.ToDictionary()).ToArray();
                        return Task.FromResult<object>(new Dictionary<string, object>
                        {
                            { "count", result.Length },
                            { "logs", result }
                        });
                    }
                }

                case "clear":
                    lock (_logLock)
                    {
                        _logBuffer.Clear();
                    }
                    return Task.FromResult<object>(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "message", "Console log buffer cleared" }
                    });

                case "subscribe":
                    return Task.FromResult<object>(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "message", "Console log streaming enabled via events" }
                    });

                case "unsubscribe":
                    return Task.FromResult<object>(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "message", "Console log streaming disabled" }
                    });

                default:
                    throw new InvalidOperationException($"Unknown console action: {action}");
            }
        }

        private static void OnLogMessage(string condition, string stackTrace, LogType type)
        {
            var entry = new LogEntry
            {
                Message = condition,
                StackTrace = stackTrace,
                Type = type.ToString(),
                Timestamp = DateTime.UtcNow.ToString("o")
            };

            lock (_logLock)
            {
                _logBuffer.Add(entry);
                if (_logBuffer.Count > MaxBufferSize)
                {
                    _logBuffer.RemoveRange(0, _logBuffer.Count - MaxBufferSize);
                }
            }

            var notification = JsonRpcParser.BuildNotification("editor.console.logReceived",
                new Dictionary<string, object>
                {
                    { "message", entry.Message },
                    { "stackTrace", entry.StackTrace },
                    { "type", entry.Type },
                    { "timestamp", entry.Timestamp }
                });

            EditorWebSocketServer.Broadcast(notification);
        }

        private struct LogEntry
        {
            public string Message;
            public string StackTrace;
            public string Type;
            public string Timestamp;

            public Dictionary<string, object> ToDictionary()
            {
                return new Dictionary<string, object>
                {
                    { "message", Message },
                    { "stackTrace", StackTrace },
                    { "type", Type },
                    { "timestamp", Timestamp }
                };
            }
        }
    }
}
