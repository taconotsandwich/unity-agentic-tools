using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    [InitializeOnLoad]
    public static class UnityEventBridge
    {
        static UnityEventBridge()
        {
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
            Application.logMessageReceived += OnLogMessageReceived;
            EditorApplication.pauseStateChanged += OnPauseStateChanged;
        }

        private static void OnPlayModeStateChanged(PlayModeStateChange state)
        {
            if (!EditorWebSocketServer.IsRunning) return;

            EventBroadcaster.Broadcast("editor.event.playModeChanged",
                new Dictionary<string, object>
                {
                    { "state", state.ToString() },
                    { "isPlaying", EditorApplication.isPlaying },
                    { "isPaused", EditorApplication.isPaused }
                });
        }

        private static void OnPauseStateChanged(PauseState state)
        {
            if (!EditorWebSocketServer.IsRunning) return;

            EventBroadcaster.Broadcast("editor.event.pauseStateChanged",
                new Dictionary<string, object>
                {
                    { "state", state.ToString() },
                    { "isPaused", state == PauseState.Paused }
                });
        }

        private static void OnLogMessageReceived(string condition, string stackTrace, LogType type)
        {
            if (!EditorWebSocketServer.IsRunning) return;

            EventBroadcaster.Broadcast("editor.event.logMessage",
                new Dictionary<string, object>
                {
                    { "message", condition },
                    { "stackTrace", stackTrace },
                    { "type", type.ToString() },
                    { "timestamp", System.DateTime.UtcNow.ToString("o") }
                });
        }
    }
}
