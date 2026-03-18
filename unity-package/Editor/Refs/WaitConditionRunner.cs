using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityAgenticTools.Server;

namespace UnityAgenticTools.Refs
{
    public static class WaitConditionRunner
    {
        public static async Task<object> WaitForCondition(Func<bool> condition, int timeoutMs, string description)
        {
            var tcs = new TaskCompletionSource<object>();
            var startTime = DateTime.UtcNow;

            void Poll()
            {
                if (tcs.Task.IsCompleted) return;

                try
                {
                    bool result = condition();
                    if (result)
                    {
                        EditorApplication.update -= Poll;
                        var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;
                        tcs.TrySetResult(new Dictionary<string, object>
                        {
                            { "success", true },
                            { "condition", description },
                            { "elapsed", (int)elapsed }
                        });
                        return;
                    }

                    var elapsedMs = (DateTime.UtcNow - startTime).TotalMilliseconds;
                    if (elapsedMs >= timeoutMs)
                    {
                        EditorApplication.update -= Poll;
                        tcs.TrySetResult(new Dictionary<string, object>
                        {
                            { "success", false },
                            { "condition", description },
                            { "error", $"Timeout after {timeoutMs}ms waiting for {description}" }
                        });
                    }
                }
                catch (Exception ex)
                {
                    EditorApplication.update -= Poll;
                    tcs.TrySetException(ex);
                }
            }

            // Must register on main thread
            await EditorWebSocketServer.RunOnMainThread(() =>
            {
                // Check immediately first
                try
                {
                    if (condition())
                    {
                        tcs.TrySetResult(new Dictionary<string, object>
                        {
                            { "success", true },
                            { "condition", description },
                            { "elapsed", 0 }
                        });
                        return;
                    }
                }
                catch { }

                EditorApplication.update += Poll;
            });

            return await tcs.Task;
        }

        public static async Task<object> WaitForLog(string text, int timeoutMs)
        {
            var tcs = new TaskCompletionSource<object>();
            var startTime = DateTime.UtcNow;

            void OnLogMessage(string condition, string stackTrace, LogType type)
            {
                if (tcs.Task.IsCompleted) return;

                if (condition != null && condition.Contains(text))
                {
                    Application.logMessageReceived -= OnLogMessage;
                    var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;
                    tcs.TrySetResult(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "condition", $"log matching '{text}'" },
                        { "elapsed", (int)elapsed },
                        { "matchedMessage", condition },
                        { "logType", type.ToString() }
                    });
                }
            }

            void TimeoutCheck()
            {
                if (tcs.Task.IsCompleted)
                {
                    EditorApplication.update -= TimeoutCheck;
                    return;
                }

                var elapsedMs = (DateTime.UtcNow - startTime).TotalMilliseconds;
                if (elapsedMs >= timeoutMs)
                {
                    EditorApplication.update -= TimeoutCheck;
                    Application.logMessageReceived -= OnLogMessage;
                    tcs.TrySetResult(new Dictionary<string, object>
                    {
                        { "success", false },
                        { "condition", $"log matching '{text}'" },
                        { "error", $"Timeout after {timeoutMs}ms waiting for log matching '{text}'" }
                    });
                }
            }

            await EditorWebSocketServer.RunOnMainThread(() =>
            {
                Application.logMessageReceived += OnLogMessage;
                EditorApplication.update += TimeoutCheck;
            });

            return await tcs.Task;
        }
    }
}
