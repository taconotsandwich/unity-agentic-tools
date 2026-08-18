using System;
using System.IO;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityAgenticTools.Commands;

namespace UnityAgenticTools.Tests
{
    /// <summary>
    /// The default safe surface routes every mutation through Unity's own
    /// SerializedObject and AssetDatabase writers, so Unity emits the YAML rather
    /// than this package. These tests hold that claim to account: drive the
    /// surface through Registry.Run with payloads that would break a hand-rolled
    /// YAML writer, then make Unity re-parse what it wrote.
    /// </summary>
    [TestFixture]
    public class SafeSurfaceYamlTests
    {
        /// <summary>
        /// Every character class that terminates or re-scopes a YAML scalar, minus
        /// '/' which is the hierarchy path separator and so is a path concern
        /// rather than a serialization one.
        /// </summary>
        private const string HostileName = "odd: name #1 - [with] {braces} \"quoted\" 'single' & *anchor | > %tag @at `tick";

        private const string HostileMultilineName = "first line\nsecond: line\n  - indented";

        private string _assetFolderPath;

        [SetUp]
        public void SetUp()
        {
            Directory.CreateDirectory(Path.Combine(Application.dataPath, "UnityAgenticToolsTests"));
            AssetDatabase.Refresh();

            _assetFolderPath = $"Assets/UnityAgenticToolsTests/{Guid.NewGuid():N}";
            Directory.CreateDirectory(ToAbsolutePath(_assetFolderPath));
            AssetDatabase.Refresh();
        }

        [TearDown]
        public void TearDown()
        {
            if (!string.IsNullOrEmpty(_assetFolderPath))
            {
                AssetDatabase.DeleteAsset(_assetFolderPath);
                AssetDatabase.Refresh();
            }
        }

        [Test]
        public void SafeSurface_SceneMutations_ReimportWithValuesIntact()
        {
            var scenePath = $"{_assetFolderPath}/HostileScene.unity";

            Run("create.scene", scenePath);
            Run("create.gameobject", scenePath, "Root");
            Run("create.gameobject", scenePath, "Child", "Root");
            Run("create.component", scenePath, "Root", "BoxCollider");
            Run("create.component", scenePath, "Root/Child", "Rigidbody");
            Run("update.transform", scenePath, "Root", "1.5,-2.25,3", "0,90,0", "2,2,2");
            Run("update.component", scenePath, "Root", "BoxCollider", "0", "m_IsTrigger", "true");
            Run("update.batch", scenePath, BuildBatchEditsJson("Root/Child", "m_Name", HostileName));

            AssertReimports(scenePath);

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var root = FindRoot(scene, "Root");

            Assert.That(root.transform.localPosition, Is.EqualTo(new Vector3(1.5f, -2.25f, 3f)));
            Assert.That(root.transform.localScale, Is.EqualTo(new Vector3(2f, 2f, 2f)));
            Assert.That(root.GetComponent<BoxCollider>().isTrigger, Is.True);

            Assert.That(root.transform.childCount, Is.EqualTo(1));
            var child = root.transform.GetChild(0).gameObject;
            Assert.That(child.name, Is.EqualTo(HostileName), "A YAML metacharacter in a name did not survive the round trip.");
            Assert.That(child.GetComponent<Rigidbody>(), Is.Not.Null);
        }

        [Test]
        public void SafeSurface_NewlineInName_ReimportsUnchanged()
        {
            var scenePath = $"{_assetFolderPath}/MultilineScene.unity";

            Run("create.scene", scenePath);
            Run("create.gameobject", scenePath, "Plain");
            Run("update.object", scenePath, "Plain", "m_Name", HostileMultilineName);

            AssertReimports(scenePath);

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var roots = scene.GetRootGameObjects();

            Assert.That(roots, Has.Length.EqualTo(1));
            Assert.That(roots[0].name, Is.EqualTo(HostileMultilineName),
                "A newline in a name is the classic way to split one YAML scalar into several.");
        }

        [Test]
        public void SafeSurface_PrefabAndOverride_ReimportWithValuesIntact()
        {
            var prefabPath = $"{_assetFolderPath}/Widget.prefab";
            var scenePath = $"{_assetFolderPath}/WidgetScene.unity";

            Run("create.prefab", prefabPath, "Widget");
            Run("create.component", prefabPath, "Widget", "BoxCollider");
            Run("create.scene", scenePath);
            Run("create.prefab-instance", scenePath, prefabPath, string.Empty, HostileName);
            Run("update.prefab.override", scenePath, HostileName, "BoxCollider", "0", "m_IsTrigger", "true");

            AssertReimports(prefabPath);
            AssertReimports(scenePath);

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var instance = FindRoot(scene, HostileName);

            Assert.That(PrefabUtility.IsPartOfPrefabInstance(instance), Is.True);
            Assert.That(instance.GetComponent<BoxCollider>().isTrigger, Is.True);

            // The override has to be recorded against the instance, not baked into
            // the prefab asset, or the two files disagree about what was written.
            var prefabRoot = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            Assert.That(prefabRoot.GetComponent<BoxCollider>().isTrigger, Is.False);
        }

        private static void Run(string target, params string[] args)
        {
            var result = Registry.Run(target, BuildStringArrayJson(args)) as System.Collections.Generic.Dictionary<string, object>;

            Assert.That(result, Is.Not.Null, $"{target} returned no result payload.");
            Assert.That(result["success"], Is.EqualTo(true), $"{target} reported failure.");
        }

        /// <summary>
        /// Force Unity to re-read the file it just wrote. A malformed document
        /// fails to import, which both logs an error the test framework treats as
        /// a failure and leaves nothing to load.
        /// </summary>
        private static void AssertReimports(string assetPath)
        {
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);

            Assert.That(AssetDatabase.LoadMainAssetAtPath(assetPath), Is.Not.Null,
                $"Unity could not re-import {assetPath} after the safe surface wrote it.");

            var text = File.ReadAllText(ToAbsolutePath(assetPath));
            Assert.That(text, Does.StartWith("%YAML"),
                $"{assetPath} is no longer a text YAML document.");
        }

        private static GameObject FindRoot(Scene scene, string name)
        {
            foreach (var root in scene.GetRootGameObjects())
            {
                if (root.name == name)
                {
                    return root;
                }
            }

            Assert.Fail($"No root GameObject named '{name}' in {scene.path}.");
            return null;
        }

        private static string BuildBatchEditsJson(string gameObjectPath, string propertyPath, string value)
        {
            return "[{"
                + $"\"gameObjectPath\":\"{EscapeJson(gameObjectPath)}\","
                + $"\"propertyPath\":\"{EscapeJson(propertyPath)}\","
                + $"\"value\":\"{EscapeJson(value)}\""
                + "}]";
        }

        private static string BuildStringArrayJson(params string[] values)
        {
            var parts = new string[values.Length];
            for (var index = 0; index < values.Length; index += 1)
            {
                parts[index] = $"\"{EscapeJson(values[index])}\"";
            }

            return "[" + string.Join(",", parts) + "]";
        }

        private static string EscapeJson(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n")
                .Replace("\t", "\\t");
        }

        private static string ToAbsolutePath(string assetPath)
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(projectRoot, assetPath);
        }
    }
}
