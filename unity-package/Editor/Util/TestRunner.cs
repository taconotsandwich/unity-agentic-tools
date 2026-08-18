using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.TestTools.TestRunner.Api;
using UnityAgenticTools;
using UnityAgenticTools.Bridge.Transport;
using UnityEngine;

namespace UnityAgenticTools.Util
{
    [InitializeOnLoad]
    public static class TestRunner
    {
        private const string RunStateSessionKey = "UnityAgenticTools.TestRunner.LatestRun";

        private static TestResultCollector _lastCollector;

        static TestRunner()
        {
            RestorePendingRun();
        }

        public static object Run(string mode = "editmode", string filter = null)
        {
            var testMode = TestMode.EditMode;
            if (mode.Equals("playmode", StringComparison.OrdinalIgnoreCase))
            {
                testMode = TestMode.PlayMode;
            }

            var api = ScriptableObject.CreateInstance<TestRunnerApi>();
            var executionFilter = new Filter { testMode = testMode };

            if (!string.IsNullOrEmpty(filter))
            {
                executionFilter.testNames = new[] { filter };
            }

            var runState = new TestRunState
            {
                hasRun = true,
                mode = testMode.ToString(),
                filter = filter ?? "(all)"
            };

            SaveState(runState);
            AttachCollector(new TestResultCollector(runState));

            try
            {
                api.Execute(new ExecutionSettings(executionFilter));
            }
            catch
            {
                DetachCollector();
                SessionState.EraseString(RunStateSessionKey);
                throw;
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "message", $"Test run started in {testMode} mode" },
                { "mode", testMode.ToString() },
                { "filter", filter ?? "(all)" }
            };
        }

        public static object GetResults()
        {
            var state = LoadState();
            if (state == null || !state.hasRun)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "No test run results available. Run tests first." }
                };
            }

            return new Dictionary<string, object>
            {
                { "completed", state.completed },
                { "passed", state.passed },
                { "failed", state.failed },
                { "skipped", state.skipped },
                { "duration", state.duration },
                { "results", BuildResults(state.results) }
            };
        }

        private static void RestorePendingRun()
        {
            if (_lastCollector != null)
            {
                return;
            }

            var state = LoadState();
            if (state == null || !state.hasRun || state.completed)
            {
                return;
            }

            AttachCollector(new TestResultCollector(state));
        }

        private static void AttachCollector(TestResultCollector collector)
        {
            DetachCollector();
            _lastCollector = collector;
            TestRunnerApi.RegisterTestCallback(collector);
        }

        private static void DetachCollector()
        {
            if (_lastCollector == null)
            {
                return;
            }

            TestRunnerApi.UnregisterTestCallback(_lastCollector);
            _lastCollector = null;
        }

        private static TestRunState LoadState()
        {
            var json = SessionState.GetString(RunStateSessionKey, "");
            if (string.IsNullOrEmpty(json))
            {
                return null;
            }

            try
            {
                var state = JsonUtility.FromJson<TestRunState>(json);
                if (state != null && state.results == null)
                {
                    state.results = new List<TestResultState>();
                }

                return state;
            }
            catch (ArgumentException)
            {
                SessionState.EraseString(RunStateSessionKey);
                return null;
            }
        }

        private static void SaveState(TestRunState state)
        {
            SessionState.SetString(RunStateSessionKey, JsonUtility.ToJson(state));
        }

        private static Dictionary<string, object>[] BuildResults(List<TestResultState> results)
        {
            if (results == null || results.Count == 0)
            {
                return Array.Empty<Dictionary<string, object>>();
            }

            var output = new Dictionary<string, object>[results.Count];
            for (var index = 0; index < results.Count; index++)
            {
                var result = results[index];
                output[index] = new Dictionary<string, object>
                {
                    { "name", result.name },
                    { "fullName", result.fullName },
                    { "status", result.status },
                    { "duration", result.duration },
                    { "message", result.message }
                };
            }

            return output;
        }

        [Serializable]
        private sealed class TestRunState
        {
            public bool hasRun;
            public bool runStarted;
            public bool completed;
            public string mode;
            public string filter;
            public int passed;
            public int failed;
            public int skipped;
            public double duration;
            public List<TestResultState> results = new List<TestResultState>();
        }

        [Serializable]
        private sealed class TestResultState
        {
            public string name;
            public string fullName;
            public string status;
            public double duration;
            public string message;
        }

        private sealed class TestResultCollector : ICallbacks
        {
            private readonly TestRunState _state;
            private readonly object _lock = new object();

            public TestResultCollector(TestRunState state)
            {
                _state = state;
            }

            public void RunStarted(ITestAdaptor testsToRun)
            {
                lock (_lock)
                {
                    if (_state.runStarted)
                    {
                        return;
                    }

                    _state.results.Clear();
                    _state.passed = 0;
                    _state.failed = 0;
                    _state.skipped = 0;
                    _state.duration = 0;
                    _state.completed = false;
                    _state.runStarted = true;
                    SaveState(_state);
                }
            }

            public void RunFinished(ITestResultAdaptor result)
            {
                Dictionary<string, object> summary;
                lock (_lock)
                {
                    _state.duration = result.Duration;
                    _state.completed = true;
                    SaveState(_state);

                    summary = new Dictionary<string, object>
                    {
                        { "passed", _state.passed },
                        { "failed", _state.failed },
                        { "skipped", _state.skipped },
                        { "duration", _state.duration }
                    };
                }

                var notification = JsonRpcParser.BuildNotification(
                    "editor.tests.runCompleted",
                    summary);

                EditorWebSocketServer.Broadcast(notification);

                if (ReferenceEquals(_lastCollector, this))
                {
                    DetachCollector();
                }
            }

            public void TestStarted(ITestAdaptor test) { }

            public void TestFinished(ITestResultAdaptor result)
            {
                if (result.HasChildren)
                {
                    return;
                }

                lock (_lock)
                {
                    var status = result.TestStatus.ToString();
                    if (status == "Passed") _state.passed++;
                    else if (status == "Failed") _state.failed++;
                    else _state.skipped++;

                    _state.results.Add(new TestResultState
                    {
                        name = result.Name,
                        fullName = result.FullName,
                        status = status,
                        duration = result.Duration,
                        message = result.Message ?? ""
                    });

                    SaveState(_state);
                }
            }
        }
    }
}
