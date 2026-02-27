using System.Collections.Generic;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityAgenticTools.Server;

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
        public async Task Dispatch_ValidAssetsGetStatus_ReturnsResult()
        {
            MessageDispatcher.Reset();

            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"2\",\"method\":\"editor.assets.getStatus\"}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"2\""));
            Assert.That(response, Does.Contain("\"result\""));
            Assert.That(response, Does.Contain("\"isCompiling\""));
        }

        [Test]
        public async Task Dispatch_ValidSceneGetActive_ReturnsResult()
        {
            MessageDispatcher.Reset();

            var request = "{\"jsonrpc\":\"2.0\",\"id\":\"3\",\"method\":\"editor.scene.getActive\"}";
            var response = await MessageDispatcher.Dispatch(request);

            Assert.That(response, Does.Contain("\"id\":\"3\""));
            Assert.That(response, Does.Contain("\"result\""));
        }
    }
}
