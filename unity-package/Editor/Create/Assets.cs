namespace UnityAgenticTools.Create
{
    public static class Assets
    {
        public static object ScriptableObject(string assetPath, string script, string initialValuesJson = "")
        {
            return CreateUtility.ScriptableObject(assetPath, script, initialValuesJson);
        }

        public static object Meta(string scriptPath)
        {
            return CreateUtility.Meta(scriptPath);
        }

        public static object Material(string assetPath, string shaderGuid, string materialName = "")
        {
            return CreateUtility.Material(assetPath, shaderGuid, materialName);
        }

        public static object InputActions(string assetPath, string name)
        {
            return CreateUtility.InputActions(assetPath, name);
        }

        public static object Animation(string assetPath, string clipName = "", int sampleRate = 60, bool loopTime = false)
        {
            return CreateUtility.Animation(assetPath, clipName, sampleRate, loopTime);
        }

        public static object Animator(string assetPath, string controllerName = "", string layerName = "Base Layer")
        {
            return CreateUtility.Animator(assetPath, controllerName, layerName);
        }
    }
}
