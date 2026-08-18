using System;
using System.IO;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Transport
{
    public static class LockfileManager
    {
        private const string DirName = ".unity-agentic";
        private const string FileName = "editor.json";
        private const string GitignoreFileName = ".gitignore";
        private const string GitignoreEntry = ".unity-agentic/";

        private static string _lockfilePath;

        public static string LockfilePath => _lockfilePath;

        public static bool MatchesExpectedServer(int port, int pid)
        {
            var path = GetLockfilePath();
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                return false;
            }

            try
            {
                return ContentMatchesExpectedServer(File.ReadAllText(path), port, pid);
            }
            catch
            {
                return false;
            }
        }

        public static bool ContentMatchesExpectedServer(string content, int port, int pid)
        {
            if (string.IsNullOrWhiteSpace(content))
            {
                return false;
            }

            try
            {
                var lockfile = JsonUtility.FromJson<LockfileContents>(content);
                return lockfile != null &&
                    lockfile.port == port &&
                    lockfile.pid == pid &&
                    lockfile.version == BridgeMetadata.PackageVersion;
            }
            catch
            {
                return false;
            }
        }

        public static void Write(int port, int pid)
        {
            if (EditorProcessContext.IsAssetImportWorker)
            {
                return;
            }

            try
            {
                var projectPath = GetProjectPath();
                var dirPath = Path.Combine(projectPath, DirName);

                if (!Directory.Exists(dirPath))
                {
                    Directory.CreateDirectory(dirPath);
                }

                EnsureGitignoreEntry(projectPath);
                _lockfilePath = Path.Combine(dirPath, FileName);

                var json = $"{{\n  \"port\": {port},\n  \"pid\": {pid},\n  \"version\": \"{BridgeMetadata.PackageVersion}\"\n}}\n";
                File.WriteAllText(_lockfilePath, json);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UnityAgenticTools] Failed to write lockfile: {ex.Message}");
            }
        }

        private static void EnsureGitignoreEntry(string projectPath)
        {
            try
            {
                var gitignorePath = Path.Combine(projectPath, GitignoreFileName);
                if (!File.Exists(gitignorePath))
                {
                    File.WriteAllText(gitignorePath, GitignoreEntry + Environment.NewLine);
                    return;
                }

                var content = File.ReadAllText(gitignorePath);
                if (GitignoreIgnoresAgenticDir(content))
                {
                    return;
                }

                var separator = content.Length == 0 || content.EndsWith("\n", StringComparison.Ordinal)
                    ? string.Empty
                    : Environment.NewLine;
                File.WriteAllText(gitignorePath, content + separator + GitignoreEntry + Environment.NewLine);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Failed to update .gitignore: {ex.Message}");
            }
        }

        private static bool GitignoreIgnoresAgenticDir(string content)
        {
            var lines = content.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var rawLine in lines)
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
                {
                    continue;
                }

                if (line == ".unity-agentic" ||
                    line == GitignoreEntry ||
                    line == "/.unity-agentic" ||
                    line == "/" + GitignoreEntry)
                {
                    return true;
                }
            }

            return false;
        }

        public static void Remove()
        {
            if (EditorProcessContext.IsAssetImportWorker)
            {
                return;
            }

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

        [Serializable]
        private sealed class LockfileContents
        {
            public int port;
            public int pid;
            public string version;
        }
    }
}
