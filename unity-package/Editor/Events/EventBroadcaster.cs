using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public static class EventBroadcaster
    {
        private static readonly Dictionary<string, HashSet<WebSocketConnection>> _subscriptions =
            new Dictionary<string, HashSet<WebSocketConnection>>();
        private static readonly object _lock = new object();

        public static void Subscribe(WebSocketConnection connection, string eventType)
        {
            lock (_lock)
            {
                if (!_subscriptions.TryGetValue(eventType, out var subs))
                {
                    subs = new HashSet<WebSocketConnection>();
                    _subscriptions[eventType] = subs;
                }
                subs.Add(connection);
            }
        }

        public static void Unsubscribe(WebSocketConnection connection, string eventType = null)
        {
            lock (_lock)
            {
                if (eventType != null)
                {
                    if (_subscriptions.TryGetValue(eventType, out var subs))
                    {
                        subs.Remove(connection);
                    }
                }
                else
                {
                    foreach (var kvp in _subscriptions)
                    {
                        kvp.Value.Remove(connection);
                    }
                }
            }
        }

        public static void Broadcast(string eventType, Dictionary<string, object> data)
        {
            var notification = JsonRpcParser.BuildNotification(eventType, data);
            EditorWebSocketServer.Broadcast(notification);
        }
    }
}
