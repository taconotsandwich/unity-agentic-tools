using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityAgenticTools.Editor
{
    [Serializable]
    internal class ValidationManifest
    {
        public string[] targets = Array.Empty<string>();
    }

    public static class HeadlessValidator
    {
        private static readonly List<string> Errors = new List<string>();
        private static readonly List<string> Warnings = new List<string>();

        [MenuItem("Tools/Run Validation")]
        public static void RunValidation()
        {
            Errors.Clear();
            Warnings.Clear();
            Application.logMessageReceived += HandleLogMessage;

            try
            {
                Debug.Log("=== STARTING UNITY VALIDATION ===");

                string projectRoot = Path.GetDirectoryName(Application.dataPath) ?? throw new InvalidOperationException("Could not resolve project root.");
                string manifestPath = Path.Combine(projectRoot, "UATValidationTargets.json");
                ValidationManifest manifest = LoadManifest(manifestPath);

                if (manifest.targets.Length == 0)
                {
                    RecordError("Validation manifest did not contain any target assets.");
                    EmitSummaryAndExit();
                    return;
                }

                AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);

                foreach (string assetPath in manifest.targets)
                {
                    ValidateTarget(projectRoot, assetPath);
                }
            }
            catch (Exception ex)
            {
                RecordError($"Validator crashed: {ex.Message}");
                Debug.LogException(ex);
            }
            finally
            {
                Application.logMessageReceived -= HandleLogMessage;
            }

            EmitSummaryAndExit();
        }

        private static ValidationManifest LoadManifest(string manifestPath)
        {
            if (!File.Exists(manifestPath))
            {
                throw new FileNotFoundException($"Validation manifest not found: {manifestPath}");
            }

            string json = File.ReadAllText(manifestPath);
            ValidationManifest manifest = JsonUtility.FromJson<ValidationManifest>(json);

            if (manifest == null)
            {
                throw new InvalidOperationException("Validation manifest could not be parsed.");
            }

            return manifest;
        }

        private static void ValidateTarget(string projectRoot, string assetPath)
        {
            string absolutePath = Path.Combine(projectRoot, assetPath);
            Debug.Log($"Validating target: {assetPath}");

            if (!File.Exists(absolutePath))
            {
                RecordError($"Target asset is missing: {assetPath}");
                return;
            }

            try
            {
                if (assetPath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
                {
                    ValidateScene(assetPath);
                    return;
                }

                if (assetPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
                {
                    ValidatePrefab(assetPath);
                    return;
                }

                if (assetPath.StartsWith("ProjectSettings/", StringComparison.OrdinalIgnoreCase) ||
                    assetPath.StartsWith("Packages/", StringComparison.OrdinalIgnoreCase))
                {
                    // Unity parses these during editor startup; existence plus startup log checks are sufficient.
                    return;
                }

                UnityEngine.Object asset = AssetDatabase.LoadMainAssetAtPath(assetPath);
                if (asset == null)
                {
                    RecordError($"Unity could not load asset: {assetPath}");
                }
            }
            catch (Exception ex)
            {
                RecordError($"Exception while validating {assetPath}: {ex.Message}");
            }
        }

        private static void ValidateScene(string assetPath)
        {
            var scene = EditorSceneManager.OpenScene(assetPath, OpenSceneMode.Single);

            if (!scene.IsValid() || !scene.isLoaded)
            {
                RecordError($"Unity failed to open scene: {assetPath}");
                return;
            }

            EditorSceneManager.CloseScene(scene, true);
        }

        private static void ValidatePrefab(string assetPath)
        {
            GameObject prefabRoot = PrefabUtility.LoadPrefabContents(assetPath);

            if (prefabRoot == null)
            {
                RecordError($"Unity failed to load prefab: {assetPath}");
                return;
            }

            PrefabUtility.UnloadPrefabContents(prefabRoot);
        }

        private static void HandleLogMessage(string condition, string _stackTrace, LogType type)
        {
            if (condition.StartsWith("VALIDATION_ERROR:", StringComparison.Ordinal) ||
                condition.StartsWith("VALIDATION_WARNING:", StringComparison.Ordinal))
            {
                return;
            }

            if (type == LogType.Error || type == LogType.Assert || type == LogType.Exception)
            {
                RecordError(condition);
                return;
            }

            if (type == LogType.Warning)
            {
                RecordWarning(condition);
            }
        }

        private static void RecordError(string message)
        {
            if (!Errors.Contains(message))
            {
                Errors.Add(message);
            }
        }

        private static void RecordWarning(string message)
        {
            if (!Warnings.Contains(message))
            {
                Warnings.Add(message);
            }
        }

        private static void EmitSummaryAndExit()
        {
            Debug.Log("=== VALIDATION RESULTS ===");
            Debug.Log($"Errors: {Errors.Count}");
            Debug.Log($"Warnings: {Warnings.Count}");

            foreach (string error in Errors)
            {
                Debug.LogError($"VALIDATION_ERROR: {error}");
            }

            foreach (string warning in Warnings)
            {
                Debug.LogWarning($"VALIDATION_WARNING: {warning}");
            }

            Debug.Log("=== END VALIDATION ===");
            EditorApplication.Exit(Errors.Count > 0 ? 1 : 0);
        }
    }
}
