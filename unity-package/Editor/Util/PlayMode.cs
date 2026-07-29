using System.Collections.Generic;
using UnityEditor;

namespace UnityAgenticTools.Util
{
    public static class PlayMode
    {
        // Unity applies a play mode change over several frames, and entering play
        // mode reloads the domain. Reporting the requested state as if it had been
        // reached made callers skip the wait they actually need, so these report
        // what the editor is doing now and name the request separately.
        public static object Enter()
        {
            EditorApplication.isPlaying = true;
            return TransitionResult("Playing");
        }

        public static object Exit()
        {
            EditorApplication.isPlaying = false;
            return TransitionResult("Stopped");
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

        private static object TransitionResult(string requested)
        {
            return new Dictionary<string, object>
            {
                { "success", true },
                { "requested", requested },
                { "state", GetStateString() },
                { "isPlaying", EditorApplication.isPlaying }
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
