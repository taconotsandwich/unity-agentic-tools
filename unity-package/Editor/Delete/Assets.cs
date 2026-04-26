using System;
using System.Collections.Generic;
using UnityEditor;

namespace UnityAgenticTools.Delete
{
    public static class Assets
    {
        public static object Asset(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                throw new ArgumentException("Missing required parameter: assetPath");
            }

            if (AssetDatabase.LoadMainAssetAtPath(assetPath) == null)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", $"Asset not found at {assetPath}." }
                };
            }

            var deleted = AssetDatabase.DeleteAsset(assetPath);
            AssetDatabase.Refresh();

            return new Dictionary<string, object>
            {
                { "success", deleted },
                { "assetPath", assetPath }
            };
        }
    }
}
