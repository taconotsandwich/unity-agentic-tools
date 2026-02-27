using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
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

        static RefManager()
        {
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
            EditorSceneManager.activeSceneChangedInEditMode += OnActiveSceneChanged;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
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

            var obj = EditorUtility.InstanceIDToObject(entry.InstanceId);
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
            ClearAll();
        }

        private static void ClearAll()
        {
            _uiRefs.Clear();
            _hierarchyRefs.Clear();
            _nextUiIndex = 1;
            _nextHierarchyIndex = 1;
        }
    }
}
