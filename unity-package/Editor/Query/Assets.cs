using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;

namespace UnityAgenticTools.Query
{
    public static class Assets
    {
        public static object Find(string filter = "", string foldersCsv = "Assets", int maxResults = 100)
        {
            var folders = SplitFolders(foldersCsv);
            var guids = AssetDatabase.FindAssets(filter ?? string.Empty, folders);
            var results = new List<object>();
            var limit = Math.Max(1, maxResults);

            foreach (var guid in guids.Take(limit))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                results.Add(new Dictionary<string, object>
                {
                    { "guid", guid },
                    { "path", path },
                    { "type", AssetDatabase.GetMainAssetTypeAtPath(path)?.FullName ?? string.Empty }
                });
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "filter", filter ?? string.Empty },
                { "count", results.Count },
                { "truncated", guids.Length > results.Count },
                { "assets", results.ToArray() }
            };
        }

        public static object Info(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                throw new ArgumentException("Missing required parameter: assetPath");
            }

            var asset = AssetDatabase.LoadMainAssetAtPath(assetPath);
            if (asset == null)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", $"Asset not found at {assetPath}." }
                };
            }

            var importer = AssetImporter.GetAtPath(assetPath);
            return new Dictionary<string, object>
            {
                { "success", true },
                { "path", assetPath },
                { "guid", AssetDatabase.AssetPathToGUID(assetPath) },
                { "name", asset.name },
                { "type", asset.GetType().FullName },
                { "importer", importer?.GetType().FullName ?? string.Empty }
            };
        }

        private static string[] SplitFolders(string foldersCsv)
        {
            var rawFolders = string.IsNullOrWhiteSpace(foldersCsv)
                ? new[] { "Assets" }
                : foldersCsv.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

            return rawFolders
                .Select(folder => folder.Trim())
                .Where(folder => folder.Length > 0)
                .ToArray();
        }
    }
}
