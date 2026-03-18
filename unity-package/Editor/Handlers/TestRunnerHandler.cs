using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public class TestRunnerHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.tests.";

        private static TestResultCollector _lastCollector;

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "run":
                    return await EditorWebSocketServer.RunOnMainThread(() =>
                    {
                        var testMode = TestMode.EditMode;
                        if (parameters.TryGetValue("mode", out var modeObj) && modeObj is string modeStr)
                        {
                            if (modeStr.Equals("playmode", StringComparison.OrdinalIgnoreCase))
                            {
                                testMode = TestMode.PlayMode;
                            }
                        }

                        string filter = null;
                        if (parameters.TryGetValue("filter", out var filterObj) && filterObj is string f)
                        {
                            filter = f;
                        }

                        var api = ScriptableObject.CreateInstance<TestRunnerApi>();
                        var executionFilter = new Filter
                        {
                            testMode = testMode
                        };

                        if (!string.IsNullOrEmpty(filter))
                        {
                            executionFilter.testNames = new[] { filter };
                        }

                        _lastCollector = new TestResultCollector();
                        api.RegisterCallbacks(_lastCollector);
                        api.Execute(new ExecutionSettings(executionFilter));

                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "message", $"Test run started in {testMode} mode" },
                            { "mode", testMode.ToString() },
                            { "filter", filter ?? "(all)" }
                        };
                    });

                case "getResults":
                    return await EditorWebSocketServer.RunOnMainThread<object>(() =>
                    {
                        if (_lastCollector == null)
                        {
                            return new Dictionary<string, object>
                            {
                                { "success", false },
                                { "error", "No test run results available. Run tests first." }
                            };
                        }

                        return new Dictionary<string, object>
                        {
                            { "completed", _lastCollector.IsComplete },
                            { "passed", _lastCollector.Passed },
                            { "failed", _lastCollector.Failed },
                            { "skipped", _lastCollector.Skipped },
                            { "duration", _lastCollector.Duration },
                            { "results", _lastCollector.GetResults().ToArray() }
                        };
                    });

                default:
                    throw new InvalidOperationException($"Unknown test runner action: {action}");
            }
        }

        private class TestResultCollector : ICallbacks
        {
            private readonly List<Dictionary<string, object>> _results = new List<Dictionary<string, object>>();
            private readonly object _lock = new object();

            public int Passed { get; private set; }
            public int Failed { get; private set; }
            public int Skipped { get; private set; }
            public double Duration { get; private set; }
            public bool IsComplete { get; private set; }

            public List<Dictionary<string, object>> GetResults()
            {
                lock (_lock)
                {
                    return new List<Dictionary<string, object>>(_results);
                }
            }

            public void RunStarted(ITestAdaptor testsToRun)
            {
                lock (_lock)
                {
                    _results.Clear();
                    Passed = 0;
                    Failed = 0;
                    Skipped = 0;
                    Duration = 0;
                    IsComplete = false;
                }
            }

            public void RunFinished(ITestResultAdaptor result)
            {
                Duration = result.Duration;
                IsComplete = true;

                var notification = JsonRpcParser.BuildNotification("editor.tests.runCompleted",
                    new Dictionary<string, object>
                    {
                        { "passed", Passed },
                        { "failed", Failed },
                        { "skipped", Skipped },
                        { "duration", Duration }
                    });

                EditorWebSocketServer.Broadcast(notification);
            }

            public void TestStarted(ITestAdaptor test) { }

            public void TestFinished(ITestResultAdaptor result)
            {
                if (!result.HasChildren)
                {
                    lock (_lock)
                    {
                        var status = result.TestStatus.ToString();
                        if (status == "Passed") Passed++;
                        else if (status == "Failed") Failed++;
                        else Skipped++;

                        _results.Add(new Dictionary<string, object>
                        {
                            { "name", result.Name },
                            { "fullName", result.FullName },
                            { "status", status },
                            { "duration", result.Duration },
                            { "message", result.Message ?? "" }
                        });
                    }
                }
            }
        }
    }
}
