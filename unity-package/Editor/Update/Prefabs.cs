namespace UnityAgenticTools.Update
{
    public static class Prefabs
    {
        public static object PrefabUnpack(string assetPath, string prefabInstancePath, string mode = "OutermostRoot")
        {
            return UpdateUtility.PrefabUnpack(assetPath, prefabInstancePath, mode);
        }

        public static object PrefabOverride(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            return UpdateUtility.PrefabOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath, value);
        }

        public static object PrefabBatchOverrides(string assetPath, string editsJson)
        {
            return UpdateUtility.PrefabBatchOverrides(assetPath, editsJson);
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
            return UpdateUtility.PrefabManagedReference(
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
            return UpdateUtility.PrefabRemoveOverride(assetPath, gameObjectPath, componentType, componentIndex, propertyPath);
        }

        public static object PrefabRemoveComponent(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex)
        {
            return UpdateUtility.PrefabRemoveComponent(assetPath, gameObjectPath, componentType, componentIndex);
        }

        public static object PrefabRestoreComponent(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex)
        {
            return UpdateUtility.PrefabRestoreComponent(assetPath, gameObjectPath, componentType, componentIndex);
        }

        public static object PrefabRemoveGameObject(string assetPath, string gameObjectPath)
        {
            return UpdateUtility.PrefabRemoveGameObject(assetPath, gameObjectPath);
        }

        public static object PrefabRestoreGameObject(string assetPath, string gameObjectPath)
        {
            return UpdateUtility.PrefabRestoreGameObject(assetPath, gameObjectPath);
        }
    }
}
