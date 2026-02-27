using System;
using System.IO;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public static class LockfileManager
    {
        private const string DirName = ".unity-agentic";
        private const string FileName = "editor.json";

        private static string _lockfilePath;

        public static string LockfilePath => _lockfilePath;

        public static void Write(int port, int pid)
        {
            try
            {
                var projectPath = Path.GetDirectoryName(Application.dataPath);
                var dirPath = Path.Combine(projectPath, DirName);

                if (!Directory.Exists(dirPath))
                {
                    Directory.CreateDirectory(dirPath);
                }

                _lockfilePath = Path.Combine(dirPath, FileName);

                var json = $"{{\n  \"port\": {port},\n  \"pid\": {pid},\n  \"version\": \"0.1.0\"\n}}\n";
                File.WriteAllText(_lockfilePath, json);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UnityAgenticTools] Failed to write lockfile: {ex.Message}");
            }
        }

        public static void Remove()
        {
            try
            {
                if (!string.IsNullOrEmpty(_lockfilePath) && File.Exists(_lockfilePath))
                {
                    File.Delete(_lockfilePath);
                    _lockfilePath = null;
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Failed to remove lockfile: {ex.Message}");
            }
        }
    }
}
