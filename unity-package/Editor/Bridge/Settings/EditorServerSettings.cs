using System;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Bridge.Settings
{
    [FilePath("UnityAgenticTools/ServerSettings.asset", FilePathAttribute.Location.PreferencesFolder)]
    public class EditorServerSettings : ScriptableSingleton<EditorServerSettings>
    {
        public const int MinimumPort = 1024;
        public const int MaximumPort = 65535;

        [SerializeField]
        private bool _autoStart = true;

        [SerializeField]
        private int _preferredPort;

        public bool autoStart
        {
            get => _autoStart;
            set
            {
                _autoStart = value;
                Save(true);
            }
        }

        public int? preferredPort
        {
            get => _preferredPort >= MinimumPort && _preferredPort <= MaximumPort
                ? (int?)_preferredPort
                : null;
            set
            {
                if (value.HasValue &&
                    (value.Value < MinimumPort || value.Value > MaximumPort))
                {
                    throw new ArgumentOutOfRangeException(
                        nameof(preferredPort),
                        $"Port must be between {MinimumPort} and {MaximumPort}.");
                }

                _preferredPort = value ?? 0;
                Save(true);
            }
        }
    }
}
