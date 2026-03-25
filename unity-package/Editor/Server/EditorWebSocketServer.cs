using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
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
        private static bool _running;

        private static readonly ConcurrentQueue<Action> _mainThreadQueue = new ConcurrentQueue<Action>();
        private static readonly List<WebSocketConnection> _connections = new List<WebSocketConnection>();
        private static readonly object _connectionsLock = new object();

        public static int Port => _port;
        public static bool IsRunning => _running;
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
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
            AssemblyReloadEvents.afterAssemblyReload += OnAfterAssemblyReload;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;

            if (EditorServerSettings.instance.autoStart)
            {
                Start();
            }
        }

        public static void Start()
        {
            if (_running) return;

            _cts = new CancellationTokenSource();

            for (int port = PortRangeStart; port <= PortRangeEnd; port++)
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

            LockfileManager.Write(_port, System.Diagnostics.Process.GetCurrentProcess().Id);

            _listenThread = new Thread(ListenLoop)
            {
                IsBackground = true,
                Name = "UnityAgenticTools-WS"
            };
            _listenThread.Start();

            Debug.Log($"[UnityAgenticTools] WebSocket server started on port {_port}");
        }

        public static void Stop()
        {
            if (!_running) return;
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

            LockfileManager.Remove();

            Debug.Log("[UnityAgenticTools] WebSocket server stopped");
        }

        private const int MainThreadTimeoutMs = 30000;

        public static Task<T> RunOnMainThread<T>(Func<T> func)
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
            Task.Delay(MainThreadTimeoutMs).ContinueWith(_ =>
            {
                tcs.TrySetException(new TimeoutException(
                    $"Main thread dispatch timed out after {MainThreadTimeoutMs}ms. " +
                    "EditorApplication.update may not be pumping (e.g., during assembly reload)."));
            });

            return tcs.Task;
        }

        public static Task RunOnMainThread(Action action)
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

            Task.Delay(MainThreadTimeoutMs).ContinueWith(_ =>
            {
                tcs.TrySetException(new TimeoutException(
                    $"Main thread dispatch timed out after {MainThreadTimeoutMs}ms. " +
                    "EditorApplication.update may not be pumping (e.g., during assembly reload)."));
            });

            return tcs.Task;
        }

        public static void Broadcast(string json)
        {
            lock (_connectionsLock)
            {
                for (int i = _connections.Count - 1; i >= 0; i--)
                {
                    try
                    {
                        _connections[i].SendAsync(json).Wait();
                    }
                    catch
                    {
                        _connections.RemoveAt(i);
                    }
                }
            }
        }

        private static void PumpMainThreadQueue()
        {
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
            Stop();
        }

        private static void OnAfterAssemblyReload()
        {
            // Drain any stale items from before reload (their TaskCompletionSources are orphaned)
            while (_mainThreadQueue.TryDequeue(out _)) { }

            EditorApplication.update -= PumpMainThreadQueue;
            EditorApplication.update += PumpMainThreadQueue;
            Debug.Log("[UnityAgenticTools] Re-registered main thread pump after assembly reload");

            if (EditorServerSettings.instance.autoStart)
            {
                Start();
            }
        }

        private static void OnPlayModeChanged(PlayModeStateChange state)
        {
            if (state == PlayModeStateChange.EnteredPlayMode)
            {
                EditorApplication.update -= PumpMainThreadQueue;
                EditorApplication.update += PumpMainThreadQueue;
                Debug.Log("[UnityAgenticTools] Re-registered main thread pump after entering play mode");
            }
        }
    }
}
