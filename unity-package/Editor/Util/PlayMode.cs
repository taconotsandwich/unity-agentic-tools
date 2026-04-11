using System.Collections.Generic;
using UnityEditor;

namespace UnityAgenticTools.Util
{
    public static class PlayMode
    {
        public static object Enter()
        {
            EditorApplication.isPlaying = true;
            return new Dictionary<string, object>
            {
                { "success", true },
                { "state", "Playing" }
            };
        }

        public static object Exit()
        {
            EditorApplication.isPlaying = false;
            return new Dictionary<string, object>
            {
                { "success", true },
                { "state", "Stopped" }
            };
        }

        public static object Pause()
        {
            EditorApplication.isPaused = !EditorApplication.isPaused;
            return new Dictionary<string, object>
            {
                { "success", true },
                { "paused", EditorApplication.isPaused },
                { "state", GetStateString() }
            };
        }

        public static object Step()
        {
            EditorApplication.Step();
            return new Dictionary<string, object>
            {
                { "success", true },
                { "state", GetStateString() }
            };
        }

        public static object GetState()
        {
            return new Dictionary<string, object>
            {
                { "state", GetStateString() },
                { "isPlaying", EditorApplication.isPlaying },
                { "isPaused", EditorApplication.isPaused },
                { "isCompiling", EditorApplication.isCompiling }
            };
        }

        private static string GetStateString()
        {
            if (!EditorApplication.isPlaying) return "Stopped";
            if (EditorApplication.isPaused) return "Paused";
            return "Playing";
        }
    }
}
