using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityAgenticTools;
using UnityAgenticTools.Bridge.Transport;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Handlers
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
            MergePersistedLogs();
            Application.logMessageReceivedThreaded += OnLogMessage;
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

                var flags = System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public;
                var startGetting = logEntriesType.GetMethod("StartGettingEntries", flags);
                var endGetting = logEntriesType.GetMethod("EndGettingEntries", flags);
                var getEntry = logEntriesType.GetMethod("GetEntryInternal", flags);
                if (startGetting == null || endGetting == null || getEntry == null) return;

                // LogEntry members may be properties or fields depending on Unity version
                var messageProp = logEntryType.GetProperty("message");
                var modeProp    = logEntryType.GetProperty("mode");
                var messageField = logEntryType.GetField("message");
                var modeField    = logEntryType.GetField("mode");
                bool useProps = messageProp != null && modeProp != null;
                bool useFields = messageField != null && modeField != null;
                if (!useProps && !useFields) return;

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
                            string message;
                            int mode;
                            if (useProps)
                            {
                                message = messageProp.GetValue(entry) as string ?? "";
                                mode = (int)(modeProp.GetValue(entry) ?? 0);
                            }
                            else
                            {
                                message = messageField.GetValue(entry) as string ?? "";
                                mode = (int)(modeField.GetValue(entry) ?? 0);
                            }
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

        private static void RefreshFromLogEntries()
        {
            try
            {
                var editorAssembly = typeof(UnityEditor.Editor).Assembly;
                var logEntriesType = editorAssembly.GetType("UnityEditor.LogEntries");
                var logEntryType   = editorAssembly.GetType("UnityEditor.LogEntry");
                if (logEntriesType == null || logEntryType == null) return;

                var flags = System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public;
                var startGetting = logEntriesType.GetMethod("StartGettingEntries", flags);
                var endGetting = logEntriesType.GetMethod("EndGettingEntries", flags);
                var getEntry = logEntriesType.GetMethod("GetEntryInternal", flags);
                if (startGetting == null || endGetting == null || getEntry == null) return;

                var messageProp = logEntryType.GetProperty("message");
                var modeProp    = logEntryType.GetProperty("mode");
                var messageField = logEntryType.GetField("message");
                var modeField    = logEntryType.GetField("mode");
                bool useProps = messageProp != null && modeProp != null;
                bool useFields = messageField != null && modeField != null;
                if (!useProps && !useFields) return;

                int totalCount = (int)startGetting.Invoke(null, null);
                try
                {
                    lock (_logLock)
                    {
                        // Build set of existing messages to avoid duplicates
                        var existing = new HashSet<string>();
                        foreach (var e in _logBuffer)
                            existing.Add(e.Message);

                        var entry = Activator.CreateInstance(logEntryType);
                        for (int i = 0; i < totalCount; i++)
                        {
                            getEntry.Invoke(null, new object[] { i, entry });
                            string message;
                            int mode;
                            if (useProps)
                            {
                                message = messageProp.GetValue(entry) as string ?? "";
                                mode = (int)(modeProp.GetValue(entry) ?? 0);
                            }
                            else
                            {
                                message = messageField.GetValue(entry) as string ?? "";
                                mode = (int)(modeField.GetValue(entry) ?? 0);
                            }

                            if (!existing.Contains(message))
                            {
                                _logBuffer.Add(new LogEntry
                                {
                                    Message = message,
                                    StackTrace = "",
                                    Type = LogTypeFromMode(mode),
                                    Timestamp = DateTime.UtcNow.ToString("o")
                                });
                                existing.Add(message);
                            }
                        }

                        if (_logBuffer.Count > MaxBufferSize)
                            _logBuffer.RemoveRange(0, _logBuffer.Count - MaxBufferSize);
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
            const int errorBits   = 0x001 | 0x002 | 0x010 | 0x100 | 0x20000 | 0x800;
            const int warningBits = 0x004 | 0x200 | 0x1000;
            if ((mode & errorBits) != 0) return "Error";
            if ((mode & warningBits) != 0) return "Warning";
            return "Log";
        }

        private static void MergePersistedLogs()
        {
            try
            {
                if (!File.Exists(_persistPath)) return;
                var json = File.ReadAllText(_persistPath);
                var data = JsonUtility.FromJson<LogEntryList>(json);
                if (data?.entries == null) return;

                lock (_logLock)
                {
                    // Build set of messages already in buffer from backfill
                    var existing = new HashSet<string>();
                    foreach (var entry in _logBuffer)
                        existing.Add(entry.Message);

                    // Enrich backfilled entries with better metadata from persist
                    var persistLookup = new Dictionary<string, LogEntryData>();
                    foreach (var e in data.entries)
                    {
                        if (!string.IsNullOrEmpty(e.message))
                            persistLookup[e.message] = e;
                    }

                    for (int i = 0; i < _logBuffer.Count; i++)
                    {
                        if (persistLookup.TryGetValue(_logBuffer[i].Message, out var persisted))
                        {
                            var enriched = _logBuffer[i];
                            if (!string.IsNullOrEmpty(persisted.stackTrace))
                                enriched.StackTrace = persisted.stackTrace;
                            if (!string.IsNullOrEmpty(persisted.timestamp))
                                enriched.Timestamp = persisted.timestamp;
                            if (!string.IsNullOrEmpty(persisted.type))
                                enriched.Type = persisted.type;
                            _logBuffer[i] = enriched;
                        }
                    }

                    // Prepend persisted entries not in backfill (lost across reload)
                    var missing = new List<LogEntry>();
                    foreach (var e in data.entries)
                    {
                        if (!existing.Contains(e.message))
                        {
                            missing.Add(new LogEntry
                            {
                                Message = e.message,
                                StackTrace = e.stackTrace,
                                Type = e.type,
                                Timestamp = e.timestamp
                            });
                        }
                    }

                    if (missing.Count > 0)
                    {
                        _logBuffer.InsertRange(0, missing);
                        if (_logBuffer.Count > MaxBufferSize)
                            _logBuffer.RemoveRange(0, _logBuffer.Count - MaxBufferSize);
                    }
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

                    var typeFilter = "";
                    if (parameters.TryGetValue("type", out var typeObj) && typeObj is string tf)
                    {
                        typeFilter = tf;
                    }

                    var includeStackTrace = true;
                    if (parameters.TryGetValue("includeStackTrace", out var stackObj))
                    {
                        includeStackTrace = Convert.ToBoolean(stackObj);
                    }

                    return Task.FromResult(GetLogs(count, typeFilter, "", includeStackTrace));
                }

                case "clear":
                    return Task.FromResult(Clear());

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

        /// <summary>
        /// Registry surface for logs.tail. Defaults are leaner than the RPC
        /// action's on purpose: agents pull small tails, stack traces on request.
        /// </summary>
        public static object GetLogs(int count = 20, string type = "", string contains = "", bool includeStackTrace = false)
        {
            // Re-read LogEntries to capture native assertions that bypass
            // Application.logMessageReceived (e.g. serialization errors)
            RefreshFromLogEntries();

            lock (_logLock)
            {
                IEnumerable<LogEntry> entries = _logBuffer;

                if (!string.IsNullOrEmpty(type))
                {
                    if (type.Equals("error", StringComparison.OrdinalIgnoreCase))
                    {
                        entries = entries.Where(e => IsErrorType(e.Type));
                    }
                    else
                    {
                        entries = entries.Where(e => string.Equals(e.Type, type, StringComparison.OrdinalIgnoreCase));
                    }
                }

                if (!string.IsNullOrEmpty(contains))
                {
                    entries = entries.Where(e =>
                        (e.Message ?? string.Empty).IndexOf(contains, StringComparison.OrdinalIgnoreCase) >= 0);
                }

                var result = entries.TakeLast(count).Select(e => e.ToDictionary(includeStackTrace)).ToArray();
                return new Dictionary<string, object>
                {
                    { "count", result.Length },
                    { "logs", result }
                };
            }
        }

        /// <summary>
        /// Registry surface for logs.clear. Clears the native console too;
        /// otherwise RefreshFromLogEntries resurrects every entry on the next read.
        /// </summary>
        public static object Clear()
        {
            lock (_logLock)
            {
                _logBuffer.Clear();
            }

            ClearNativeConsole();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "message", "Unity console and captured log buffer cleared" }
            };
        }

        // Unity splits failure output across three LogTypes; an "error" filter
        // that missed exceptions and assertions would lie to agents.
        private static bool IsErrorType(string type)
        {
            return string.Equals(type, "Error", StringComparison.OrdinalIgnoreCase)
                || string.Equals(type, "Exception", StringComparison.OrdinalIgnoreCase)
                || string.Equals(type, "Assert", StringComparison.OrdinalIgnoreCase);
        }

        private static void ClearNativeConsole()
        {
            try
            {
                var logEntriesType = typeof(UnityEditor.Editor).Assembly.GetType("UnityEditor.LogEntries");
                var clear = logEntriesType?.GetMethod("Clear",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);
                clear?.Invoke(null, null);
            }
            catch { }
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

            public Dictionary<string, object> ToDictionary(bool includeStackTrace = true)
            {
                var entry = new Dictionary<string, object>
                {
                    { "message", Message }
                };

                if (includeStackTrace)
                {
                    entry["stackTrace"] = StackTrace;
                }

                entry["type"] = Type;
                entry["timestamp"] = Timestamp;
                return entry;
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
