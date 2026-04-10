using NUnit.Framework;
using UnityAgenticTools.Server;
using UnityEngine;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class WebSocketFramingTests
    {
        [Test]
        public void JsonRpcParser_ParseRequest_ExtractsMethodAndId()
        {
            var json = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"editor.playMode.getState\",\"params\":{}}";
            var request = JsonRpcParser.ParseRequest(json);

            Assert.AreEqual("1", request.Id);
            Assert.AreEqual("editor.playMode.getState", request.Method);
        }

        [Test]
        public void JsonRpcParser_ParseRequest_ExtractsStringParams()
        {
            var json = "{\"jsonrpc\":\"2.0\",\"id\":\"2\",\"method\":\"editor.scene.open\",\"params\":{\"path\":\"Assets/Scenes/Main.unity\",\"additive\":false}}";
            var request = JsonRpcParser.ParseRequest(json);

            Assert.AreEqual("2", request.Id);
            Assert.AreEqual("editor.scene.open", request.Method);
            Assert.AreEqual("Assets/Scenes/Main.unity", request.Params["path"]);
            Assert.AreEqual(false, request.Params["additive"]);
        }

        [Test]
        public void JsonRpcParser_ParseRequest_HandlesNumericId()
        {
            var json = "{\"jsonrpc\":\"2.0\",\"id\":42,\"method\":\"editor.assets.refresh\"}";
            var request = JsonRpcParser.ParseRequest(json);

            Assert.AreEqual("42", request.Id);
            Assert.AreEqual("editor.assets.refresh", request.Method);
        }

        [Test]
        public void JsonRpcParser_ParseRequest_HandlesMissingParams()
        {
            var json = "{\"jsonrpc\":\"2.0\",\"id\":\"3\",\"method\":\"editor.console.clear\"}";
            var request = JsonRpcParser.ParseRequest(json);

            Assert.AreEqual("3", request.Id);
            Assert.AreEqual("editor.console.clear", request.Method);
            Assert.IsNotNull(request.Params);
            Assert.AreEqual(0, request.Params.Count);
        }

        [Test]
        public void JsonRpcParser_BuildResult_ProducesValidJson()
        {
            var result = JsonRpcParser.BuildResult("1", new System.Collections.Generic.Dictionary<string, object>
            {
                { "state", "Playing" },
                { "isPlaying", true }
            });

            Assert.That(result, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(result, Does.Contain("\"id\":\"1\""));
            Assert.That(result, Does.Contain("\"state\":\"Playing\""));
            Assert.That(result, Does.Contain("\"isPlaying\":true"));
        }

        [Test]
        public void JsonRpcParser_BuildError_ProducesValidJson()
        {
            var error = JsonRpcParser.BuildError("5", -32601, "Method not found");

            Assert.That(error, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(error, Does.Contain("\"id\":\"5\""));
            Assert.That(error, Does.Contain("\"code\":-32601"));
            Assert.That(error, Does.Contain("\"message\":\"Method not found\""));
        }

        [Test]
        public void JsonRpcParser_BuildNotification_HasNoId()
        {
            var notification = JsonRpcParser.BuildNotification("editor.event.playModeChanged",
                new System.Collections.Generic.Dictionary<string, object>
                {
                    { "state", "Playing" }
                });

            Assert.That(notification, Does.Contain("\"jsonrpc\":\"2.0\""));
            Assert.That(notification, Does.Contain("\"method\":\"editor.event.playModeChanged\""));
            Assert.That(notification, Does.Not.Contain("\"id\""));
        }

        [Test]
        public void JsonRpcParser_SerializeValue_HandlesAllTypes()
        {
            Assert.AreEqual("null", JsonRpcParser.SerializeValue(null));
            Assert.AreEqual("\"hello\"", JsonRpcParser.SerializeValue("hello"));
            Assert.AreEqual("true", JsonRpcParser.SerializeValue(true));
            Assert.AreEqual("false", JsonRpcParser.SerializeValue(false));
            Assert.AreEqual("42", JsonRpcParser.SerializeValue(42));
        }

        [Test]
        public void JsonRpcParser_SerializeValue_EscapesStrings()
        {
            var result = JsonRpcParser.SerializeValue("line1\nline2\ttab\"quoted\"");
            Assert.AreEqual("\"line1\\nline2\\ttab\\\"quoted\\\"\"", result);
        }

        [Test]
        public void JsonRpcParser_ParseRequest_HandlesIntegerParams()
        {
            var json = "{\"jsonrpc\":\"2.0\",\"id\":\"10\",\"method\":\"editor.console.getLogs\",\"params\":{\"count\":25}}";
            var request = JsonRpcParser.ParseRequest(json);

            Assert.AreEqual(25, request.Params["count"]);
        }

        [Test]
        public void JsonRpcParser_SerializeValue_SerializesGameObjectSafely()
        {
            var gameObject = new GameObject("AppRoot");
            try
            {
                var result = JsonRpcParser.SerializeValue(gameObject);
                Assert.That(result, Does.Contain("\"name\":\"AppRoot\""));
                Assert.That(result, Does.Contain("\"type\":\"GameObject\""));
                Assert.That(result, Does.Contain("\"path\":\"AppRoot\""));
                Assert.That(result, Does.Contain("\"instanceId\":"));
                Assert.That(result, Does.Not.Contain("\"transform\""));
            }
            finally
            {
                Object.DestroyImmediate(gameObject);
            }
        }

        [Test]
        public void JsonRpcParser_SerializeValue_SerializesComponentSafely()
        {
            var gameObject = new GameObject("AppRoot");
            var component = gameObject.AddComponent<BoxCollider>();
            try
            {
                var result = JsonRpcParser.SerializeValue(component);
                Assert.That(result, Does.Contain("\"name\":\"BoxCollider\""));
                Assert.That(result, Does.Contain("\"type\":\"BoxCollider\""));
                Assert.That(result, Does.Contain("\"gameObjectName\":\"AppRoot\""));
                Assert.That(result, Does.Contain("\"path\":\"AppRoot\""));
                Assert.That(result, Does.Not.Contain("\"gameObject\":{"));
            }
            finally
            {
                Object.DestroyImmediate(gameObject);
            }
        }

        [Test]
        public void JsonRpcParser_NormalizeValueForTransport_AllowsWorkerThreadSerialization()
        {
            var gameObject = new GameObject("AppRoot");
            try
            {
                var envelope = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "success", true },
                    { "result", gameObject }
                };

                var normalized = JsonRpcParser.NormalizeValueForTransport(envelope);
                var result = System.Threading.Tasks.Task.Run(() => JsonRpcParser.SerializeValue(normalized))
                    .GetAwaiter()
                    .GetResult();

                Assert.That(result, Does.Contain("\"success\":true"));
                Assert.That(result, Does.Contain("\"type\":\"GameObject\""));
                Assert.That(result, Does.Contain("\"name\":\"AppRoot\""));
                Assert.That(result, Does.Contain("\"path\":\"AppRoot\""));
            }
            finally
            {
                Object.DestroyImmediate(gameObject);
            }
        }

        [Test]
        public void JsonRpcParser_IsTransportSafeValue_RecognizesNormalizedPayloads()
        {
            var payload = new System.Collections.Generic.Dictionary<string, object>
            {
                { "success", true },
                { "result", new System.Collections.Generic.Dictionary<string, object>
                    {
                        { "type", "GameObject" },
                        { "name", "AppRoot" },
                        { "instanceId", 42 }
                    }
                }
            };

            Assert.That(JsonRpcParser.IsTransportSafeValue(payload), Is.True);
        }

        [Test]
        public void JsonRpcParser_IsTransportSafeValue_RejectsRawUnityObjects()
        {
            var gameObject = new GameObject("AppRoot");
            try
            {
                var payload = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "success", true },
                    { "result", gameObject }
                };

                Assert.That(JsonRpcParser.IsTransportSafeValue(payload), Is.False);
            }
            finally
            {
                Object.DestroyImmediate(gameObject);
            }
        }
    }
}
