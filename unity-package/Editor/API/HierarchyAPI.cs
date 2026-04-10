using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityAgenticTools.Refs;

namespace UnityAgenticTools.API
{
    public static class HierarchyAPI
    {

        public static object Snapshot(int maxDepth = 99, bool includeInactive = false)
        {
                RefManager.ClearHierarchy();

                var scene = SceneManager.GetActiveScene();
                var roots = scene.GetRootGameObjects();
                var tree = new List<object>();

                foreach (var root in roots)
                {
                    if (!includeInactive && !root.activeInHierarchy) continue;
                    tree.Add(BuildNode(root, 0, maxDepth, includeInactive));
                }

                return new Dictionary<string, object>
                {
                    { "scene", scene.name },
                    { "scenePath", scene.path },
                    { "refCount", RefManager.GetHierarchyRefCount() },
                    { "tree", tree.ToArray() }
                };
        }

        private static object BuildNode(GameObject go, int depth, int maxDepth, bool includeInactive)
        {
            string refStr = RefManager.RegisterHierarchy(UnityObjectCompat.GetObjectId(go));

            var node = new Dictionary<string, object>
            {
                { "ref", refStr },
                { "name", go.name },
                { "active", go.activeSelf }
            };

            if (go.tag != "Untagged")
                node["tag"] = go.tag;

            if (go.layer != 0)
                node["layer"] = LayerMask.LayerToName(go.layer);

            // List component types compactly
            var components = go.GetComponents<Component>();
            var typeNames = new List<string>();
            foreach (var comp in components)
            {
                if (comp == null)
                {
                    typeNames.Add("Missing Script");
                    continue;
                }
                var typeName = comp.GetType().Name;
                if (typeName == "Transform" || typeName == "RectTransform") continue;
                typeNames.Add(typeName);
            }
            if (typeNames.Count > 0)
                node["components"] = typeNames.ToArray();

            // Children
            if (depth < maxDepth && go.transform.childCount > 0)
            {
                var children = new List<object>();
                for (int i = 0; i < go.transform.childCount; i++)
                {
                    var child = go.transform.GetChild(i).gameObject;
                    if (!includeInactive && !child.activeInHierarchy) continue;
                    children.Add(BuildNode(child, depth + 1, maxDepth, includeInactive));
                }
                if (children.Count > 0)
                    node["children"] = children.ToArray();
            }
            else if (go.transform.childCount > 0)
            {
                node["childCount"] = go.transform.childCount;
            }

            return node;
        }

        public static object Query(string refStr, string query, string type = null)
        {
                var go = RefManager.ResolveGameObject(refStr);

                switch (query)
                {
                    case "active":
                        return (object)new Dictionary<string, object>
                        {
                            { "ref", refStr },
                            { "active", go.activeInHierarchy },
                            { "activeSelf", go.activeSelf }
                        };

                    case "position":
                        var t = go.transform;
                        return (object)new Dictionary<string, object>
                        {
                            { "ref", refStr },
                            { "position", Vec3ToDict(t.position) },
                            { "localPosition", Vec3ToDict(t.localPosition) },
                            { "rotation", Vec3ToDict(t.eulerAngles) },
                            { "localScale", Vec3ToDict(t.localScale) }
                        };

                    case "component":
                        if (string.IsNullOrEmpty(type))
                            throw new ArgumentException("Missing required parameter: type (for component query)");

                        return QueryComponent(go, refStr, type);

                    default:
                        throw new ArgumentException($"Unknown query type: {query}. Use: active, position, component");
                }
        }

        private static object QueryComponent(GameObject go, string refStr, string typeName)
        {
            Component target = null;

            foreach (var comp in go.GetComponents<Component>())
            {
                if (comp == null) continue;
                if (comp.GetType().Name.Equals(typeName, StringComparison.OrdinalIgnoreCase))
                {
                    target = comp;
                    break;
                }
            }

            if (target == null)
                throw new ArgumentException($"Component '{typeName}' not found on '{go.name}'");

            var props = new Dictionary<string, object>();
            var compType = target.GetType();

            // Get public properties
            foreach (var prop in compType.GetProperties(
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
            {
                if (!prop.CanRead) continue;
                if (prop.GetIndexParameters().Length > 0) continue;

                // Skip problematic Unity properties
                var pName = prop.Name;
                if (pName == "mesh" || pName == "material" || pName == "materials" ||
                    pName == "sharedMaterial" || pName == "sharedMaterials" ||
                    pName == "gameObject" || pName == "transform" ||
                    pName == "tag" || pName == "name" || pName == "hideFlags")
                    continue;

                try
                {
                    var val = prop.GetValue(target);
                    props[pName] = SerializeComponentValue(val);
                }
                catch { }
            }

            return new Dictionary<string, object>
            {
                { "ref", refStr },
                { "componentType", compType.Name },
                { "properties", props }
            };
        }

        private static object SerializeComponentValue(object val)
        {
            if (val == null) return null;
            if (val is string s) return s;
            if (val is bool b) return b;
            if (val is int i) return i;
            if (val is float f) return f;
            if (val is double d) return d;
            if (val is Vector3 v3) return Vec3ToDict(v3);
            if (val is Vector2 v2) return new Dictionary<string, object> { { "x", v2.x }, { "y", v2.y } };
            if (val is Quaternion q) return new Dictionary<string, object> { { "x", q.x }, { "y", q.y }, { "z", q.z }, { "w", q.w } };
            if (val is Color c) return new Dictionary<string, object> { { "r", c.r }, { "g", c.g }, { "b", c.b }, { "a", c.a } };
            if (val is Enum e) return e.ToString();
            if (val is UnityEngine.Object uObj) return uObj != null ? uObj.name : null;
            return val.ToString();
        }

        private static Dictionary<string, object> Vec3ToDict(Vector3 v)
        {
            return new Dictionary<string, object>
            {
                { "x", v.x },
                { "y", v.y },
                { "z", v.z }
            };
        }
    }
}
