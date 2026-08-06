using UnityEditor;

namespace UnityAgenticTools.Bridge.Transport
{
    internal static class EditorProcessContext
    {
        public static readonly bool IsAssetImportWorker = AssetDatabase.IsAssetImportWorkerProcess();
    }
}
