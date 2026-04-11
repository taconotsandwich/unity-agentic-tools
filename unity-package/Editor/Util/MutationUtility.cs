using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Util
{
    internal static class MutationUtility
    {
        public static string NormalizeHierarchyPath(string hierarchyPath)
        {
            return string.IsNullOrWhiteSpace(hierarchyPath)
                ? string.Empty
                : hierarchyPath.Trim().Trim('/');
        }

        public static GameObject ResolveGameObject(
            AssetMutationContext context,
            string hierarchyPath,
            bool allowEmpty = false)
        {
            var normalizedPath = NormalizeHierarchyPath(hierarchyPath);
            if (normalizedPath == string.Empty)
            {
                if (allowEmpty)
                {
                    return null;
                }

                throw new InvalidOperationException("Hierarchy path must not be empty.");
            }

            var segments = normalizedPath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0)
            {
                throw new InvalidOperationException($"Invalid hierarchy path \"{hierarchyPath}\".");
            }

            Transform current = null;
            var matchingRoots = context.GetRootGameObjects()
                .Where(root => root.name == segments[0])
                .ToArray();

            if (matchingRoots.Length == 0)
            {
                throw new InvalidOperationException(
                    $"Could not resolve hierarchy path \"{normalizedPath}\" in {context.AssetPath}.");
            }

            if (matchingRoots.Length > 1)
            {
                throw new InvalidOperationException(
                    $"Hierarchy path \"{normalizedPath}\" is ambiguous because multiple root GameObjects are named \"{segments[0]}\".");
            }

            current = matchingRoots[0].transform;
            for (int index = 1; index < segments.Length; index += 1)
            {
                current = FindUniqueDirectChild(current, segments[index]);
            }

            return current.gameObject;
        }

        public static GameObject ResolveNearestExistingGameObject(
            AssetMutationContext context,
            string hierarchyPath,
            out string[] missingSegments)
        {
            var normalizedPath = NormalizeHierarchyPath(hierarchyPath);
            if (normalizedPath == string.Empty)
            {
                throw new InvalidOperationException("Hierarchy path must not be empty.");
            }

            var segments = normalizedPath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0)
            {
                throw new InvalidOperationException($"Invalid hierarchy path \"{hierarchyPath}\".");
            }

            var matchingRoots = context.GetRootGameObjects()
                .Where(root => root.name == segments[0])
                .ToArray();

            if (matchingRoots.Length == 0)
            {
                throw new InvalidOperationException(
                    $"Could not resolve hierarchy path \"{normalizedPath}\" in {context.AssetPath}.");
            }

            if (matchingRoots.Length > 1)
            {
                throw new InvalidOperationException(
                    $"Hierarchy path \"{normalizedPath}\" is ambiguous because multiple root GameObjects are named \"{segments[0]}\".");
            }

            var current = matchingRoots[0].transform;
            var missingStart = segments.Length;
            for (int index = 1; index < segments.Length; index += 1)
            {
                var next = FindDirectChildOrNull(current, segments[index]);
                if (next == null)
                {
                    missingStart = index;
                    break;
                }

                current = next;
            }

            if (missingStart == segments.Length)
            {
                missingSegments = Array.Empty<string>();
            }
            else
            {
                missingSegments = segments.Skip(missingStart).ToArray();
            }

            return current.gameObject;
        }

        public static Component ResolveComponent(GameObject gameObject, string componentType, int componentIndex)
        {
            if (gameObject == null)
            {
                throw new InvalidOperationException("GameObject must not be null when resolving a component.");
            }

            if (string.IsNullOrWhiteSpace(componentType))
            {
                throw new InvalidOperationException("Missing required parameter: componentType");
            }

            if (componentIndex < 0)
            {
                throw new InvalidOperationException("componentIndex must be >= 0.");
            }

            var matches = gameObject.GetComponents<Component>()
                .Where(component => component != null && ComponentTypeMatches(component.GetType(), componentType))
                .ToArray();

            if (matches.Length == 0)
            {
                throw new InvalidOperationException(
                    $"Component \"{componentType}\" not found on \"{GetHierarchyPath(gameObject.transform)}\".");
            }

            if (componentIndex >= matches.Length)
            {
                throw new InvalidOperationException(
                    $"Component index {componentIndex} is out of range for \"{componentType}\" on \"{GetHierarchyPath(gameObject.transform)}\". Found {matches.Length} matching component(s).");
            }

            return matches[componentIndex];
        }

        public static Type ResolveComponentType(string componentType)
        {
            var resolvedType = ResolveType(componentType);
            if (resolvedType == null)
            {
                throw new InvalidOperationException($"Could not resolve component type \"{componentType}\".");
            }

            if (!typeof(Component).IsAssignableFrom(resolvedType))
            {
                throw new InvalidOperationException(
                    $"Resolved type \"{resolvedType.FullName}\" is not a Unity Component type.");
            }

            return resolvedType;
        }

        public static Type ResolveType(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName))
            {
                return null;
            }

            var directType = Type.GetType(typeName);
            if (directType != null)
            {
                return directType;
            }

            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try
                {
                    types = assembly.GetTypes();
                }
                catch (ReflectionTypeLoadException ex)
                {
                    types = ex.Types.Where(type => type != null).ToArray();
                }
                catch
                {
                    continue;
                }

                foreach (var candidate in types)
                {
                    if (candidate == null)
                    {
                        continue;
                    }

                    if (string.Equals(candidate.FullName, typeName, StringComparison.Ordinal) ||
                        string.Equals(candidate.Name, typeName, StringComparison.Ordinal))
                    {
                        return candidate;
                    }
                }
            }

            return null;
        }

        public static void ApplyPrefabOverridesIfNeeded(UnityEngine.Object unityObject)
        {
            if (unityObject == null)
            {
                return;
            }

            if (PrefabUtility.IsPartOfPrefabInstance(unityObject))
            {
                PrefabUtility.RecordPrefabInstancePropertyModifications(unityObject);
            }
        }

        public static string GetHierarchyPath(Transform transform)
        {
            if (transform == null)
            {
                return string.Empty;
            }

            var names = new List<string>();
            var current = transform;
            while (current != null)
            {
                names.Add(current.name);
                current = current.parent;
            }

            names.Reverse();
            return string.Join("/", names.ToArray());
        }

        public static string TryGetGlobalObjectIdMemberString(UnityEngine.Object unityObject, string memberName)
        {
            if (unityObject == null)
            {
                return null;
            }

            try
            {
                var globalObjectIdType = Type.GetType("UnityEditor.GlobalObjectId, UnityEditor");
                if (globalObjectIdType == null)
                {
                    return null;
                }

                var getMethod = globalObjectIdType.GetMethod(
                    "GetGlobalObjectIdSlow",
                    BindingFlags.Public | BindingFlags.Static,
                    null,
                    new[] { typeof(UnityEngine.Object) },
                    null);
                if (getMethod == null)
                {
                    return null;
                }

                var globalObjectId = getMethod.Invoke(null, new object[] { unityObject });
                if (globalObjectId == null)
                {
                    return null;
                }

                var field = globalObjectIdType.GetField(memberName, BindingFlags.Public | BindingFlags.Instance);
                if (field != null)
                {
                    var value = field.GetValue(globalObjectId);
                    return value != null ? value.ToString() : null;
                }

                var property = globalObjectIdType.GetProperty(memberName, BindingFlags.Public | BindingFlags.Instance);
                if (property != null)
                {
                    var value = property.GetValue(globalObjectId, null);
                    return value != null ? value.ToString() : null;
                }
            }
            catch
            {
            }

            return null;
        }

        public static Vector3 ParseVector3(string rawValue, string fieldName)
        {
            if (string.IsNullOrWhiteSpace(rawValue))
            {
                throw new InvalidOperationException($"Missing required vector value for {fieldName}.");
            }

            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 3)
            {
                throw new InvalidOperationException(
                    $"Invalid {fieldName} value \"{rawValue}\". Expected three comma-separated numbers.");
            }

            return new Vector3(
                ParseSingle(parts[0], $"{fieldName}.x"),
                ParseSingle(parts[1], $"{fieldName}.y"),
                ParseSingle(parts[2], $"{fieldName}.z"));
        }

        public static bool TrySetPropertyValue(SerializedProperty property, string rawValue, out string error)
        {
            error = null;
            if (property == null)
            {
                error = "Serialized property not found.";
                return false;
            }

            switch (property.propertyType)
            {
                case SerializedPropertyType.Integer:
                    long longValue;
                    if (!long.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out longValue))
                    {
                        error = $"Expected an integer value, got \"{rawValue}\".";
                        return false;
                    }

                    try
                    {
                        property.longValue = longValue;
                    }
                    catch
                    {
                        property.intValue = (int)longValue;
                    }

                    return true;

                case SerializedPropertyType.Boolean:
                    bool boolValue;
                    if (!bool.TryParse(rawValue, out boolValue))
                    {
                        error = $"Expected true or false, got \"{rawValue}\".";
                        return false;
                    }

                    property.boolValue = boolValue;
                    return true;

                case SerializedPropertyType.Float:
                    float floatValue;
                    if (!float.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out floatValue))
                    {
                        error = $"Expected a numeric value, got \"{rawValue}\".";
                        return false;
                    }

                    property.floatValue = floatValue;
                    return true;

                case SerializedPropertyType.String:
                    property.stringValue = rawValue ?? string.Empty;
                    return true;

                case SerializedPropertyType.Enum:
                    int enumIndex;
                    if (int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out enumIndex))
                    {
                        property.enumValueIndex = enumIndex;
                        return true;
                    }

                    var matchedIndex = Array.FindIndex(
                        property.enumNames,
                        name => string.Equals(name, rawValue, StringComparison.OrdinalIgnoreCase));
                    if (matchedIndex < 0)
                    {
                        matchedIndex = Array.FindIndex(
                            property.enumDisplayNames,
                            name => string.Equals(name, rawValue, StringComparison.OrdinalIgnoreCase));
                    }

                    if (matchedIndex < 0)
                    {
                        error = $"Enum value \"{rawValue}\" is not valid for {property.propertyPath}.";
                        return false;
                    }

                    property.enumValueIndex = matchedIndex;
                    return true;

                case SerializedPropertyType.Color:
                    Color colorValue;
                    if (!TryParseColor(rawValue, out colorValue))
                    {
                        error = $"Expected a color in r,g,b,a or #RRGGBB format, got \"{rawValue}\".";
                        return false;
                    }

                    property.colorValue = colorValue;
                    return true;

                case SerializedPropertyType.ObjectReference:
                    if (string.IsNullOrWhiteSpace(rawValue) ||
                        string.Equals(rawValue, "null", StringComparison.OrdinalIgnoreCase))
                    {
                        property.objectReferenceValue = null;
                        return true;
                    }

                    var reference = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(rawValue);
                    if (reference == null)
                    {
                        error = $"Could not load object reference at \"{rawValue}\".";
                        return false;
                    }

                    property.objectReferenceValue = reference;
                    return true;

                case SerializedPropertyType.LayerMask:
                    int layerMask;
                    if (!int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out layerMask))
                    {
                        error = $"Expected an integer layer mask, got \"{rawValue}\".";
                        return false;
                    }

                    property.intValue = layerMask;
                    return true;

                case SerializedPropertyType.Vector2:
                    Vector2 vector2Value;
                    if (!TryParseVector2(rawValue, out vector2Value))
                    {
                        error = $"Expected two comma-separated numbers, got \"{rawValue}\".";
                        return false;
                    }

                    property.vector2Value = vector2Value;
                    return true;

                case SerializedPropertyType.Vector3:
                    property.vector3Value = ParseVector3(rawValue, property.propertyPath);
                    return true;

                case SerializedPropertyType.Vector4:
                    Vector4 vector4Value;
                    if (!TryParseVector4(rawValue, out vector4Value))
                    {
                        error = $"Expected four comma-separated numbers, got \"{rawValue}\".";
                        return false;
                    }

                    property.vector4Value = vector4Value;
                    return true;

                case SerializedPropertyType.Rect:
                    Rect rectValue;
                    if (!TryParseRect(rawValue, out rectValue))
                    {
                        error = $"Expected x,y,width,height for rect values, got \"{rawValue}\".";
                        return false;
                    }

                    property.rectValue = rectValue;
                    return true;

                case SerializedPropertyType.Bounds:
                    Bounds boundsValue;
                    if (!TryParseBounds(rawValue, out boundsValue))
                    {
                        error = $"Expected centerX,centerY,centerZ,sizeX,sizeY,sizeZ for bounds values, got \"{rawValue}\".";
                        return false;
                    }

                    property.boundsValue = boundsValue;
                    return true;

                default:
                    error = $"Serialized property type {property.propertyType} is not supported for direct string updates.";
                    return false;
            }
        }

        private static Transform FindUniqueDirectChild(Transform parent, string childName)
        {
            var child = FindDirectChildOrNull(parent, childName);
            if (child == null)
            {
                throw new InvalidOperationException(
                    $"Could not resolve child \"{childName}\" under \"{GetHierarchyPath(parent)}\".");
            }

            return child;
        }

        private static Transform FindDirectChildOrNull(Transform parent, string childName)
        {
            Transform match = null;
            for (int index = 0; index < parent.childCount; index += 1)
            {
                var child = parent.GetChild(index);
                if (!string.Equals(child.name, childName, StringComparison.Ordinal))
                {
                    continue;
                }

                if (match != null)
                {
                    throw new InvalidOperationException(
                        $"Hierarchy path is ambiguous under \"{GetHierarchyPath(parent)}\" because multiple children are named \"{childName}\".");
                }

                match = child;
            }

            return match;
        }

        private static bool ComponentTypeMatches(Type candidateType, string requestedType)
        {
            return string.Equals(candidateType.Name, requestedType, StringComparison.Ordinal) ||
                   string.Equals(candidateType.FullName, requestedType, StringComparison.Ordinal) ||
                   string.Equals(candidateType.Name, requestedType, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(candidateType.FullName, requestedType, StringComparison.OrdinalIgnoreCase);
        }

        private static float ParseSingle(string rawValue, string fieldName)
        {
            float parsedValue;
            if (!float.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out parsedValue))
            {
                throw new InvalidOperationException($"Invalid numeric value \"{rawValue}\" for {fieldName}.");
            }

            return parsedValue;
        }

        private static bool TryParseVector2(string rawValue, out Vector2 vector)
        {
            vector = default(Vector2);
            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 2)
            {
                return false;
            }

            float x;
            float y;
            if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out x) ||
                !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out y))
            {
                return false;
            }

            vector = new Vector2(x, y);
            return true;
        }

        private static bool TryParseVector4(string rawValue, out Vector4 vector)
        {
            vector = default(Vector4);
            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 4)
            {
                return false;
            }

            float x;
            float y;
            float z;
            float w;
            if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out x) ||
                !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out y) ||
                !float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out z) ||
                !float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out w))
            {
                return false;
            }

            vector = new Vector4(x, y, z, w);
            return true;
        }

        private static bool TryParseRect(string rawValue, out Rect rect)
        {
            rect = default(Rect);
            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 4)
            {
                return false;
            }

            float x;
            float y;
            float width;
            float height;
            if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out x) ||
                !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out y) ||
                !float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out width) ||
                !float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out height))
            {
                return false;
            }

            rect = new Rect(x, y, width, height);
            return true;
        }

        private static bool TryParseBounds(string rawValue, out Bounds bounds)
        {
            bounds = default(Bounds);
            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 6)
            {
                return false;
            }

            float centerX;
            float centerY;
            float centerZ;
            float sizeX;
            float sizeY;
            float sizeZ;
            if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out centerX) ||
                !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out centerY) ||
                !float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out centerZ) ||
                !float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out sizeX) ||
                !float.TryParse(parts[4], NumberStyles.Float, CultureInfo.InvariantCulture, out sizeY) ||
                !float.TryParse(parts[5], NumberStyles.Float, CultureInfo.InvariantCulture, out sizeZ))
            {
                return false;
            }

            bounds = new Bounds(
                new Vector3(centerX, centerY, centerZ),
                new Vector3(sizeX, sizeY, sizeZ));
            return true;
        }

        private static bool TryParseColor(string rawValue, out Color color)
        {
            color = default(Color);

            if (ColorUtility.TryParseHtmlString(rawValue, out color))
            {
                return true;
            }

            var parts = rawValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Trim())
                .ToArray();
            if (parts.Length != 3 && parts.Length != 4)
            {
                return false;
            }

            float r;
            float g;
            float b;
            if (!float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out r) ||
                !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out g) ||
                !float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out b))
            {
                return false;
            }

            var a = 1f;
            if (parts.Length == 4 &&
                !float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out a))
            {
                return false;
            }

            color = new Color(r, g, b, a);
            return true;
        }
    }
}
