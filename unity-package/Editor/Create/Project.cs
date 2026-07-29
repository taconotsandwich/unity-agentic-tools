using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;

namespace UnityAgenticTools.Create
{
    public static class Project
    {
        public static object Build(string scenePath, int position = -1)
        {
            var normalizedScenePath = CreateUtility.NormalizeAssetPath(scenePath);
            if (!normalizedScenePath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Build target must be a .unity scene asset path.");
            }

            if (!File.Exists(CreateUtility.ToAbsolutePath(normalizedScenePath)))
            {
                throw new InvalidOperationException($"Scene file not found: {normalizedScenePath}");
            }

            var guid = AssetDatabase.AssetPathToGUID(normalizedScenePath);
            if (string.IsNullOrWhiteSpace(guid))
            {
                throw new InvalidOperationException($"Could not resolve GUID for scene: {normalizedScenePath}");
            }

            var scenes = EditorBuildSettings.scenes.ToList();
            if (scenes.Any(scene => string.Equals(scene.path, normalizedScenePath, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException($"Scene already exists in build settings: {normalizedScenePath}");
            }

            var newEntry = new EditorBuildSettingsScene(normalizedScenePath, true);
            if (position >= 0 && position <= scenes.Count)
            {
                scenes.Insert(position, newEntry);
            }
            else
            {
                scenes.Add(newEntry);
            }

            EditorBuildSettings.scenes = scenes.ToArray();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "scenePath", normalizedScenePath },
                { "buildCount", scenes.Count }
            };
        }

        public static object Package(string name, string version)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Missing required parameter: name");
            }

            if (string.IsNullOrWhiteSpace(version))
            {
                throw new ArgumentException("Missing required parameter: version");
            }

            var manifestPath = Path.Combine(CreateUtility.GetProjectRoot(), "Packages", "manifest.json");
            if (!File.Exists(manifestPath))
            {
                throw new InvalidOperationException($"Package manifest not found: {manifestPath}");
            }

            var content = File.ReadAllText(manifestPath);
            if (Regex.IsMatch(content, $"\"{Regex.Escape(name)}\"\\s*:"))
            {
                throw new InvalidOperationException($"Package already exists in manifest: {name}");
            }

            var dependenciesIndex = content.IndexOf("\"dependencies\"", StringComparison.Ordinal);
            if (dependenciesIndex < 0)
            {
                throw new InvalidOperationException("Could not locate the dependencies object in Packages/manifest.json.");
            }

            var openBraceIndex = content.IndexOf('{', dependenciesIndex);
            if (openBraceIndex < 0)
            {
                throw new InvalidOperationException("Malformed Packages/manifest.json: missing dependencies object.");
            }

            var closeBraceIndex = FindMatchingBrace(content, openBraceIndex);
            if (closeBraceIndex <= openBraceIndex)
            {
                throw new InvalidOperationException("Malformed Packages/manifest.json: could not parse dependencies object.");
            }

            var lastEntryIndex = closeBraceIndex - 1;
            while (lastEntryIndex > openBraceIndex && char.IsWhiteSpace(content[lastEntryIndex]))
            {
                lastEntryIndex -= 1;
            }

            string updatedContent;
            if (lastEntryIndex == openBraceIndex)
            {
                updatedContent = content.Insert(
                    closeBraceIndex,
                    $"\n    \"{CreateUtility.EscapeJsonString(name)}\": \"{CreateUtility.EscapeJsonString(version)}\"\n  ");
            }
            else
            {
                updatedContent = content.Insert(
                    lastEntryIndex + 1,
                    $",\n    \"{CreateUtility.EscapeJsonString(name)}\": \"{CreateUtility.EscapeJsonString(version)}\"");
            }

            File.WriteAllText(manifestPath, updatedContent);
            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "manifestPath", manifestPath },
                { "name", name },
                { "version", version }
            };
        }

        private static int FindMatchingBrace(string content, int startIndex)
        {
            var depth = 0;
            var inString = false;
            for (var index = startIndex; index < content.Length; index += 1)
            {
                var character = content[index];
                if (inString)
                {
                    if (character == '\\')
                    {
                        index += 1;
                        continue;
                    }

                    if (character == '"')
                    {
                        inString = false;
                    }

                    continue;
                }

                if (character == '"')
                {
                    inString = true;
                    continue;
                }

                if (character == '{')
                {
                    depth += 1;
                    continue;
                }

                if (character == '}')
                {
                    depth -= 1;
                    if (depth == 0)
                    {
                        return index;
                    }
                }
            }

            return -1;
        }
    }
}
