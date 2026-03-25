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

    }
}
