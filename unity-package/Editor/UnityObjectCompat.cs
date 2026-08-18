using System;
using System.Globalization;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools
{
    public readonly struct UnityObjectId : IEquatable<UnityObjectId>
    {
        private readonly ulong _rawValue;

        public static UnityObjectId None => new UnityObjectId(0);

        internal UnityObjectId(ulong rawValue)
        {
            _rawValue = rawValue;
        }

        internal ulong RawValue => _rawValue;

#if UNITY_6000_3_OR_NEWER
        internal static string StorageFormat => "entity-id";
#else
        internal static string StorageFormat => "instance-id";
#endif

        public bool IsNone => _rawValue == 0;

        public string Serialize()
        {
            return _rawValue.ToString(CultureInfo.InvariantCulture);
        }

        public static bool TryDeserialize(string value, out UnityObjectId objectId)
        {
            if (!ulong.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out ulong rawValue))
            {
                objectId = None;
                return false;
            }

#if !UNITY_6000_3_OR_NEWER
            if (rawValue > uint.MaxValue)
            {
                objectId = None;
                return false;
            }
#endif

            objectId = new UnityObjectId(rawValue);
            return true;
        }

        public bool Equals(UnityObjectId other)
        {
            return _rawValue == other._rawValue;
        }

        public override bool Equals(object obj)
        {
            return obj is UnityObjectId other && Equals(other);
        }

        public override int GetHashCode()
        {
            return _rawValue.GetHashCode();
        }
    }

    internal static class UnityObjectCompat
    {
        private static readonly MethodInfo FindAnyObjectByTypeMethod = typeof(UnityEngine.Object)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(method =>
                method.Name == "FindAnyObjectByType" &&
                method.IsGenericMethodDefinition &&
                method.GetParameters().Length == 0);

        private static readonly MethodInfo FindObjectsByTypeGenericMethod = typeof(UnityEngine.Object)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(method =>
                method.Name == "FindObjectsByType" &&
                method.IsGenericMethodDefinition &&
                method.GetParameters().Length == 0);

        private static readonly MethodInfo FindObjectsByTypeMethod = typeof(UnityEngine.Object)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(method =>
                method.Name == "FindObjectsByType" &&
                !method.IsGenericMethodDefinition &&
                method.GetParameters().Length == 1 &&
                method.GetParameters()[0].ParameterType == typeof(Type));

        public static T FindAnyObject<T>() where T : UnityEngine.Object
        {
            if (FindAnyObjectByTypeMethod != null)
            {
                return FindAnyObjectByTypeMethod.MakeGenericMethod(typeof(T)).Invoke(null, null) as T;
            }

#pragma warning disable CS0618
            return UnityEngine.Object.FindFirstObjectByType<T>();
#pragma warning restore CS0618
        }

        public static T[] FindObjects<T>() where T : UnityEngine.Object
        {
            if (FindObjectsByTypeGenericMethod != null)
            {
                var result = FindObjectsByTypeGenericMethod.MakeGenericMethod(typeof(T)).Invoke(null, null);
                if (result is T[] typedResult)
                {
                    return typedResult;
                }
            }

#pragma warning disable CS0618
            return UnityEngine.Object.FindObjectsByType<T>(FindObjectsSortMode.None);
#pragma warning restore CS0618
        }

        public static UnityEngine.Object[] FindObjects(Type type)
        {
            if (type == null)
            {
                return Array.Empty<UnityEngine.Object>();
            }

            if (FindObjectsByTypeMethod != null)
            {
                var result = FindObjectsByTypeMethod.Invoke(null, new object[] { type });
                if (result is UnityEngine.Object[] typedResult)
                {
                    return typedResult;
                }
            }

#pragma warning disable CS0618
            return UnityEngine.Object.FindObjectsOfType(type);
#pragma warning restore CS0618
        }

        public static UnityObjectId GetObjectId(UnityEngine.Object obj)
        {
            if (obj == null)
            {
                return UnityObjectId.None;
            }

#if UNITY_6000_3_OR_NEWER
            return new UnityObjectId(EntityId.ToULong(obj.GetEntityId()));
#else
#pragma warning disable CS0618
            int instanceId = obj.GetInstanceID();
#pragma warning restore CS0618
            return new UnityObjectId(unchecked((ulong)(uint)instanceId));
#endif
        }

        public static UnityEngine.Object ResolveObject(UnityObjectId objectId)
        {
            if (objectId.IsNone)
            {
                return null;
            }

#if UNITY_6000_3_OR_NEWER
            return EditorUtility.EntityIdToObject(EntityId.FromULong(objectId.RawValue));
#else
            int instanceId = unchecked((int)(uint)objectId.RawValue);
#pragma warning disable CS0618
            return EditorUtility.InstanceIDToObject(instanceId);
#pragma warning restore CS0618
#endif
        }
    }
}
