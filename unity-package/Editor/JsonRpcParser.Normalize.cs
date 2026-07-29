using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools
{
    public static partial class JsonRpcParser
    {
        private const int MaxReflectionDepth = 8;
        private const string CyclicValuePlaceholder = "<cyclic>";

        public static object NormalizeValueForTransport(object value)
        {
            return NormalizeValueForTransport(value, 0, null);
        }

        public static bool IsTransportSafeValue(object value)
        {
            return IsTransportSafeValue(value, null);
        }

        // Containers recurse without a depth cap (scene hierarchies nest arbitrarily);
        // `path` breaks reference cycles, and only reflection hops consume the depth budget.
        private static object NormalizeValueForTransport(object value, int reflectionDepth, HashSet<object> path)
        {
            if (value == null ||
                value is string ||
                value is bool ||
                value is int ||
                value is long ||
                value is uint ||
                value is ulong ||
                value is short ||
                value is ushort ||
                value is byte ||
                value is sbyte ||
                value is decimal ||
                value is float ||
                value is double)
            {
                return value;
            }

            if (value is Enum enumValue)
            {
                return enumValue.ToString();
            }

            if (value is UnityEngine.Object unityObject)
            {
                return BuildUnityObjectPayload(unityObject);
            }

            if (value is Dictionary<string, object> typedDict)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return CyclicValuePlaceholder;
                }

                try
                {
                    var normalized = new Dictionary<string, object>();
                    foreach (var kvp in typedDict)
                    {
                        normalized[kvp.Key] = NormalizeValueForTransport(kvp.Value, reflectionDepth, path);
                    }

                    return normalized;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is IDictionary dictionary)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return CyclicValuePlaceholder;
                }

                try
                {
                    var normalized = new Dictionary<string, object>();
                    foreach (DictionaryEntry entry in dictionary)
                    {
                        var key = entry.Key == null ? "null" : entry.Key.ToString();
                        normalized[key] = NormalizeValueForTransport(entry.Value, reflectionDepth, path);
                    }

                    return normalized;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is Array array)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return CyclicValuePlaceholder;
                }

                try
                {
                    var normalized = new List<object>();
                    foreach (var item in array)
                    {
                        normalized.Add(NormalizeValueForTransport(item, reflectionDepth, path));
                    }

                    return normalized;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is IEnumerable enumerable)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return CyclicValuePlaceholder;
                }

                try
                {
                    var normalized = new List<object>();
                    foreach (var item in enumerable)
                    {
                        normalized.Add(NormalizeValueForTransport(item, reflectionDepth, path));
                    }

                    return normalized;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (reflectionDepth >= MaxReflectionDepth)
            {
                return value.ToString();
            }

            return NormalizeObject(value, reflectionDepth, path);
        }

        private static bool IsTransportSafeValue(object value, HashSet<object> path)
        {
            if (value == null ||
                value is string ||
                value is bool ||
                value is int ||
                value is long ||
                value is uint ||
                value is ulong ||
                value is short ||
                value is ushort ||
                value is byte ||
                value is sbyte ||
                value is decimal ||
                value is float ||
                value is double)
            {
                return true;
            }

            if (value is UnityEngine.Object)
            {
                return false;
            }

            if (value is Dictionary<string, object> typedDict)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return false;
                }

                try
                {
                    foreach (var kvp in typedDict)
                    {
                        if (!IsTransportSafeValue(kvp.Value, path))
                        {
                            return false;
                        }
                    }

                    return true;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is IDictionary dictionary)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return false;
                }

                try
                {
                    foreach (DictionaryEntry entry in dictionary)
                    {
                        if (!(entry.Key is string) || !IsTransportSafeValue(entry.Value, path))
                        {
                            return false;
                        }
                    }

                    return true;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is Array array)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return false;
                }

                try
                {
                    foreach (var item in array)
                    {
                        if (!IsTransportSafeValue(item, path))
                        {
                            return false;
                        }
                    }

                    return true;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            if (value is IEnumerable enumerable)
            {
                path = path ?? new HashSet<object>(ReferenceComparer.Instance);
                if (!path.Add(value))
                {
                    return false;
                }

                try
                {
                    foreach (var item in enumerable)
                    {
                        if (!IsTransportSafeValue(item, path))
                        {
                            return false;
                        }
                    }

                    return true;
                }
                finally
                {
                    path.Remove(value);
                }
            }

            return false;
        }

        private static string SerializeUnityObject(UnityEngine.Object unityObject)
        {
            return SerializeValue(BuildUnityObjectPayload(unityObject));
        }

        private static Dictionary<string, object> BuildUnityObjectPayload(UnityEngine.Object unityObject)
        {
            if (unityObject == null)
            {
                return null;
            }

            var payload = new Dictionary<string, object>
            {
                { "type", GetUnityTypeName(unityObject) }
            };

            TryAddUnityProperty(payload, "name", () => unityObject.name);
            TryAddUnityProperty(payload, "instanceId", () => UnityObjectCompat.GetObjectId(unityObject));

            if (unityObject is GameObject gameObject)
            {
                TryAddUnityProperty(payload, "path", () => GetHierarchyPath(gameObject.transform));
                TryAddUnityProperty(payload, "activeSelf", () => gameObject.activeSelf);
                TryAddUnityProperty(payload, "activeInHierarchy", () => gameObject.activeInHierarchy);

                if (gameObject.scene.IsValid())
                {
                    TryAddUnityProperty(payload, "scene", () => gameObject.scene.name);
                    TryAddUnityProperty(payload, "scenePath", () => gameObject.scene.path);
                }
            }
            else if (unityObject is Component component)
            {
                TryAddUnityProperty(payload, "gameObjectInstanceId", () => UnityObjectCompat.GetObjectId(component.gameObject));
                TryAddUnityProperty(payload, "path", () => GetHierarchyPath(component.transform));

                if (component.gameObject.scene.IsValid())
                {
                    TryAddUnityProperty(payload, "scene", () => component.gameObject.scene.name);
                    TryAddUnityProperty(payload, "scenePath", () => component.gameObject.scene.path);
                }
            }

            TryAddUnityProperty(payload, "assetPath", () => AssetDatabase.GetAssetPath(unityObject));
            return payload;
        }

        private static string GetUnityTypeName(UnityEngine.Object unityObject)
        {
            try
            {
                return unityObject == null ? "UnityEngine.Object" : unityObject.GetType().Name;
            }
            catch
            {
                return "UnityEngine.Object";
            }
        }

        private static void TryAddUnityProperty(Dictionary<string, object> payload, string key, Func<object> supplier)
        {
            try
            {
                var value = supplier();
                if (value != null)
                {
                    payload[key] = value;
                }
            }
            catch
            {
            }
        }

        private static string GetHierarchyPath(Transform transform)
        {
            if (transform == null)
            {
                return string.Empty;
            }

            try
            {
                var names = new List<string>();
                var current = transform;
                while (current != null)
                {
                    names.Add(current.name);
                    current = current.parent;
                }

                names.Reverse();
                return string.Join("/", names);
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string SerializeObject(object obj)
        {
            return SerializeValue(NormalizeObject(obj, 0, null));
        }

        private static Dictionary<string, object> NormalizeObject(object obj, int reflectionDepth, HashSet<object> path)
        {
            var type = obj.GetType();
            var fields = type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            var properties = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            var normalized = new Dictionary<string, object>();

            foreach (var field in fields)
            {
                var value = field.GetValue(obj);
                normalized[field.Name] = NormalizeValueForTransport(value, reflectionDepth + 1, path);
            }

            foreach (var property in properties)
            {
                if (!property.CanRead || property.GetIndexParameters().Length > 0)
                {
                    continue;
                }

                try
                {
                    var value = property.GetValue(obj);
                    normalized[property.Name] = NormalizeValueForTransport(value, reflectionDepth + 1, path);
                }
                catch
                {
                }
            }

            return normalized;
        }

        private sealed class ReferenceComparer : IEqualityComparer<object>
        {
            public static readonly ReferenceComparer Instance = new ReferenceComparer();

            bool IEqualityComparer<object>.Equals(object x, object y)
            {
                return ReferenceEquals(x, y);
            }

            int IEqualityComparer<object>.GetHashCode(object obj)
            {
                return System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(obj);
            }
        }
    }
}
