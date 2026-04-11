using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Settings
{
    [FilePath("UnityAgenticTools/ServerSettings.asset", FilePathAttribute.Location.PreferencesFolder)]
    public class EditorServerSettings : ScriptableSingleton<EditorServerSettings>
    {
        [SerializeField]
        private bool _autoStart = true;

        [SerializeField]
        private int _preferredPort = 53782;

        public bool autoStart
        {
            get => _autoStart;
            set
            {
                _autoStart = value;
                Save(true);
            }
        }

        public int preferredPort
        {
            get => _preferredPort;
            set
            {
                _preferredPort = value;
                Save(true);
            }
        }
    }
}
