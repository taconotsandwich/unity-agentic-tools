using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using UnityAgenticTools.Bridge.Settings;
using UnityAgenticTools.Bridge.Transport;
using UnityEngine;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class EditorWebSocketServerTests
    {
        [Test]
        public void PreferredPort_DefaultsToAutomaticSelection()
        {
            var settings = ScriptableObject.CreateInstance<EditorServerSettings>();
            try
            {
                Assert.That(settings.preferredPort, Is.Null);
            }
            finally
            {
                Object.DestroyImmediate(settings);
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
            Assert.That(candidates, Has.Count.EqualTo(10));
            Assert.That(candidates.Distinct(), Has.Count.EqualTo(10));
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
