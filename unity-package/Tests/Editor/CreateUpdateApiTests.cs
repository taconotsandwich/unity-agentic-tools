using System;
using System.IO;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityAgenticTools.Bridge.Transport;
using UnityAgenticTools.Create;
using UnityAgenticTools.Update;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class CreateUpdateApiTests
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
        public void Create_PrefabInstance_CreatesResolvableSceneObject()
        {
            var scenePath = CreateScene("PrefabInstanceScene.unity");
            var prefabPath = CreatePrefab("AppRoot.prefab");

            var result = Prefabs.PrefabInstance(scenePath, prefabPath) as System.Collections.Generic.Dictionary<string, object>;

            Assert.That(result, Is.Not.Null);
            Assert.That(result["success"], Is.EqualTo(true));

            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var appRoot = GameObject.Find("AppRoot");
            Assert.That(appRoot, Is.Not.Null);
            Assert.That(PrefabUtility.IsPartOfPrefabInstance(appRoot), Is.True);
        }

        [Test]
        public async Task Dispatch_Invoke_CreateScenesGameObject_UsesHierarchyPathParent()
        {
            var scenePath = CreateScene("CreateGameObjectScene.unity", scene =>
            {
                new GameObject("Root");
                EditorSceneManager.MarkSceneDirty(scene);
            });

            MessageDispatcher.Reset();
            var request = BuildInvokeRequest(
                "create-1",
                "UnityAgenticTools.Create.Scenes",
                "GameObject",
                scenePath,
                "Child",
                "Root");

            var response = await MessageDispatcher.Dispatch(request);
            Assert.That(response, Does.Contain("\"success\":true"));

            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Assert.That(GameObject.Find("Root/Child"), Is.Null);
            var child = GameObject.Find("Child");
            Assert.That(child, Is.Not.Null);
            Assert.That(child.transform.parent, Is.Not.Null);
            Assert.That(child.transform.parent.name, Is.EqualTo("Root"));
        }

        [Test]
        public void Update_RejectsAmbiguousHierarchyPath()
        {
            var scenePath = CreateScene("AmbiguousScene.unity", scene =>
            {
                var root = new GameObject("Root");
                new GameObject("Child").transform.SetParent(root.transform, false);
                new GameObject("Child").transform.SetParent(root.transform, false);
                EditorSceneManager.MarkSceneDirty(scene);
            });

            var error = Assert.Throws<InvalidOperationException>(() =>
                Objects.Transform(scenePath, "Root/Child", "1,2,3"));

            Assert.That(error.Message, Does.Contain("ambiguous"));
        }

        [Test]
        public void Update_Component_UsesComponentIndex()
        {
            var scenePath = CreateScene("ComponentIndexScene.unity", scene =>
            {
                var root = new GameObject("Root");
                root.AddComponent<BoxCollider>();
                root.AddComponent<BoxCollider>();
                EditorSceneManager.MarkSceneDirty(scene);
            });

            var result = Objects.Component(
                scenePath,
                "Root",
                "BoxCollider",
                1,
                "m_IsTrigger",
                "true") as System.Collections.Generic.Dictionary<string, object>;

            Assert.That(result, Is.Not.Null);
            Assert.That(result["success"], Is.EqualTo(true));

            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var colliders = GameObject.Find("Root").GetComponents<BoxCollider>();
            Assert.That(colliders, Has.Length.EqualTo(2));
            Assert.That(colliders[0].isTrigger, Is.False);
            Assert.That(colliders[1].isTrigger, Is.True);
        }

        [Test]
        public async Task Dispatch_Invoke_UpdateSerializedBatchComponents_ParsesJsonPayload()
        {
            var scenePath = CreateScene("BatchScene.unity", scene =>
            {
                var root = new GameObject("Root");
                root.AddComponent<BoxCollider>();
                EditorSceneManager.MarkSceneDirty(scene);
            });

            MessageDispatcher.Reset();
            var editsJson = "[{\"gameObjectPath\":\"Root\",\"componentType\":\"BoxCollider\",\"componentIndex\":0,\"propertyPath\":\"m_IsTrigger\",\"value\":\"true\"}]";
            var request = BuildInvokeRequest(
                "batch-1",
                "UnityAgenticTools.Update.Serialized",
                "BatchComponents",
                scenePath,
                editsJson);

            var response = await MessageDispatcher.Dispatch(request);
            Assert.That(response, Does.Contain("\"success\":true"));

            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            var collider = GameObject.Find("Root").GetComponent<BoxCollider>();
            Assert.That(collider.isTrigger, Is.True);
        }

        [Test]
        public async Task Dispatch_Invoke_UtilHierarchySnapshot_UsesNewNamespace()
        {
            var scenePath = CreateScene("HierarchyScene.unity", scene =>
            {
                new GameObject("Root");
                EditorSceneManager.MarkSceneDirty(scene);
            });

            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            MessageDispatcher.Reset();

            var request = BuildInvokeRequest(
                "hierarchy-1",
                "UnityAgenticTools.Util.Hierarchy",
                "Snapshot",
                "1",
                "false");

            var response = await MessageDispatcher.Dispatch(request);
            Assert.That(response, Does.Contain("\"success\":true").Or.Contain("\"scene\""));
            Assert.That(response, Does.Contain("Root"));
        }

        [Test]
        public async Task Dispatch_Invoke_OldApiNamespace_ReturnsTypeNotFound()
        {
            MessageDispatcher.Reset();

            var request = BuildInvokeRequest(
                "old-api-1",
                "UnityAgenticTools.API.CreateAPI",
                "GameObject",
                "Assets/Scenes/Main.unity",
                "Child");

            var response = await MessageDispatcher.Dispatch(request);
            Assert.That(response, Does.Contain("Type not found"));
        }

        private string CreateScene(string fileName, Action<Scene> setup = null)
        {
            var scenePath = $"{_assetFolderPath}/{fileName}";
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            setup?.Invoke(scene);
            Assert.That(EditorSceneManager.SaveScene(scene, scenePath), Is.True);
            AssetDatabase.Refresh();
            return scenePath;
        }

        private string CreatePrefab(string fileName)
        {
            var prefabPath = $"{_assetFolderPath}/{fileName}";
            var root = new GameObject("AppRoot");
            root.AddComponent<BoxCollider>();
            try
            {
                var saved = PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
                Assert.That(saved, Is.Not.Null);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }

            AssetDatabase.Refresh();
            return prefabPath;
        }

        private string BuildInvokeRequest(string id, string typeName, string memberName, params string[] args)
        {
            return "{"
                + $"\"jsonrpc\":\"2.0\",\"id\":\"{EscapeJson(id)}\",\"method\":\"editor.invoke\","
                + "\"params\":{"
                + $"\"type\":\"{EscapeJson(typeName)}\","
                + $"\"member\":\"{EscapeJson(memberName)}\","
                + $"\"args\":\"{EscapeJson(BuildStringArrayJson(args))}\""
                + "}"
                + "}";
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
                .Replace("\n", "\\n");
        }

        private static string ToAbsolutePath(string assetPath)
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(projectRoot, assetPath);
        }
    }
}
