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

        public static bool Exists()
        {
            var path = GetLockfilePath();
            return !string.IsNullOrEmpty(path) && File.Exists(path);
        }

        public static void Write(int port, int pid)
        {
            try
            {
                var projectPath = GetProjectPath();
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
                var path = GetLockfilePath();
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    File.Delete(path);
                    _lockfilePath = null;
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Failed to remove lockfile: {ex.Message}");
            }
        }

        private static string GetLockfilePath()
        {
            if (!string.IsNullOrEmpty(_lockfilePath))
            {
                return _lockfilePath;
            }

            try
            {
                var projectPath = GetProjectPath();
                _lockfilePath = Path.Combine(projectPath, DirName, FileName);
                return _lockfilePath;
            }
            catch
            {
                return null;
            }
        }

        private static string GetProjectPath()
        {
            return Path.GetDirectoryName(Application.dataPath);
        }
    }
}
