using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityAgenticTools.Commands;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class LogsAndWaitTests
    {
        [Test]
        public void LogsTail_ReturnsLoggedEntry_WithLeanDefaultShape()
        {
            var marker = $"agentic-logs-{Guid.NewGuid():N}";
            Debug.Log(marker);

            var result = Registry.Run("logs.tail", $"[50, \"\", \"{marker}\"]") as Dictionary<string, object>;

            Assert.That(result, Is.Not.Null);
            Assert.That((int)result["count"], Is.GreaterThanOrEqualTo(1));

            var logs = result["logs"] as Dictionary<string, object>[];
            Assert.That(logs, Is.Not.Null);
            Assert.That(logs[0]["message"] as string, Does.Contain(marker));
            Assert.That(logs[0].ContainsKey("stackTrace"), Is.False,
                "stack traces are opt-in on the logs.tail surface");
        }

        [Test]
        public void LogsTail_ErrorFilter_MatchesTheErrorFamily()
        {
            var marker = $"agentic-error-{Guid.NewGuid():N}";
            LogAssert.Expect(LogType.Error, marker);
            Debug.LogError(marker);

            var asError = Registry.Run("logs.tail", $"[50, \"error\", \"{marker}\"]") as Dictionary<string, object>;
            Assert.That(asError, Is.Not.Null);
            Assert.That((int)asError["count"], Is.GreaterThanOrEqualTo(1));

            var asWarning = Registry.Run("logs.tail", $"[50, \"warning\", \"{marker}\"]") as Dictionary<string, object>;
            Assert.That(asWarning, Is.Not.Null);
            Assert.That(asWarning["count"], Is.EqualTo(0));
        }

        [Test]
        public void LogsClear_EmptiesBufferAndNativeConsole()
        {
            var marker = $"agentic-clear-{Guid.NewGuid():N}";
            Debug.Log(marker);

            var cleared = Registry.Run("logs.clear") as Dictionary<string, object>;
            Assert.That(cleared, Is.Not.Null);
            Assert.That(cleared["success"], Is.EqualTo(true));

            var after = Registry.Run("logs.tail", $"[50, \"\", \"{marker}\"]") as Dictionary<string, object>;
            Assert.That(after, Is.Not.Null);
            Assert.That(after["count"], Is.EqualTo(0),
                "logs.tail re-reads the native console, so clear must clear it too");
        }

        [Test]
        public async Task WaitFor_Delay_CompletesThroughTheRegistry()
        {
            var invoked = Registry.Run("wait.for", "[\"delay\", \"\", \"\", \"\", 1000, 50]");
            var task = invoked as Task<object>;
            Assert.That(task, Is.Not.Null, "wait.for should invoke UI.Wait and surface its task");

            var result = await task as Dictionary<string, object>;
            Assert.That(result, Is.Not.Null);
            Assert.That(result["success"], Is.EqualTo(true));
            Assert.That(result["waited"], Is.EqualTo(50));
        }

        [Test]
        public void WaitFor_UnknownCondition_FaultsWithArgumentException()
        {
            var task = Registry.Run("wait.for", "[\"never\"]") as Task<object>;
            Assert.That(task, Is.Not.Null);
            Assert.That(task.IsFaulted, Is.True);

            var inner = task.Exception?.InnerException;
            Assert.That(inner, Is.InstanceOf<ArgumentException>());
            Assert.That(inner?.Message, Does.Contain("Unknown wait condition"));
        }
    }
}
