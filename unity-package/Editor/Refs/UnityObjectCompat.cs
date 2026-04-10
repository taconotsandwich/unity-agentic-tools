using System;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Refs
{
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

        public static int GetObjectId(UnityEngine.Object obj)
        {
            if (obj == null)
            {
                return 0;
            }

#pragma warning disable CS0618
            return obj.GetInstanceID();
#pragma warning restore CS0618
        }

        public static UnityEngine.Object ResolveObject(int objectId)
        {
            if (objectId == 0)
            {
                return null;
            }

#pragma warning disable CS0618
            return EditorUtility.InstanceIDToObject(objectId);
#pragma warning restore CS0618
        }
    }
}
