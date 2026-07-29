using System.Collections.Generic;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityAgenticTools;
using UnityAgenticTools.Bridge.Transport;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class MessageDispatcherTests
    {
        [Test]
        public async Task Dispatch_InvalidMethod_ReturnsError()
        {
            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"nonexistent.method\"}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("-32601"));
            Assert.That(response, Does.Contain("Method not found"));
        }

        [Test]
        public void JsonRpcParser_UnsignedNumerics_SerializeAsNumbers()
        {
            const ulong size = 4096UL;
            const uint count = 42U;
            const ushort port = 53782;
            const byte flag = 7;

            Assert.That(JsonRpcParser.IsTransportSafeValue(size), Is.True, "ulong should be transport-safe");
            Assert.That(JsonRpcParser.IsTransportSafeValue(count), Is.True, "uint should be transport-safe");
            Assert.That(JsonRpcParser.IsTransportSafeValue(port), Is.True, "ushort should be transport-safe");
            Assert.That(JsonRpcParser.IsTransportSafeValue(flag), Is.True, "byte should be transport-safe");

            Assert.That(JsonRpcParser.NormalizeValueForTransport(size), Is.EqualTo(size));
            Assert.That(JsonRpcParser.NormalizeValueForTransport(count), Is.EqualTo(count));

            var serialized = JsonRpcParser.SerializeValue(size);
            Assert.That(serialized, Is.EqualTo("4096"),
                "ulong should serialize as a JSON number literal, not {} (was the BuildSummary.totalSize regression).");

            var summary = new Dictionary<string, object> { { "totalSize", size }, { "outputPath", "build.exe" } };
            Assert.That(JsonRpcParser.IsTransportSafeValue(summary), Is.True,
                "Dictionary holding unsigned numerics should be transport-safe end-to-end.");
            Assert.That(JsonRpcParser.SerializeValue(summary), Does.Contain("\"totalSize\":4096"));
        }

        [Test]
        public void JsonRpcParser_DeepContainerNesting_SurvivesNormalization()
        {
            const int levels = 40;
            var root = new Dictionary<string, object>();
            var current = root;
            for (var i = 0; i < levels; i++)
            {
                var child = new Dictionary<string, object>();
                current["children"] = new List<object> { child };
                current = child;
            }

            current["leaf"] = 42;

            Assert.That(JsonRpcParser.IsTransportSafeValue(root), Is.True,
                "Deep plain container trees are transport-safe (was capped at depth 8).");

            var cursor = JsonRpcParser.NormalizeValueForTransport(root) as Dictionary<string, object>;
            for (var i = 0; i < levels; i++)
            {
                Assert.That(cursor, Is.Not.Null, $"Level {i} should normalize to a dictionary, not ToString().");
                var children = cursor["children"] as List<object>;
                Assert.That(children, Is.Not.Null, $"Level {i} children should stay a list.");
                cursor = children[0] as Dictionary<string, object>;
            }

            Assert.That(cursor, Is.Not.Null);
            Assert.That(cursor["leaf"], Is.EqualTo(42));
            Assert.That(JsonRpcParser.SerializeValue(root), Does.Contain("\"leaf\":42"),
                "Serialization must reach the deepest node (was the Dictionary ToString hierarchy regression).");
        }

        [Test]
        public void JsonRpcParser_SelfReferencingContainer_DoesNotRecurseForever()
        {
            var cyclic = new Dictionary<string, object> { { "label", "root" } };
            cyclic["self"] = cyclic;

            Assert.That(JsonRpcParser.IsTransportSafeValue(cyclic), Is.False,
                "Cyclic payloads must be rejected by the fast path, not hang.");

            var normalized = JsonRpcParser.NormalizeValueForTransport(cyclic) as Dictionary<string, object>;
            Assert.That(normalized, Is.Not.Null);
            Assert.That(normalized["label"], Is.EqualTo("root"));
            Assert.That(normalized["self"], Is.EqualTo("<cyclic>"));
        }

        [Test]
        public void JsonRpcParser_SharedSiblingReference_SerializesBothOccurrences()
        {
            var shared = new Dictionary<string, object> { { "value", 7 } };
            var payload = new Dictionary<string, object> { { "first", shared }, { "second", shared } };

            Assert.That(JsonRpcParser.IsTransportSafeValue(payload), Is.True,
                "A DAG (shared reference without a cycle) is not a cycle.");

            var normalized = JsonRpcParser.NormalizeValueForTransport(payload) as Dictionary<string, object>;
            Assert.That(normalized, Is.Not.Null);
            Assert.That((normalized["first"] as Dictionary<string, object>)["value"], Is.EqualTo(7));
            Assert.That((normalized["second"] as Dictionary<string, object>)["value"], Is.EqualTo(7));
        }

        [Test]
        public async Task Dispatch_MissingMethod_ReturnsInvalidRequest()
        {
            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"1\"}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("-32600"));
            Assert.That(response, Does.Contain("Invalid Request"));
        }

        [Test]
        public async Task Dispatch_ValidPlayModeGetState_ReturnsResult()
        {
            MessageDispatcher.Reset();

            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"editor.playMode.getState\"}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"1\""));
            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Contain("\"state\""));
        }

        [Test]
        public async Task Dispatch_InvokeStaticProperty_ReturnsValue()
        {
            MessageDispatcher.Reset();

            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"4\",\"method\":\"editor.invoke\",\"params\":{\"type\":\"UnityEditor.EditorApplication\",\"member\":\"isCompiling\"}}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"4\""));
            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Contain("\"value\""));
        }

        [Test]
        public async Task Dispatch_InvokeCommandRegistryList_ReturnsBuiltInCommands()
        {
            MessageDispatcher.Reset();

            var request = BuildInvokeRequest(
                "registry-list-1",
                "UnityAgenticTools.Commands.Registry",
                "List",
                "create.gameobject",
                "false");

            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"registry-list-1\""));
            Assert.That(response, Does.Contain("\"create.gameobject\""));
            Assert.That(response, Does.Contain("\"UnityAgenticTools.Create.Scenes.GameObject\""));
        }

        [Test]
        public async Task Dispatch_InvokeCommandRegistryRun_CallsRawStaticProperty()
        {
            MessageDispatcher.Reset();

            var request = BuildInvokeRequest(
                "registry-run-1",
                "UnityAgenticTools.Commands.Registry",
                "Run",
                "UnityEditor.EditorApplication.isCompiling",
                "[]");

            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"registry-run-1\""));
            Assert.That(response, Does.Contain("\"success\":true"));
            Assert.That(response, Does.Contain("\"result\""));
        }

        [Test]
        public async Task Dispatch_InvokeCommandRegistryRun_CallsOverloadedRawStaticMethod()
        {
            MessageDispatcher.Reset();

            var request = BuildInvokeRequest(
                "registry-run-overload-1",
                "UnityAgenticTools.Commands.Registry",
                "Run",
                "UnityEditor.AssetDatabase.FindAssets",
                "[\"t:Scene\"]");

            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"registry-run-overload-1\""));
            Assert.That(response, Does.Contain("\"success\":true"));
            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Not.Contain("AmbiguousMatchException"));
        }

        private static string BuildInvokeRequest(string id, string typeName, string memberName, params string[] args)
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
    }
}
