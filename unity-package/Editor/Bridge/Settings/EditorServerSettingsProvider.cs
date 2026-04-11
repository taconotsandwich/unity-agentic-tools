using UnityEditor;
using UnityAgenticTools.Bridge.Transport;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Settings
{
    public class EditorServerSettingsProvider : SettingsProvider
    {
        public EditorServerSettingsProvider()
            : base("Project/Unity Agentic Tools", SettingsScope.Project) { }

        public override void OnGUI(string searchContext)
        {
            var settings = EditorServerSettings.instance;

            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("WebSocket Server", EditorStyles.boldLabel);
            EditorGUILayout.Space(5);

            EditorGUI.BeginChangeCheck();
            var autoStart = EditorGUILayout.Toggle("Auto Start", settings.autoStart);
            if (EditorGUI.EndChangeCheck())
            {
                settings.autoStart = autoStart;
            }

            EditorGUI.BeginChangeCheck();
            var port = EditorGUILayout.IntField("Preferred Port", settings.preferredPort);
            if (EditorGUI.EndChangeCheck())
            {
                port = Mathf.Clamp(port, 1024, 65535);
                settings.preferredPort = port;
            }

            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("Status", EditorStyles.boldLabel);
            EditorGUILayout.Space(5);

            var running = EditorWebSocketServer.IsRunning;
            EditorGUILayout.LabelField("Server Running", running ? "Yes" : "No");

            if (running)
            {
                EditorGUILayout.LabelField("Port", EditorWebSocketServer.Port.ToString());
                EditorGUILayout.LabelField("Connections", EditorWebSocketServer.Connections.Count.ToString());
            }

            EditorGUILayout.Space(10);

            EditorGUILayout.BeginHorizontal();
            if (running)
            {
                if (GUILayout.Button("Stop Server", GUILayout.Width(120)))
                {
                    EditorWebSocketServer.Stop();
                }
            }
            else
            {
                if (GUILayout.Button("Start Server", GUILayout.Width(120)))
                {
                    EditorWebSocketServer.Start();
                }
            }
            EditorGUILayout.EndHorizontal();
        }

        [SettingsProvider]
        public static SettingsProvider CreateProvider()
        {
            return new EditorServerSettingsProvider
            {
                keywords = new[] { "agentic", "websocket", "server", "bridge" }
            };
        }
    }
}
