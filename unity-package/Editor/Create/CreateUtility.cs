using System;
using System.IO;
using UnityEditor;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Create
{
    /// <summary>
    /// What more than one of Scenes, Prefabs, Assets, and Project needs. A
    /// helper used by exactly one of them belongs in that file instead -- this
    /// is a seam between the four, not a home for anything create-shaped.
    /// </summary>
    internal static class CreateUtility
    {
        internal static GameObject ResolveCreateParent(AssetMutationContext context, string parentPath)
        {
            var normalizedParentPath = MutationUtility.NormalizeHierarchyPath(parentPath);
            if (normalizedParentPath == string.Empty)
            {
                if (context.IsPrefabAsset)
                {
                    return context.PrefabRoot;
                }

                return null;
            }

            return MutationUtility.ResolveGameObject(context, normalizedParentPath);
        }

        internal static string NormalizeAssetPath(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                throw new ArgumentException("Missing required parameter: assetPath");
            }

            if (Path.IsPathRooted(assetPath))
            {
                var relativePath = FileUtil.GetProjectRelativePath(assetPath);
                if (!string.IsNullOrWhiteSpace(relativePath))
                {
                    return relativePath.Replace('\\', '/');
                }

                throw new InvalidOperationException(
                    $"Path \"{assetPath}\" is not inside the current Unity project.");
            }

            var normalizedPath = assetPath.Replace('\\', '/');
            if (!normalizedPath.StartsWith("Assets/", StringComparison.Ordinal) &&
                !normalizedPath.StartsWith("Packages/", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Path \"{assetPath}\" must be an asset-relative path under Assets/ or Packages/.");
            }

            return normalizedPath;
        }

        internal static string NormalizeFilesystemPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Missing required path parameter.");
            }

            if (Path.IsPathRooted(path))
            {
                return path;
            }

            var normalizedAssetPath = NormalizeAssetPath(path);
            return ToAbsolutePath(normalizedAssetPath);
        }

        internal static void EnsureNewAssetPath(string assetPath, string expectedExtension)
        {
            if (!assetPath.EndsWith(expectedExtension, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Output path must end with {expectedExtension}.");
            }

            if (File.Exists(ToAbsolutePath(assetPath)) || File.Exists(ToAbsolutePath(assetPath + ".meta")))
            {
                throw new InvalidOperationException(
                    $"Asset already exists at {assetPath}. Delete it first or choose a different path.");
            }
        }

        internal static void EnsureParentDirectory(string assetPath)
        {
            var directory = Path.GetDirectoryName(ToAbsolutePath(assetPath));
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }

        internal static string ToAbsolutePath(string assetPath)
        {
            return Path.Combine(GetProjectRoot(), assetPath);
        }

        internal static string GetProjectRoot()
        {
            var assetsDirectory = Directory.GetParent(Application.dataPath);
            if (assetsDirectory == null)
            {
                throw new InvalidOperationException("Could not determine the Unity project root.");
            }

            return assetsDirectory.FullName;
        }

        internal static string EscapeJsonString(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"");
        }
    }
}
