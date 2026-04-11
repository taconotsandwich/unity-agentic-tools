using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityAgenticTools.Bridge.Settings;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Transport
{
    [InitializeOnLoad]
    public static class EditorWebSocketServer
    {
        private const int PortRangeStart = 53782;
        private const int PortRangeEnd = 53791;

        private static TcpListener _listener;
        private static Thread _listenThread;
        private static CancellationTokenSource _cts;
        private static int _port;
        private static volatile bool _running;

        private static readonly ConcurrentQueue<Action> _mainThreadQueue = new ConcurrentQueue<Action>();
        private static readonly List<WebSocketConnection> _connections = new List<WebSocketConnection>();
        private static readonly object _connectionsLock = new object();

        private const string CachedAutoStartKey = "UnityAgenticTools.CachedAutoStart";
        private const string RestartAfterReloadKey = "UnityAgenticTools.RestartAfterReload";
        private const string ManualStopKey = "UnityAgenticTools.ManualStop";
        private const double HealthCheckIntervalSeconds = 1.0d;

        private static double _nextHealthCheckAt;
        private static volatile bool _assemblyReloadInProgress;
        private static volatile bool _playModeTransitionInProgress;
        private static volatile bool _editorCompiling;
        private static volatile bool _editorUpdating;
        public static int Port => _port;
        public static bool IsRunning => _running;
        public static bool IsAssemblyReloadInProgress => _assemblyReloadInProgress;
        public static bool IsPlayModeTransitionInProgress => _playModeTransitionInProgress;
        public static bool IsEditorStable =>
            !_assemblyReloadInProgress &&
            !_playModeTransitionInProgress &&
            !_editorCompiling &&
            !_editorUpdating;
        public static IReadOnlyList<WebSocketConnection> Connections
        {
            get
            {
                lock (_connectionsLock)
                {
                    return _connections.ToArray();
                }
            }
        }

        static EditorWebSocketServer()
        {
            EditorApplication.update += PumpMainThreadQueue;
            EditorApplication.update += MaintainServerHealth;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
            AssemblyReloadEvents.afterAssemblyReload += OnAfterAssemblyReload;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;

            // Defer settings access to avoid ScriptableSingleton asset load stall
            // during InitializeOnLoad (causes timeouts on heavy projects in Unity 6.4+)
            EditorApplication.delayCall += () =>
            {
                RefreshEditorStateSnapshot();
                var autoStart = EditorServerSettings.instance.autoStart;
                SessionState.SetBool(CachedAutoStartKey, autoStart);
                if (autoStart)
                {
                    RequestServerRecovery();
                }
            };
        }

        public static void Start()
        {
            if (_running) return;

            _cts = new CancellationTokenSource();
            SessionState.EraseBool(ManualStopKey);

            foreach (var port in GetCandidatePorts())
            {
                try
                {
                    _listener = new TcpListener(IPAddress.Loopback, port);
                    _listener.Start();
                    _port = port;
                    _running = true;
                    break;
                }
                catch (SocketException)
                {
                    _listener = null;
                }
            }

            if (!_running)
            {
                Debug.LogError("[UnityAgenticTools] Failed to bind to any port in range " +
                    $"{PortRangeStart}-{PortRangeEnd}");
                return;
            }

            RefreshEditorStateSnapshot();
            LockfileManager.Write(_port, System.Diagnostics.Process.GetCurrentProcess().Id);
            MessageDispatcher.Reset();

            _listenThread = new Thread(ListenLoop)
            {
                IsBackground = true,
                Name = "UnityAgenticTools-WS"
            };
            _listenThread.Start();

            _nextHealthCheckAt = 0;
            SessionState.EraseBool(RestartAfterReloadKey);

            Debug.Log($"[UnityAgenticTools] WebSocket server started on port {_port}");
        }

        public static void Stop()
        {
            SessionState.SetBool(ManualStopKey, true);
            StopInternal(clearRestartIntent: true, removeLockfile: true);
        }

        private static void StopForReload()
        {
            SessionState.EraseBool(ManualStopKey);
            SessionState.SetBool(RestartAfterReloadKey, _running);
            StopInternal(clearRestartIntent: false, removeLockfile: false);
        }

        private static void StopInternal(bool clearRestartIntent, bool removeLockfile)
        {
            if (!_running)
            {
                if (clearRestartIntent)
                {
                    SessionState.EraseBool(RestartAfterReloadKey);
                }
                return;
            }

            _running = false;

            _cts?.Cancel();

            try { _listener?.Stop(); } catch { }

            lock (_connectionsLock)
            {
                foreach (var conn in _connections)
                {
                    try { conn.Close(); } catch { }
                }
                _connections.Clear();
            }

            if (removeLockfile)
            {
                LockfileManager.Remove();
            }
            _port = 0;
            _listener = null;
            _listenThread = null;
            _cts?.Dispose();
            _cts = null;

            if (clearRestartIntent)
            {
                SessionState.EraseBool(RestartAfterReloadKey);
            }

            Debug.Log("[UnityAgenticTools] WebSocket server stopped");
        }

        private const int MainThreadTimeoutMs = 30000;

        public static Task<T> RunOnMainThread<T>(Func<T> func, int timeoutMs = MainThreadTimeoutMs)
        {
            if (!_running)
            {
                return Task.FromException<T>(
                    new InvalidOperationException("Server is not running. Cannot dispatch to main thread."));
            }

            var tcs = new TaskCompletionSource<T>();

            // Cancel immediately when server stops (e.g., assembly reload)
            var reg = _cts.Token.Register(() => tcs.TrySetCanceled());

            _mainThreadQueue.Enqueue(() =>
            {
                try
                {
                    tcs.TrySetResult(func());
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
                finally
                {
                    reg.Dispose();
                }
            });

            // Timeout guard: prevent indefinite hangs if EditorApplication.update stops pumping
            Task.Delay(timeoutMs).ContinueWith(_ =>
            {
                tcs.TrySetException(new TimeoutException(
                    $"Main thread dispatch timed out after {timeoutMs}ms. " +
                    "EditorApplication.update may not be pumping (e.g., during assembly reload)."));
            });

            return tcs.Task;
        }

        public static Task RunOnMainThread(Action action, int timeoutMs = MainThreadTimeoutMs)
        {
            if (!_running)
            {
                return Task.FromException(
                    new InvalidOperationException("Server is not running. Cannot dispatch to main thread."));
            }

            var tcs = new TaskCompletionSource<bool>();

            // Cancel immediately when server stops (e.g., assembly reload)
            var reg = _cts.Token.Register(() => tcs.TrySetCanceled());

            _mainThreadQueue.Enqueue(() =>
            {
                try
                {
                    action();
                    tcs.TrySetResult(true);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
                finally
                {
                    reg.Dispose();
                }
            });

            Task.Delay(timeoutMs).ContinueWith(_ =>
            {
                tcs.TrySetException(new TimeoutException(
                    $"Main thread dispatch timed out after {timeoutMs}ms. " +
                    "EditorApplication.update may not be pumping (e.g., during assembly reload)."));
            });

            return tcs.Task;
        }

        public static void Broadcast(string json)
        {
            WebSocketConnection[] snapshot;
            lock (_connectionsLock)
            {
                snapshot = _connections.ToArray();
            }

            var failed = new List<WebSocketConnection>();
            foreach (var conn in snapshot)
            {
                try
                {
                    conn.SendAsync(json).ContinueWith(t =>
                    {
                        if (t.IsFaulted)
                        {
                            lock (_connectionsLock)
                            {
                                _connections.Remove(conn);
                            }
                        }
                    });
                }
                catch
                {
                    failed.Add(conn);
                }
            }

            if (failed.Count > 0)
            {
                lock (_connectionsLock)
                {
                    foreach (var conn in failed)
                        _connections.Remove(conn);
                }
            }
        }

        private static void PumpMainThreadQueue()
        {
            RefreshEditorStateSnapshot();

            while (_mainThreadQueue.TryDequeue(out var action))
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[UnityAgenticTools] Main thread action error: {ex}");
                }
            }
        }

        private static void ListenLoop()
        {
            var token = _cts.Token;
            while (!token.IsCancellationRequested)
            {
                try
                {
                    var client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(_ => HandleClient(client, token));
                }
                catch (SocketException) when (token.IsCancellationRequested)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (!token.IsCancellationRequested)
                    {
                        Debug.LogError($"[UnityAgenticTools] Accept error: {ex.Message}");
                    }
                }
            }
        }

        private static void HandleClient(TcpClient client, CancellationToken token)
        {
            WebSocketConnection conn = null;
            try
            {
                conn = new WebSocketConnection(client);
                if (!conn.PerformHandshake())
                {
                    client.Close();
                    return;
                }

                lock (_connectionsLock)
                {
                    _connections.Add(conn);
                }

                while (!token.IsCancellationRequested && conn.IsConnected)
                {
                    var message = conn.ReceiveAsync().Result;
                    if (message == null) break;

                    var response = MessageDispatcher.Dispatch(message).Result;
                    if (response != null)
                    {
                        conn.SendAsync(response).Wait();
                    }
                }
            }
            catch (Exception ex)
            {
                if (!token.IsCancellationRequested)
                {
                    Debug.LogWarning($"[UnityAgenticTools] Connection error: {ex.Message}");
                }
            }
            finally
            {
                if (conn != null)
                {
                    lock (_connectionsLock)
                    {
                        _connections.Remove(conn);
                    }
                    try { conn.Close(); } catch { }
                }
            }
        }

        private static void OnBeforeAssemblyReload()
        {
            _assemblyReloadInProgress = true;
            // Cache settings before reload while ScriptableSingleton is accessible
            try { SessionState.SetBool(CachedAutoStartKey, EditorServerSettings.instance.autoStart); } catch { }
            StopForReload();
        }

        private static void OnAfterAssemblyReload()
        {
            _assemblyReloadInProgress = false;
            // Drain any stale items from before reload (their TaskCompletionSources are orphaned)
            while (_mainThreadQueue.TryDequeue(out _)) { }

            RefreshEditorStateSnapshot();
            EditorApplication.update -= PumpMainThreadQueue;
            EditorApplication.update += PumpMainThreadQueue;
            Debug.Log("[UnityAgenticTools] Re-registered main thread pump after assembly reload");

            MessageDispatcher.Reset();
            RequestServerRecovery();
        }

        private static void OnPlayModeChanged(PlayModeStateChange state)
        {
            if (state == PlayModeStateChange.ExitingEditMode ||
                state == PlayModeStateChange.ExitingPlayMode)
            {
                _playModeTransitionInProgress = true;
                return;
            }

            if (state == PlayModeStateChange.EnteredPlayMode ||
                state == PlayModeStateChange.EnteredEditMode)
            {
                _playModeTransitionInProgress = false;
                RefreshEditorStateSnapshot();
                EditorApplication.update -= PumpMainThreadQueue;
                EditorApplication.update += PumpMainThreadQueue;
                Debug.Log($"[UnityAgenticTools] Re-registered main thread pump after {state}");
                RequestServerRecovery();
            }
        }

        [DidReloadScripts]
        private static void OnScriptsReloaded()
        {
            RequestServerRecovery();
        }

        private static void MaintainServerHealth()
        {
            if (!NeedsServerMaintenance())
            {
                return;
            }

            if (EditorApplication.timeSinceStartup < _nextHealthCheckAt)
            {
                return;
            }

            _nextHealthCheckAt = EditorApplication.timeSinceStartup + HealthCheckIntervalSeconds;
            EnsureServerState();
        }

        private static void RequestServerRecovery()
        {
            _nextHealthCheckAt = 0;
            EditorApplication.delayCall += EnsureServerState;
        }

        private static bool NeedsServerMaintenance()
        {
            if (_running)
            {
                return true;
            }

            if (SessionState.GetBool(RestartAfterReloadKey, false))
            {
                return true;
            }

            if (!SessionState.GetBool(CachedAutoStartKey, false))
            {
                return false;
            }

            return !SessionState.GetBool(ManualStopKey, false);
        }

        private static void EnsureServerState()
        {
            if (_running)
            {
                if (!LockfileManager.Exists())
                {
                    LockfileManager.Write(_port, System.Diagnostics.Process.GetCurrentProcess().Id);
                    Debug.Log("[UnityAgenticTools] Rewrote missing editor lockfile");
                }

                return;
            }

            if (!NeedsServerMaintenance())
            {
                return;
            }

            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                return;
            }

            Start();
            if (_running)
            {
                return;
            }
        }

        private static void RefreshEditorStateSnapshot()
        {
            _editorCompiling = EditorApplication.isCompiling;
            _editorUpdating = EditorApplication.isUpdating;
        }

        private static IEnumerable<int> GetCandidatePorts()
        {
            var preferredPort = GetPreferredPort();
            if (preferredPort >= PortRangeStart && preferredPort <= PortRangeEnd)
            {
                yield return preferredPort;
            }

            for (int port = PortRangeStart; port <= PortRangeEnd; port++)
            {
                if (port != preferredPort)
                {
                    yield return port;
                }
            }
        }

        private static int GetPreferredPort()
        {
            try
            {
                return EditorServerSettings.instance.preferredPort;
            }
            catch
            {
                return PortRangeStart;
            }
        }
    }
}
