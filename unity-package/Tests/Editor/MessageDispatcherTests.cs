using System.Collections.Generic;
using System.Threading.Tasks;
using NUnit.Framework;
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
