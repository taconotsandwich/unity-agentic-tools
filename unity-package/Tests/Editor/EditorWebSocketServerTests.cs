using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using UnityAgenticTools.Bridge.Settings;
using UnityAgenticTools.Bridge.Transport;
using UnityEngine;
using UnityEngine.TestTools;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class EditorWebSocketServerTests
    {
        [Test]
        public void PreferredPort_DefaultsToAutomaticSelection()
        {
            // A second instance of a ScriptableSingleton logs an error once anything has
            // touched .instance. Reading the real singleton instead is not an option: its
            // FilePath is the shared preferences folder, so the assertion would depend on
            // the developer's own Unity settings.
            bool ignoring = LogAssert.ignoreFailingMessages;
            LogAssert.ignoreFailingMessages = true;
            var settings = ScriptableObject.CreateInstance<EditorServerSettings>();
            try
            {
                Assert.That(settings.preferredPort, Is.Null);
            }
            finally
            {
                Object.DestroyImmediate(settings);
                LogAssert.ignoreFailingMessages = ignoring;
            }
        }

        [Test]
        public void CandidatePorts_NoPreference_ScansAutomaticRangeInOrder()
        {
            Assert.That(
                GetCandidatePorts(null),
                Is.EqualTo(Enumerable.Range(53782, 10)));
        }

        [Test]
        public void CandidatePorts_ManualPreference_TriesPreferenceBeforeAutomaticRange()
        {
            var candidates = GetCandidatePorts(62000);

            Assert.That(candidates[0], Is.EqualTo(62000));
            Assert.That(candidates.Skip(1), Is.EqualTo(Enumerable.Range(53782, 10)));
        }

        [Test]
        public void CandidatePorts_PreferenceInsideAutomaticRange_IsNotDuplicated()
        {
            var candidates = GetCandidatePorts(53785);

            Assert.That(candidates[0], Is.EqualTo(53785));
            Assert.That(candidates.Count, Is.EqualTo(10));
            Assert.That(candidates.Distinct().Count(), Is.EqualTo(10));
        }

        private static IReadOnlyList<int> GetCandidatePorts(int? preferredPort)
        {
            var method = typeof(EditorWebSocketServer).GetMethod(
                "GetCandidatePorts",
                BindingFlags.NonPublic | BindingFlags.Static,
                null,
                new[] { typeof(int?) },
                null);

            Assert.That(method, Is.Not.Null);
            var candidates = method.Invoke(null, new object[] { preferredPort }) as IEnumerable<int>;
            Assert.That(candidates, Is.Not.Null);
            return candidates.ToArray();
        }
    }
}
