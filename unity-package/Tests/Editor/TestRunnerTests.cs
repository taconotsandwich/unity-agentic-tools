using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using UnityEditor;
using AgenticTestRunner = UnityAgenticTools.Util.TestRunner;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class TestRunnerTests
    {
        private const string RunStateSessionKey = "UnityAgenticTools.TestRunner.LatestRun";

        private static readonly FieldInfo CollectorField = typeof(AgenticTestRunner).GetField(
            "_lastCollector",
            BindingFlags.NonPublic | BindingFlags.Static);

        private static readonly MethodInfo RestorePendingRunMethod = typeof(AgenticTestRunner).GetMethod(
            "RestorePendingRun",
            BindingFlags.NonPublic | BindingFlags.Static);

        private static readonly MethodInfo DetachCollectorMethod = typeof(AgenticTestRunner).GetMethod(
            "DetachCollector",
            BindingFlags.NonPublic | BindingFlags.Static);

        [Test]
        public void GetResults_ReturnsPersistedRun_WhenCollectorReferenceIsLost()
        {
            Assert.That(CollectorField, Is.Not.Null);
            var previousCollector = CollectorField.GetValue(null);
            var previousState = SessionState.GetString(RunStateSessionKey, "");

            try
            {
                SessionState.SetString(
                    RunStateSessionKey,
                    "{\"hasRun\":true,\"runStarted\":true,\"completed\":true," +
                    "\"mode\":\"PlayMode\",\"filter\":\"Example\",\"passed\":1," +
                    "\"failed\":0,\"skipped\":0,\"duration\":0.25," +
                    "\"results\":[{\"name\":\"Example\",\"fullName\":\"Tests.Example\"," +
                    "\"status\":\"Passed\",\"duration\":0.25,\"message\":\"\"}]}");
                CollectorField.SetValue(null, null);

                var response = AgenticTestRunner.GetResults() as Dictionary<string, object>;

                Assert.That(response, Is.Not.Null);
                Assert.That(response["completed"], Is.EqualTo(true));
                Assert.That(response["passed"], Is.EqualTo(1));
                var results = response["results"] as Dictionary<string, object>[];
                Assert.That(results, Has.Length.EqualTo(1));
                Assert.That(results[0]["fullName"], Is.EqualTo("Tests.Example"));
            }
            finally
            {
                CollectorField.SetValue(null, previousCollector);
                RestoreSessionState(previousState);
            }
        }

        [Test]
        public void RestorePendingRun_RegistersOnlyOneCollector()
        {
            Assert.That(CollectorField, Is.Not.Null);
            Assert.That(RestorePendingRunMethod, Is.Not.Null);
            Assert.That(DetachCollectorMethod, Is.Not.Null);

            var previousCollector = CollectorField.GetValue(null);
            var previousState = SessionState.GetString(RunStateSessionKey, "");

            try
            {
                SessionState.SetString(
                    RunStateSessionKey,
                    "{\"hasRun\":true,\"runStarted\":true,\"completed\":false," +
                    "\"mode\":\"PlayMode\",\"filter\":\"(all)\",\"passed\":0," +
                    "\"failed\":0,\"skipped\":0,\"duration\":0,\"results\":[]}");
                CollectorField.SetValue(null, null);

                RestorePendingRunMethod.Invoke(null, null);
                var restoredCollector = CollectorField.GetValue(null);
                RestorePendingRunMethod.Invoke(null, null);

                Assert.That(restoredCollector, Is.Not.Null);
                Assert.That(CollectorField.GetValue(null), Is.SameAs(restoredCollector));
            }
            finally
            {
                DetachCollectorMethod.Invoke(null, null);
                CollectorField.SetValue(null, previousCollector);
                RestoreSessionState(previousState);
            }
        }

        private static void RestoreSessionState(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                SessionState.EraseString(RunStateSessionKey);
                return;
            }

            SessionState.SetString(RunStateSessionKey, json);
        }
    }
}
