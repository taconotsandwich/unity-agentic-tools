namespace UnityAgenticTools.Update
{
    public static class Objects
    {
        public static object GameObject(string assetPath, string gameObjectPath, string propertyPath, string value)
        {
            return UpdateUtility.GameObject(assetPath, gameObjectPath, propertyPath, value);
        }

        public static object Component(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string propertyPath,
            string value)
        {
            return UpdateUtility.Component(
                assetPath,
                gameObjectPath,
                componentType,
                componentIndex,
                propertyPath,
                value);
        }

        public static object Transform(
            string assetPath,
            string gameObjectPath,
            string position = "",
            string rotation = "",
            string scale = "")
        {
            return UpdateUtility.Transform(assetPath, gameObjectPath, position, rotation, scale);
        }

        public static object Parent(string assetPath, string gameObjectPath, string newParentPath = "")
        {
            return UpdateUtility.Parent(assetPath, gameObjectPath, newParentPath);
        }

        public static object SiblingIndex(string assetPath, string gameObjectPath, int index)
        {
            return UpdateUtility.SiblingIndex(assetPath, gameObjectPath, index);
        }
    }
}
