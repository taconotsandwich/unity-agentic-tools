using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityAgenticTools;
using UnityEngine;

namespace UnityAgenticTools.Refs
{
    public enum RefKind
    {
        UI,        // @uN
        Hierarchy  // @hN
    }

    public struct RefEntry
    {
        public int InstanceId;
        public string TreePath; // For UI Toolkit elements (no instanceId)
    }

    [InitializeOnLoad]
    public static class RefManager
    {
        private static readonly Dictionary<int, RefEntry> _uiRefs = new Dictionary<int, RefEntry>();
        private static readonly Dictionary<int, RefEntry> _hierarchyRefs = new Dictionary<int, RefEntry>();
        private static int _nextUiIndex;
        private static int _nextHierarchyIndex;

        private const string PrefsKey = "UnityAgenticTools.RefSnapshot";

        [Serializable]
        private class RefSnapshot
        {
            public List<SnapshotEntry> uiRefs = new List<SnapshotEntry>();
            public List<SnapshotEntry> hierarchyRefs = new List<SnapshotEntry>();
            public int nextUiIndex;
            public int nextHierarchyIndex;
        }

        [Serializable]
        private class SnapshotEntry
        {
            public int index;
            public int instanceId;
            public string treePath;
        }

        static RefManager()
        {
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
            EditorSceneManager.activeSceneChangedInEditMode += OnActiveSceneChanged;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;

            RestoreFromPrefs();
        }

        // --- Registration ---

        public static void ClearUI()
        {
            _uiRefs.Clear();
            _nextUiIndex = 1;
        }

        public static void ClearHierarchy()
        {
            _hierarchyRefs.Clear();
            _nextHierarchyIndex = 1;
        }

        public static string RegisterUI(int instanceId, string treePath = null)
        {
            int index = _nextUiIndex++;
            _uiRefs[index] = new RefEntry { InstanceId = instanceId, TreePath = treePath };
            return $"@u{index}";
        }

        public static string RegisterHierarchy(int instanceId)
        {
            int index = _nextHierarchyIndex++;
            _hierarchyRefs[index] = new RefEntry { InstanceId = instanceId };
            return $"@h{index}";
        }

        // --- Resolution ---

        public static bool TryResolve(string refStr, out RefEntry entry, out RefKind kind)
        {
            entry = default;
            kind = RefKind.Hierarchy;

            if (string.IsNullOrEmpty(refStr) || refStr.Length < 3 || refStr[0] != '@')
                return false;

            char prefix = refStr[1];
            if (!int.TryParse(refStr.Substring(2), out int index))
                return false;

            if (prefix == 'u')
            {
                kind = RefKind.UI;
                return _uiRefs.TryGetValue(index, out entry);
            }

            if (prefix == 'h')
            {
                kind = RefKind.Hierarchy;
                return _hierarchyRefs.TryGetValue(index, out entry);
            }

            return false;
        }

        public static GameObject ResolveGameObject(string refStr)
        {
            if (!TryResolve(refStr, out var entry, out _))
                throw new ArgumentException($"Stale or invalid ref '{refStr}'. Run hierarchy-snapshot or ui-snapshot to refresh refs.");

            if (entry.InstanceId == 0)
                throw new ArgumentException($"Ref '{refStr}' is a UI Toolkit element (no GameObject). Use ui-* commands instead.");

            var obj = UnityObjectCompat.ResolveObject(entry.InstanceId);
            if (obj == null)
                throw new ArgumentException($"Ref '{refStr}' points to a destroyed object. Run hierarchy-snapshot or ui-snapshot to refresh refs.");

            if (obj is GameObject go) return go;
            if (obj is Component comp) return comp.gameObject;

            throw new ArgumentException($"Ref '{refStr}' resolved to {obj.GetType().Name}, not a GameObject or Component.");
        }

        public static int GetUIRefCount() => _uiRefs.Count;
        public static int GetHierarchyRefCount() => _hierarchyRefs.Count;

        // --- Invalidation ---

        private static void OnPlayModeStateChanged(PlayModeStateChange state)
        {
            if (state == PlayModeStateChange.ExitingEditMode ||
                state == PlayModeStateChange.ExitingPlayMode)
            {
                ClearAll();
            }
        }

        private static void OnActiveSceneChanged(UnityEngine.SceneManagement.Scene prev, UnityEngine.SceneManagement.Scene next)
        {
            ClearAll();
        }

        private static void OnBeforeAssemblyReload()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                SaveToPrefs();
            }
            else
            {
                EditorPrefs.DeleteKey(PrefsKey);
                ClearAll();
            }
        }

        private static void ClearAll()
        {
            _uiRefs.Clear();
            _hierarchyRefs.Clear();
            _nextUiIndex = 1;
            _nextHierarchyIndex = 1;
            EditorPrefs.DeleteKey(PrefsKey);
        }

        // --- Persistence across domain reloads ---

        private static void SaveToPrefs()
        {
            var snapshot = new RefSnapshot
            {
                nextUiIndex = _nextUiIndex,
                nextHierarchyIndex = _nextHierarchyIndex,
            };
            foreach (var kvp in _uiRefs)
                snapshot.uiRefs.Add(new SnapshotEntry { index = kvp.Key, instanceId = kvp.Value.InstanceId, treePath = kvp.Value.TreePath });
            foreach (var kvp in _hierarchyRefs)
                snapshot.hierarchyRefs.Add(new SnapshotEntry { index = kvp.Key, instanceId = kvp.Value.InstanceId });

            EditorPrefs.SetString(PrefsKey, JsonUtility.ToJson(snapshot));
        }

        private static void RestoreFromPrefs()
        {
            if (!EditorPrefs.HasKey(PrefsKey)) return;
            try
            {
                var json = EditorPrefs.GetString(PrefsKey);
                var snapshot = JsonUtility.FromJson<RefSnapshot>(json);
                if (snapshot == null) return;

                _uiRefs.Clear();
                foreach (var e in snapshot.uiRefs)
                    _uiRefs[e.index] = new RefEntry { InstanceId = e.instanceId, TreePath = e.treePath };
                _nextUiIndex = snapshot.nextUiIndex;

                _hierarchyRefs.Clear();
                foreach (var e in snapshot.hierarchyRefs)
                    _hierarchyRefs[e.index] = new RefEntry { InstanceId = e.instanceId };
                _nextHierarchyIndex = snapshot.nextHierarchyIndex;

                EditorPrefs.DeleteKey(PrefsKey);
            }
            catch
            {
                EditorPrefs.DeleteKey(PrefsKey);
            }
        }
    }
}
