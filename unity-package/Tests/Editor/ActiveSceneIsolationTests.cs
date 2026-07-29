using System;
using System.Collections.Generic;
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
    /// The command surface must resolve its target from the caller's argument,
    /// never from whichever scene the editor has active, and must not write to
    /// that scene on the way past.
    ///
    /// Every test here starts from an untitled scene on purpose. That is what a
    /// fresh editor and every batchmode run begins with, and it is the state
    /// EditorSceneManager.NewScene(..., Additive) refuses outright -- which is
    /// how create.scene used to fail for reasons that had nothing to do with the
    /// path it was given.
    /// </summary>
    [TestFixture]
    public class ActiveSceneIsolationTests
    {
        private string _assetFolderPath;

        [SetUp]
        public void SetUp()
        {
            Directory.CreateDirectory(Path.Combine(Application.dataPath, "UnityAgenticToolsTests"));
            AssetDatabase.Refresh();

            _assetFolderPath = $"Assets/UnityAgenticToolsTests/{Guid.NewGuid():N}";
            Directory.CreateDirectory(ToAbsolutePath(_assetFolderPath));
            AssetDatabase.Refresh();

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
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
        public void CreateScene_FromUntitledScene_ProducesALoadableEmptyScene()
        {
            var scenePath = $"{_assetFolderPath}/Empty.unity";
            Assert.That(SceneManager.GetActiveScene().path, Is.Empty, "This test is only meaningful from an untitled scene.");

            var result = Run("create.scene", scenePath);

            Assert.That(result["includeDefaults"], Is.EqualTo(false));
            Assert.That(AssetDatabase.LoadAssetAtPath<SceneAsset>(scenePath), Is.Not.Null);

            var guid = AssetDatabase.AssetPathToGUID(scenePath);
            Assert.That(guid, Is.Not.Empty);
            Assert.That(guid, Is.Not.EqualTo(AssetDatabase.AssetPathToGUID(TemplatePath())),
                "The copy must get its own guid, or the template and the new scene are the same asset.");

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Assert.That(scene.IsValid(), Is.True);
            Assert.That(scene.GetRootGameObjects(), Is.Empty);
        }

        [Test]
        public void CreateScene_WithDefaults_AddsACameraAndALight()
        {
            var scenePath = $"{_assetFolderPath}/Defaults.unity";

            var result = Run("create.scene", scenePath, "true");
            Assert.That(result["includeDefaults"], Is.EqualTo(true));

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var roots = scene.GetRootGameObjects();
            Assert.That(roots, Has.Length.EqualTo(2));

            var camera = FindRoot(roots, "Main Camera");
            Assert.That(camera.GetComponent<Camera>(), Is.Not.Null);
            Assert.That(camera.GetComponent<AudioListener>(), Is.Not.Null);
            Assert.That(camera.tag, Is.EqualTo("MainCamera"));
            Assert.That(camera.transform.position, Is.EqualTo(new Vector3(0f, 1f, -10f)));

            var light = FindRoot(roots, "Directional Light");
            Assert.That(light.GetComponent<Light>(), Is.Not.Null);
            Assert.That(light.GetComponent<Light>().type, Is.EqualTo(LightType.Directional));
        }

        /// <summary>
        /// The regression test for the whole class of bug: creating an asset is
        /// not allowed to touch what the user has open.
        /// </summary>
        [Test]
        public void CreateSceneAndPrefab_LeaveTheActiveSceneUntouched()
        {
            var before = SceneManager.GetActiveScene();
            var loadedBefore = SceneManager.sceneCount;
            Assert.That(before.isDirty, Is.False, "The fixture starts on a clean untitled scene.");

            Run("create.scene", $"{_assetFolderPath}/Untouched.unity");
            Run("create.prefab", $"{_assetFolderPath}/Untouched.prefab", "Widget");

            var after = SceneManager.GetActiveScene();
            Assert.That(after, Is.EqualTo(before), "The active scene changed identity.");
            Assert.That(after.isDirty, Is.False, "An asset-creation command dirtied the open scene.");
            Assert.That(after.GetRootGameObjects(), Is.Empty, "Something was written into the open scene.");
            Assert.That(SceneManager.sceneCount, Is.EqualTo(loadedBefore), "A scene was left open.");
        }

        [Test]
        public void CreateGameObject_InAPrefab_LeavesTheActiveSceneUntouched()
        {
            var prefabPath = $"{_assetFolderPath}/Nested.prefab";
            var rootName = Run("create.prefab", prefabPath, "Root")["name"] as string;
            Run("create.gameobject", prefabPath, "Child", rootName);

            var active = SceneManager.GetActiveScene();
            Assert.That(active.isDirty, Is.False);
            Assert.That(active.GetRootGameObjects(), Is.Empty);

            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            Assert.That(prefab.name, Is.EqualTo(rootName),
                "create.prefab must report the name Unity actually wrote, or the hierarchy path it implies does not resolve.");
            Assert.That(prefab.transform.childCount, Is.EqualTo(1));
            Assert.That(prefab.transform.GetChild(0).name, Is.EqualTo("Child"));
        }

        [Test]
        public void SceneHierarchy_ReportsEveryLoadedScene()
        {
            var firstPath = $"{_assetFolderPath}/First.unity";
            var secondPath = $"{_assetFolderPath}/Second.unity";
            Run("create.scene", firstPath);
            Run("create.scene", secondPath);
            Run("create.gameobject", firstPath, "InFirst");
            Run("create.gameobject", secondPath, "InSecond");

            EditorSceneManager.OpenScene(firstPath, OpenSceneMode.Single);
            EditorSceneManager.OpenScene(secondPath, OpenSceneMode.Additive);

            var snapshot = Run("scene.hierarchy");
            var scenePaths = CollectStrings(snapshot["scenes"], "path");
            Assert.That(scenePaths, Is.EquivalentTo(new[] { firstPath, secondPath }),
                "A snapshot that reads the active scene reports only one of two loaded scenes.");

            var roots = snapshot["tree"] as object[];
            Assert.That(CollectStrings(roots, "name"), Is.EquivalentTo(new[] { "InFirst", "InSecond" }));
            Assert.That(CollectStrings(roots, "scene"), Is.EquivalentTo(new[] { firstPath, secondPath }),
                "Roots must say which scene they came from, or a two-scene snapshot is ambiguous.");
        }

        [Test]
        public void SceneHierarchy_NarrowsToOneScenePath()
        {
            var firstPath = $"{_assetFolderPath}/OnlyFirst.unity";
            var secondPath = $"{_assetFolderPath}/OnlySecond.unity";
            Run("create.scene", firstPath);
            Run("create.scene", secondPath);
            Run("create.gameobject", secondPath, "Wanted");

            EditorSceneManager.OpenScene(firstPath, OpenSceneMode.Single);
            EditorSceneManager.OpenScene(secondPath, OpenSceneMode.Additive);

            var snapshot = Run("scene.hierarchy", "99", "false", "500", secondPath);
            Assert.That(CollectStrings(snapshot["scenes"], "path"), Is.EquivalentTo(new[] { secondPath }));
            Assert.That(CollectStrings(snapshot["tree"], "name"), Is.EquivalentTo(new[] { "Wanted" }));
        }

        [Test]
        public void SceneHierarchy_RejectsAnUnloadedScenePath()
        {
            var scenePath = $"{_assetFolderPath}/NotOpen.unity";
            Run("create.scene", scenePath);

            var error = Assert.Throws<ArgumentException>(
                () => Registry.Run("scene.hierarchy", BuildStringArrayJson("99", "false", "500", scenePath)));

            Assert.That(error.Message, Does.Contain(scenePath));
            Assert.That(error.Message, Does.Contain("Loaded scenes"),
                "The error has to say what is loaded, or the caller cannot tell what to pass instead.");
        }

        [Test]
        public void QueryObject_OnAPrefab_ReportsThePrefabPath()
        {
            var prefabPath = $"{_assetFolderPath}/Described.prefab";
            var rootName = Run("create.prefab", prefabPath, "Widget")["name"] as string;

            var described = Run("query.object", prefabPath, rootName);

            Assert.That(described["scene"], Is.EqualTo(prefabPath),
                "A prefab has no scene, and naming the active one points at a scene the object was never in.");
        }

        private static string TemplatePath()
        {
            return AssetDatabase.GUIDToAssetPath("0cdf943ee52643c5bacf32aa5f21fccc");
        }

        private static Dictionary<string, object> Run(string target, params string[] args)
        {
            var result = Registry.Run(target, BuildStringArrayJson(args)) as Dictionary<string, object>;
            Assert.That(result, Is.Not.Null, $"{target} returned no result payload.");
            return result;
        }

        private static GameObject FindRoot(GameObject[] roots, string name)
        {
            foreach (var root in roots)
            {
                if (root.name == name)
                {
                    return root;
                }
            }

            Assert.Fail($"No root GameObject named '{name}'.");
            return null;
        }

        private static string[] CollectStrings(object entries, string key)
        {
            var array = entries as object[];
            Assert.That(array, Is.Not.Null, "Expected an array payload.");

            var values = new List<string>();
            foreach (var entry in array)
            {
                var dictionary = entry as Dictionary<string, object>;
                Assert.That(dictionary, Is.Not.Null, "Expected a dictionary entry.");
                Assert.That(dictionary.ContainsKey(key), Is.True, $"Entry is missing \"{key}\".");
                values.Add(dictionary[key] as string);
            }

            return values.ToArray();
        }

        private static string BuildStringArrayJson(params string[] values)
        {
            var parts = new string[values.Length];
            for (var index = 0; index < values.Length; index += 1)
            {
                parts[index] = $"\"{values[index].Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
            }

            return "[" + string.Join(",", parts) + "]";
        }

        private static string ToAbsolutePath(string assetPath)
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(projectRoot, assetPath);
        }
    }
}
