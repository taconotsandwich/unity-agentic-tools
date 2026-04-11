using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityAgenticTools;
using UnityAgenticTools.Bridge.Handlers;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Transport
{
    public static class MessageDispatcher
    {
        private static readonly Dictionary<string, IRequestHandler> Handlers =
            new Dictionary<string, IRequestHandler>();

        private static bool initialized;

        static MessageDispatcher()
        {
            Initialize();
        }

        public static void Initialize()
        {
            if (initialized)
            {
                return;
            }

            Handlers.Clear();

            var handlerType = typeof(IRequestHandler);
            var types = AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(assembly =>
                {
                    try
                    {
                        return assembly.GetTypes();
                    }
                    catch
                    {
                        return Type.EmptyTypes;
                    }
                })
                .Where(type => handlerType.IsAssignableFrom(type) && !type.IsInterface && !type.IsAbstract);

            foreach (var type in types)
            {
                try
                {
                    var handler = (IRequestHandler)Activator.CreateInstance(type);
                    Handlers[handler.MethodPrefix] = handler;
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityAgenticTools] Failed to create handler {type.Name}: {ex.Message}");
                }
            }

            initialized = true;
        }

        public static async Task<string> Dispatch(string message)
        {
            string id = null;
            string method = null;
            var timeoutMs = 30000;

            try
            {
                var request = JsonRpcParser.ParseRequest(message);
                id = request.Id;
                method = request.Method;
                timeoutMs = ResolveRequestTimeoutMs(request.Params);

                if (string.IsNullOrEmpty(request.Method))
                {
                    return JsonRpcParser.BuildError(id, -32600, "Invalid Request: missing method");
                }

                var handler = FindHandler(request.Method);
                if (handler == null)
                {
                    return JsonRpcParser.BuildError(id, -32601, $"Method not found: {request.Method}");
                }

                var result = await handler.HandleAsync(request.Method, request.Params);
                var transportResult = JsonRpcParser.IsTransportSafeValue(result)
                    ? result
                    : await EditorWebSocketServer.RunOnMainThread(
                        () => JsonRpcParser.NormalizeValueForTransport(result),
                        timeoutMs);

                return JsonRpcParser.BuildResult(id, transportResult);
            }
            catch (TaskCanceledException ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Dispatch was canceled (likely bridge restart): {ex.Message}");
                return JsonRpcParser.BuildError(
                    id ?? "0",
                    -32000,
                    method == "editor.invoke"
                        ? "Editor invoke was interrupted by a server transition before its response could be delivered."
                        : "Bridge request was canceled by server transition. Retry the request.");
            }
            catch (TimeoutException ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Dispatch timed out: {ex.Message}");
                return JsonRpcParser.BuildError(
                    id ?? "0",
                    -32000,
                    method == "editor.invoke"
                        ? "Editor invoke timed out while waiting for a stable main-thread response."
                        : "Bridge request timed out while waiting for main thread work.");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UnityAgenticTools] Dispatch error: {ex}");
                return JsonRpcParser.BuildError(id ?? "0", -32603, ex.Message);
            }
        }

        public static void Reset()
        {
            initialized = false;
            Handlers.Clear();
            Initialize();
        }

        private static IRequestHandler FindHandler(string method)
        {
            foreach (var entry in Handlers)
            {
                if (method.StartsWith(entry.Key))
                {
                    return entry.Value;
                }
            }

            return null;
        }

        private static int ResolveRequestTimeoutMs(Dictionary<string, object> parameters)
        {
            if (parameters == null || !parameters.TryGetValue("_timeout", out var timeoutObj))
            {
                return 30000;
            }

            if (timeoutObj is int timeoutInt)
            {
                return Math.Max(1, timeoutInt);
            }

            if (timeoutObj is long timeoutLong)
            {
                return (int)Math.Max(1L, Math.Min(timeoutLong, int.MaxValue));
            }

            if (timeoutObj is double timeoutDouble)
            {
                return (int)Math.Max(1d, Math.Min(timeoutDouble, int.MaxValue));
            }

            if (timeoutObj is string timeoutString && int.TryParse(timeoutString, out var parsedTimeout))
            {
                return Math.Max(1, parsedTimeout);
            }

            return 30000;
        }
    }
}
