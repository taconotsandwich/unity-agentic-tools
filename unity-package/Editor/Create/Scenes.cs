namespace UnityAgenticTools.Create
{
    public static class Scenes
    {
        public static object Scene(string assetPath, bool includeDefaults = false)
        {
            return CreateUtility.Scene(assetPath, includeDefaults);
        }

        public static object GameObject(string assetPath, string name, string parentPath = "")
        {
            return CreateUtility.GameObject(assetPath, name, parentPath);
        }

        public static object Component(string assetPath, string gameObjectPath, string componentType)
        {
            return CreateUtility.Component(assetPath, gameObjectPath, componentType);
        }

        public static object ComponentCopy(
            string assetPath,
            string sourceGameObjectPath,
            string sourceComponentType,
            int sourceComponentIndex,
            string targetGameObjectPath)
        {
            return CreateUtility.ComponentCopy(
                assetPath,
                sourceGameObjectPath,
                sourceComponentType,
                sourceComponentIndex,
                targetGameObjectPath);
        }
    }
}
