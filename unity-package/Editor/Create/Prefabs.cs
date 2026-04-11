namespace UnityAgenticTools.Create
{
    public static class Prefabs
    {
        public static object Prefab(string assetPath, string name = "")
        {
            return CreateUtility.Prefab(assetPath, name);
        }

        public static object PrefabVariant(string sourcePrefabPath, string outputPath, string variantName = "")
        {
            return CreateUtility.PrefabVariant(sourcePrefabPath, outputPath, variantName);
        }

        public static object PrefabInstance(
            string assetPath,
            string prefabPath,
            string parentPath = "",
            string instanceName = "",
            float localPosX = 0f,
            float localPosY = 0f,
            float localPosZ = 0f)
        {
            return CreateUtility.PrefabInstance(
                assetPath,
                prefabPath,
                parentPath,
                instanceName,
                localPosX,
                localPosY,
                localPosZ);
        }
    }
}
