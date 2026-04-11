namespace UnityAgenticTools.Update
{
    public static class Serialized
    {
        public static object Array(
            string assetPath,
            string gameObjectPath,
            string componentType,
            int componentIndex,
            string arrayProperty,
            string action,
            string payloadJson = "")
        {
            return UpdateUtility.Array(
                assetPath,
                gameObjectPath,
                componentType,
                componentIndex,
                arrayProperty,
                action,
                payloadJson);
        }

        public static object Batch(string assetPath, string editsJson)
        {
            return UpdateUtility.Batch(assetPath, editsJson);
        }

        public static object BatchComponents(string assetPath, string editsJson)
        {
            return UpdateUtility.BatchComponents(assetPath, editsJson);
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
            return UpdateUtility.ManagedReference(
                assetPath,
                gameObjectPath,
                componentType,
                componentIndex,
                fieldPath,
                typeName,
                initialValuesJson,
                append);
        }
    }
}
