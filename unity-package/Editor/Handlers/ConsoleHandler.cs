using System;
using System.Collections.Generic;
using System.IO;
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

        private static readonly string _persistPath = Path.Combine(
            Path.GetTempPath(), "unity-agentic-console-buffer.json");

        static ConsoleHandler()
        {
            LoadExistingUnityLogs();
            LoadPersistedLogs();
            Application.logMessageReceived += OnLogMessage;
            AssemblyReloadEvents.beforeAssemblyReload += SaveLogsToDisk;
        }

        private static void LoadExistingUnityLogs()
        {
            try
            {
                var editorAssembly = typeof(UnityEditor.Editor).Assembly;
                var logEntriesType = editorAssembly.GetType("UnityEditor.LogEntries");
                var logEntryType   = editorAssembly.GetType("UnityEditor.LogEntry");
                if (logEntriesType == null || logEntryType == null) return;

                var startGetting = logEntriesType.GetMethod("StartGettingEntries",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);
                var endGetting = logEntriesType.GetMethod("EndGettingEntries",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);
                var getEntry = logEntriesType.GetMethod("GetEntryInternal",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);
                if (startGetting == null || endGetting == null || getEntry == null) return;

                // LogEntry exposes properties, not fields
                var messageProp = logEntryType.GetProperty("message");
                var modeProp    = logEntryType.GetProperty("mode");
                if (messageProp == null || modeProp == null) return;

                int count = (int)startGetting.Invoke(null, null);
                try
                {
                    var entry = Activator.CreateInstance(logEntryType);
                    lock (_logLock)
                    {
                        int start = Math.Max(0, count - MaxBufferSize);
                        for (int i = start; i < count; i++)
                        {
                            getEntry.Invoke(null, new object[] { i, entry });
                            var message = messageProp.GetValue(entry) as string ?? "";
                            var mode    = (int)(modeProp.GetValue(entry) ?? 0);
                            _logBuffer.Add(new LogEntry
                            {
                                Message   = message,
                                StackTrace = "",
                                Type      = LogTypeFromMode(mode),
                                Timestamp = DateTime.UtcNow.ToString("o")
                            });
                        }
                    }
                }
                finally
                {
                    endGetting.Invoke(null, null);
                }
            }
            catch { }
        }

        private static string LogTypeFromMode(int mode)
        {
            const int errorBits   = 0x001 | 0x010 | 0x100 | 0x20000 | 0x800;
            const int warningBits = 0x004 | 0x200 | 0x1000;
            if ((mode & errorBits) != 0) return "Error";
            if ((mode & warningBits) != 0) return "Warning";
            return "Log";
        }

        private static void LoadPersistedLogs()
        {
            try
            {
                if (!File.Exists(_persistPath)) return;
                var json = File.ReadAllText(_persistPath);
                var data = JsonUtility.FromJson<LogEntryList>(json);
                if (data?.entries == null) return;
                lock (_logLock)
                {
                    foreach (var e in data.entries)
                    {
                        _logBuffer.Add(new LogEntry
                        {
                            Message = e.message,
                            StackTrace = e.stackTrace,
                            Type = e.type,
                            Timestamp = e.timestamp
                        });
                    }
                    if (_logBuffer.Count > MaxBufferSize)
                        _logBuffer.RemoveRange(0, _logBuffer.Count - MaxBufferSize);
                }
            }
            catch { }
        }

        private static void SaveLogsToDisk()
        {
            try
            {
                List<LogEntry> snapshot;
                lock (_logLock)
                {
                    snapshot = new List<LogEntry>(_logBuffer);
                }
                var data = new LogEntryList
                {
                    entries = snapshot.Select(e => new LogEntryData
                    {
                        message = e.Message,
                        stackTrace = e.StackTrace,
                        type = e.Type,
                        timestamp = e.Timestamp
                    }).ToList()
                };
                File.WriteAllText(_persistPath, JsonUtility.ToJson(data));
            }
            catch { }
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

        [Serializable]
        private class LogEntryData
        {
            public string message;
            public string stackTrace;
            public string type;
            public string timestamp;
        }

        [Serializable]
        private class LogEntryList
        {
            public List<LogEntryData> entries = new List<LogEntryData>();
        }
    }
}
