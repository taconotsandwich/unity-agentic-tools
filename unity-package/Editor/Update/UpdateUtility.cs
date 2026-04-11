using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityAgenticTools.Util;
using UnityEngine;

namespace UnityAgenticTools.Update
{
    internal static class UpdateUtility
    {
        [Serializable]
        private sealed class ValueEdit
        {
            public string path;
            public string value;
        }

        [Serializable]
        private sealed class ArrayEditPayload
        {
            public int index = -1;
            public string value;
        }

        [Serializable]
        private sealed class GameObjectEdit
        {
            public string gameObjectPath;
            public string propertyPath;
            public string value;
        }

        [Serializable]
        private sealed class GameObjectEditList
        {
            public GameObjectEdit[] edits;
            public GameObjectEdit[] items;
        }

        [Serializable]
        private sealed class ComponentEdit
        {
            public string gameObjectPath;
            public string componentType;
            public int componentIndex;
            public string propertyPath;
            public string value;
        }

        [Serializable]
        private sealed class ComponentEditList
        {
            public ComponentEdit[] edits;
            public ComponentEdit[] items;
        }

        public static object GameObject(string assetPath, string gameObjectPath, string propertyPath, string value)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                ApplySerializedPropertyUpdate(gameObject, propertyPath, value);
                MutationUtility.ApplyPrefabOverridesIfNeeded(gameObject);
                context.MarkDirty(gameObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "propertyPath", propertyPath },
                    { "value", value }
                };
            }
        }

        public static object Component(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var component = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                ApplySerializedPropertyUpdate(component, propertyPath, value);
                MutationUtility.ApplyPrefabOverridesIfNeeded(component);
                context.MarkDirty(component);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", component.GetType().FullName ?? component.GetType().Name },
                    { "componentIndex", componentIndex },
                    { "propertyPath", propertyPath },
                    { "value", value }
                };
            }
        }

        public static object Transform(
            string assetPath,
            string gameObjectPath,
            string position = "",
            string rotation = "",
            string scale = "")
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                if (!string.IsNullOrWhiteSpace(position))
                {
                    gameObject.transform.localPosition = MutationUtility.ParseVector3(position, "position");
                }

                if (!string.IsNullOrWhiteSpace(rotation))
                {
                    var eulerAngles = MutationUtility.ParseVector3(rotation, "rotation");
                    gameObject.transform.localRotation = Quaternion.Euler(eulerAngles);
                }

                if (!string.IsNullOrWhiteSpace(scale))
                {
                    gameObject.transform.localScale = MutationUtility.ParseVector3(scale, "scale");
                }

                MutationUtility.ApplyPrefabOverridesIfNeeded(gameObject.transform);
                context.MarkDirty(gameObject.transform);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "position", SerializeVector3(gameObject.transform.localPosition) },
                    { "rotation", SerializeVector3(gameObject.transform.localEulerAngles) },
                    { "scale", SerializeVector3(gameObject.transform.localScale) }
                };
            }
        }

        public static object Parent(string assetPath, string gameObjectPath, string newParentPath = "")
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var normalizedNewParent = MutationUtility.NormalizeHierarchyPath(newParentPath);
                Transform newParent = null;
                if (normalizedNewParent != string.Empty &&
                    !string.Equals(normalizedNewParent, "root", StringComparison.OrdinalIgnoreCase))
                {
                    newParent = MutationUtility.ResolveGameObject(context, normalizedNewParent).transform;
                }

                if (context.IsPrefabAsset && newParent == null && gameObject != context.PrefabRoot)
                {
                    throw new InvalidOperationException(
                        "Reparenting a child GameObject to prefab root requires an explicit parent path in prefab assets to avoid creating multiple roots.");
                }

                gameObject.transform.SetParent(newParent, false);
                MutationUtility.ApplyPrefabOverridesIfNeeded(gameObject.transform);
                context.MarkDirty(gameObject.transform);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "newParentPath", newParent != null ? MutationUtility.GetHierarchyPath(newParent) : string.Empty }
                };
            }
        }

        public static object Array(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string arrayProperty,
            string action,
            string payloadJson = "")
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var component = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                var serialized = new SerializedObject(component);
                var property = serialized.FindProperty(arrayProperty);
                if (property == null || !property.isArray || property.propertyType == SerializedPropertyType.String)
                {
                    throw new InvalidOperationException(
                        $"Property \"{arrayProperty}\" is not a supported serialized array on {component.GetType().Name}.");
                }

                var payload = ParseJsonObject<ArrayEditPayload>(payloadJson);
                var actionName = (action ?? string.Empty).Trim().ToLowerInvariant();

                switch (actionName)
                {
                    case "insert":
                        if (payload == null || payload.index < 0)
                        {
                            throw new InvalidOperationException("Array insert requires payload {\"index\": <n>, \"value\": \"...\"}.");
                        }
                        property.InsertArrayElementAtIndex(payload.index);
                        if (payload.value != null)
                        {
                            var insertedElement = property.GetArrayElementAtIndex(payload.index);
                            string setError;
                            if (!MutationUtility.TrySetPropertyValue(insertedElement, payload.value, out setError))
                            {
                                throw new InvalidOperationException(setError);
                            }
                        }
                        break;

                    case "append":
                        var appendIndex = property.arraySize;
                        property.InsertArrayElementAtIndex(appendIndex);
                        if (payload != null && payload.value != null)
                        {
                            var appendedElement = property.GetArrayElementAtIndex(appendIndex);
                            string appendError;
                            if (!MutationUtility.TrySetPropertyValue(appendedElement, payload.value, out appendError))
                            {
                                throw new InvalidOperationException(appendError);
                            }
                        }
                        break;

                    case "remove":
                        if (payload == null || payload.index < 0)
                        {
                            throw new InvalidOperationException("Array remove requires payload {\"index\": <n>}.");
                        }
                        property.DeleteArrayElementAtIndex(payload.index);
                        break;

                    default:
                        throw new InvalidOperationException("Array action must be one of: insert, append, remove.");
                }

                serialized.ApplyModifiedPropertiesWithoutUndo();
                MutationUtility.ApplyPrefabOverridesIfNeeded(component);
                context.MarkDirty(component);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", component.GetType().FullName ?? component.GetType().Name },
                    { "componentIndex", componentIndex },
                    { "arrayProperty", arrayProperty },
                    { "action", actionName },
                    { "arraySize", property.arraySize }
                };
            }
        }

        public static object Batch(string assetPath, string editsJson)
        {
            var edits = ParseJsonList<GameObjectEditList, GameObjectEdit>(editsJson);
            using (var context = AssetMutationContext.Open(assetPath))
            {
                foreach (var edit in edits)
                {
                    if (string.IsNullOrWhiteSpace(edit.gameObjectPath) ||
                        string.IsNullOrWhiteSpace(edit.propertyPath))
                    {
                        throw new InvalidOperationException("Each batch edit requires gameObjectPath and propertyPath.");
                    }

                    var gameObject = MutationUtility.ResolveGameObject(context, edit.gameObjectPath);
                    ApplySerializedPropertyUpdate(gameObject, edit.propertyPath, edit.value);
                    MutationUtility.ApplyPrefabOverridesIfNeeded(gameObject);
                    context.MarkDirty(gameObject);
                }

                context.Save();
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", assetPath },
                { "editCount", edits.Count }
            };
        }

        public static object BatchComponents(string assetPath, string editsJson)
        {
            var edits = ParseJsonList<ComponentEditList, ComponentEdit>(editsJson);
            using (var context = AssetMutationContext.Open(assetPath))
            {
                foreach (var edit in edits)
                {
                    if (string.IsNullOrWhiteSpace(edit.gameObjectPath) ||
                        string.IsNullOrWhiteSpace(edit.componentType) ||
                        string.IsNullOrWhiteSpace(edit.propertyPath))
                    {
                        throw new InvalidOperationException(
                            "Each component batch edit requires gameObjectPath, componentType, and propertyPath.");
                    }

                    var gameObject = MutationUtility.ResolveGameObject(context, edit.gameObjectPath);
                    var component = MutationUtility.ResolveComponent(
                        gameObject,
                        edit.componentType,
                        edit.componentIndex);
                    ApplySerializedPropertyUpdate(component, edit.propertyPath, edit.value);
                    MutationUtility.ApplyPrefabOverridesIfNeeded(component);
                    context.MarkDirty(component);
                }

                context.Save();
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", assetPath },
                { "editCount", edits.Count }
            };
        }

        public static object SiblingIndex(string assetPath, string gameObjectPath, int index)
        {
            if (index < 0)
            {
                throw new InvalidOperationException("Sibling index must be >= 0.");
            }

            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                gameObject.transform.SetSiblingIndex(index);
                MutationUtility.ApplyPrefabOverridesIfNeeded(gameObject.transform);
                context.MarkDirty(gameObject.transform);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "newIndex", gameObject.transform.GetSiblingIndex() }
                };
            }
        }

        public static object ManagedReference(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string fieldPath,
            string typeName,
            string initialValuesJson = "",
            bool append = false)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var component = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                AssignManagedReference(component, fieldPath, typeName, initialValuesJson, append);
                MutationUtility.ApplyPrefabOverridesIfNeeded(component);
                context.MarkDirty(component);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", component.GetType().FullName ?? component.GetType().Name },
                    { "componentIndex", componentIndex },
                    { "fieldPath", fieldPath },
                    { "typeName", typeName },
                    { "append", append }
                };
            }
        }

        public static object PrefabUnpack(string assetPath, string prefabInstancePath, string mode = "OutermostRoot")
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, prefabInstancePath);
                var instanceRoot = PrefabUtility.GetNearestPrefabInstanceRoot(gameObject);
                if (instanceRoot == null)
                {
                    throw new InvalidOperationException(
                        $"\"{prefabInstancePath}\" is not part of a prefab instance.");
                }

                PrefabUnpackMode unpackMode;
                if (!Enum.TryParse(mode, true, out unpackMode))
                {
                    throw new InvalidOperationException(
                        $"Invalid unpack mode \"{mode}\". Use OutermostRoot or Completely.");
                }

                PrefabUtility.UnpackPrefabInstance(instanceRoot, unpackMode, InteractionMode.AutomatedAction);
                context.MarkDirty(instanceRoot);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "prefabInstancePath", prefabInstancePath },
                    { "unpackedRootPath", MutationUtility.GetHierarchyPath(instanceRoot.transform) },
                    { "mode", unpackMode.ToString() }
                };
            }
        }

        public static object PrefabOverride(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            return ApplyPrefabOverrideUpdate(
                assetPath,
                gameObjectPath,
                componentType,
                componentIndex,
                propertyPath,
                value);
        }

        public static object PrefabBatchOverrides(string assetPath, string editsJson)
        {
            var edits = ParseJsonList<ComponentEditList, ComponentEdit>(editsJson);
            using (var context = AssetMutationContext.Open(assetPath))
            {
                foreach (var edit in edits)
                {
                    ApplyPrefabOverrideUpdate(
                        context,
                        edit.gameObjectPath,
                        edit.componentType,
                        edit.componentIndex,
                        edit.propertyPath,
                        edit.value);
                }

                context.Save();
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", assetPath },
                { "editCount", edits.Count }
            };
        }

        public static object PrefabManagedReference(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string fieldPath,
            string typeName,
            string initialValuesJson = "",
            bool append = false)
        {
            return ManagedReference(
                assetPath,
                gameObjectPath,
                componentType,
                componentIndex,
                fieldPath,
                typeName,
                initialValuesJson,
                append);
        }

        public static object PrefabRemoveOverride(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                UnityEngine.Object target = gameObject;
                if (!string.IsNullOrWhiteSpace(componentType))
                {
                    target = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                }

                if (!PrefabUtility.IsPartOfPrefabInstance(target))
                {
                    throw new InvalidOperationException(
                        $"\"{MutationUtility.GetHierarchyPath(gameObject.transform)}\" is not part of a prefab instance.");
                }

                var serialized = new SerializedObject(target);
                var property = serialized.FindProperty(propertyPath);
                if (property == null)
                {
                    throw new InvalidOperationException(
                        $"Property \"{propertyPath}\" was not found on {target.GetType().Name}.");
                }

                PrefabUtility.RevertPropertyOverride(property, InteractionMode.AutomatedAction);
                serialized.ApplyModifiedPropertiesWithoutUndo();
                context.MarkDirty(target);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "propertyPath", propertyPath }
                };
            }
        }

        public static object PrefabRemoveComponent(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                var component = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
                if (PrefabUtility.IsAddedComponentOverride(component))
                {
                    PrefabUtility.RevertAddedComponent(component, InteractionMode.AutomatedAction);
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(component, true);
                }

                context.MarkDirty(gameObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                    { "componentType", componentType },
                    { "componentIndex", componentIndex }
                };
            }
        }

        public static object PrefabRestoreComponent(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var instanceObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                if (!PrefabUtility.IsPartOfPrefabInstance(instanceObject))
                {
                    throw new InvalidOperationException(
                        $"\"{gameObjectPath}\" is not part of a prefab instance.");
                }

                var sourceObject = PrefabUtility.GetCorrespondingObjectFromSource(instanceObject);
                if (sourceObject == null)
                {
                    throw new InvalidOperationException(
                        $"Could not resolve source GameObject for prefab instance path \"{gameObjectPath}\".");
                }

                var sourceComponent = MutationUtility.ResolveComponent(
                    sourceObject,
                    componentType,
                    componentIndex);

                PrefabUtility.RevertRemovedComponent(
                    instanceObject,
                    sourceComponent,
                    InteractionMode.AutomatedAction);
                context.MarkDirty(instanceObject);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", MutationUtility.GetHierarchyPath(instanceObject.transform) },
                    { "componentType", componentType },
                    { "componentIndex", componentIndex }
                };
            }
        }

        public static object PrefabRemoveGameObject(string assetPath, string gameObjectPath)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
                if (PrefabUtility.IsAddedGameObjectOverride(gameObject))
                {
                    PrefabUtility.RevertAddedGameObject(gameObject, InteractionMode.AutomatedAction);
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(gameObject, true);
                }

                context.Save();
                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", gameObjectPath }
                };
            }
        }

        public static object PrefabRestoreGameObject(string assetPath, string gameObjectPath)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                string[] missingSegments;
                var existingAncestor = MutationUtility.ResolveNearestExistingGameObject(
                    context,
                    gameObjectPath,
                    out missingSegments);

                if (missingSegments.Length == 0)
                {
                    throw new InvalidOperationException(
                        $"GameObject path \"{gameObjectPath}\" already exists in {assetPath}.");
                }

                if (!PrefabUtility.IsPartOfPrefabInstance(existingAncestor))
                {
                    throw new InvalidOperationException(
                        $"Nearest existing ancestor \"{MutationUtility.GetHierarchyPath(existingAncestor.transform)}\" is not part of a prefab instance.");
                }

                var sourceAncestor = PrefabUtility.GetCorrespondingObjectFromSource(existingAncestor);
                if (sourceAncestor == null)
                {
                    throw new InvalidOperationException(
                        $"Could not resolve source GameObject for ancestor \"{MutationUtility.GetHierarchyPath(existingAncestor.transform)}\".");
                }

                var sourceTarget = ResolveSourceDescendant(sourceAncestor, missingSegments);
                PrefabUtility.RevertRemovedGameObject(
                    existingAncestor,
                    sourceTarget,
                    InteractionMode.AutomatedAction);

                context.MarkDirty(existingAncestor);
                context.Save();

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "assetPath", assetPath },
                    { "gameObjectPath", gameObjectPath }
                };
            }
        }

        private static object ApplyPrefabOverrideUpdate(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            using (var context = AssetMutationContext.Open(assetPath))
            {
                var result = ApplyPrefabOverrideUpdate(
                    context,
                    gameObjectPath,
                    componentType,
                    componentIndex,
                    propertyPath,
                    value);
                context.Save();
                return result;
            }
        }

        private static Dictionary<string, object> ApplyPrefabOverrideUpdate(
            AssetMutationContext context,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            var gameObject = MutationUtility.ResolveGameObject(context, gameObjectPath);
            UnityEngine.Object target = gameObject;
            if (!string.IsNullOrWhiteSpace(componentType))
            {
                target = MutationUtility.ResolveComponent(gameObject, componentType, componentIndex);
            }

            if (!PrefabUtility.IsPartOfPrefabInstance(target))
            {
                throw new InvalidOperationException(
                    $"\"{MutationUtility.GetHierarchyPath(gameObject.transform)}\" is not part of a prefab instance.");
            }

            ApplySerializedPropertyUpdate(target, propertyPath, value);
            MutationUtility.ApplyPrefabOverridesIfNeeded(target);
            context.MarkDirty(target);

            return new Dictionary<string, object>
            {
                { "success", true },
                { "assetPath", context.AssetPath },
                { "gameObjectPath", MutationUtility.GetHierarchyPath(gameObject.transform) },
                { "componentType", componentType ?? string.Empty },
                { "componentIndex", componentIndex },
                { "propertyPath", propertyPath },
                { "value", value }
            };
        }

        private static void ApplySerializedPropertyUpdate(UnityEngine.Object target, string propertyPath, string value)
        {
            if (string.IsNullOrWhiteSpace(propertyPath))
            {
                throw new InvalidOperationException("Missing required parameter: propertyPath");
            }

            var serialized = new SerializedObject(target);
            var property = serialized.FindProperty(propertyPath);
            if (property == null)
            {
                throw new InvalidOperationException(
                    $"Property \"{propertyPath}\" was not found on {target.GetType().Name}.");
            }

            string error;
            if (!MutationUtility.TrySetPropertyValue(property, value, out error))
            {
                throw new InvalidOperationException(error);
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void AssignManagedReference(
            Component component,
            string fieldPath,
            string typeName,
            string initialValuesJson,
            bool append)
        {
            if (string.IsNullOrWhiteSpace(fieldPath))
            {
                throw new InvalidOperationException("Missing required parameter: fieldPath");
            }

            var managedType = MutationUtility.ResolveType(typeName);
            if (managedType == null)
            {
                throw new InvalidOperationException($"Could not resolve managed reference type \"{typeName}\".");
            }

            if (managedType.IsAbstract)
            {
                throw new InvalidOperationException(
                    $"Managed reference type \"{managedType.FullName}\" is abstract.");
            }

            var serialized = new SerializedObject(component);
            SerializedProperty targetProperty = null;
            if (append)
            {
                var arrayProperty = serialized.FindProperty(fieldPath);
                if (arrayProperty == null || !arrayProperty.isArray)
                {
                    throw new InvalidOperationException(
                        $"Field \"{fieldPath}\" is not a serialized array for managed-reference append.");
                }

                var index = arrayProperty.arraySize;
                arrayProperty.InsertArrayElementAtIndex(index);
                targetProperty = arrayProperty.GetArrayElementAtIndex(index);
            }
            else
            {
                targetProperty = serialized.FindProperty(fieldPath);
            }

            if (targetProperty == null ||
                targetProperty.propertyType != SerializedPropertyType.ManagedReference)
            {
                throw new InvalidOperationException(
                    $"Field \"{fieldPath}\" is not a managed reference field.");
            }

            targetProperty.managedReferenceValue = Activator.CreateInstance(managedType);
            serialized.ApplyModifiedPropertiesWithoutUndo();

            var edits = ParseJsonList<ValueEditList, ValueEdit>(initialValuesJson, true);
            if (edits.Count == 0)
            {
                return;
            }

            serialized.Update();
            var refreshedProperty = append
                ? ResolveLastManagedReferenceProperty(serialized, fieldPath)
                : serialized.FindProperty(fieldPath);
            if (refreshedProperty == null)
            {
                throw new InvalidOperationException(
                    $"Failed to resolve managed reference field \"{fieldPath}\" after assignment.");
            }

            foreach (var edit in edits)
            {
                if (string.IsNullOrWhiteSpace(edit.path))
                {
                    throw new InvalidOperationException("Managed reference value edits require a non-empty path.");
                }

                var childProperty = refreshedProperty.FindPropertyRelative(edit.path);
                if (childProperty == null)
                {
                    throw new InvalidOperationException(
                        $"Managed reference child property \"{edit.path}\" was not found under \"{fieldPath}\".");
                }

                string error;
                if (!MutationUtility.TrySetPropertyValue(childProperty, edit.value, out error))
                {
                    throw new InvalidOperationException(error);
                }
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        [Serializable]
        private sealed class ValueEditList
        {
            public ValueEdit[] edits;
            public ValueEdit[] items;
        }

        private static SerializedProperty ResolveLastManagedReferenceProperty(
            SerializedObject serialized,
            string fieldPath)
        {
            var arrayProperty = serialized.FindProperty(fieldPath);
            if (arrayProperty == null || !arrayProperty.isArray || arrayProperty.arraySize == 0)
            {
                return null;
            }

            return arrayProperty.GetArrayElementAtIndex(arrayProperty.arraySize - 1);
        }

        private static GameObject ResolveSourceDescendant(GameObject sourceRoot, string[] descendantSegments)
        {
            var current = sourceRoot.transform;
            foreach (var segment in descendantSegments)
            {
                var match = current.Cast<Transform>()
                    .Where(child => child.name == segment)
                    .ToArray();
                if (match.Length == 0)
                {
                    throw new InvalidOperationException(
                        $"Could not resolve removed source GameObject path under \"{MutationUtility.GetHierarchyPath(sourceRoot.transform)}\".");
                }

                if (match.Length > 1)
                {
                    throw new InvalidOperationException(
                        $"Removed source GameObject path is ambiguous under \"{MutationUtility.GetHierarchyPath(current)}\".");
                }

                current = match[0];
            }

            return current.gameObject;
        }

        private static Dictionary<string, object> SerializeVector3(Vector3 value)
        {
            return new Dictionary<string, object>
            {
                { "x", value.x },
                { "y", value.y },
                { "z", value.z }
            };
        }

        private static T ParseJsonObject<T>(string json) where T : class
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            var parsed = JsonUtility.FromJson<T>(json);
            if (parsed == null)
            {
                throw new InvalidOperationException("Invalid JSON payload.");
            }

            return parsed;
        }

        private static List<TItem> ParseJsonList<TList, TItem>(string json, bool allowEmpty = false)
            where TList : class
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                if (allowEmpty)
                {
                    return new List<TItem>();
                }

                throw new InvalidOperationException("Missing required JSON payload.");
            }

            var wrappedJson = json.TrimStart().StartsWith("[", StringComparison.Ordinal)
                ? $"{{\"items\":{json}}}"
                : json;

            var parsed = JsonUtility.FromJson<TList>(wrappedJson);
            if (parsed == null)
            {
                throw new InvalidOperationException("Invalid JSON payload.");
            }

            var editsField = typeof(TList).GetField("edits");
            var itemsField = typeof(TList).GetField("items");
            var edits = editsField != null ? editsField.GetValue(parsed) as TItem[] : null;
            var items = itemsField != null ? itemsField.GetValue(parsed) as TItem[] : null;
            var values = edits ?? items ?? System.Array.Empty<TItem>();

            if (!allowEmpty && values.Length == 0)
            {
                throw new InvalidOperationException("JSON payload did not contain any edits.");
            }

            return values.ToList();
        }
    }
}
