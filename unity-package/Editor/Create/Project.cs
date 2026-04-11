namespace UnityAgenticTools.Create
{
    public static class Project
    {
        public static object Build(string scenePath, int position = -1)
        {
            return CreateUtility.Build(scenePath, position);
        }

        public static object Package(string name, string version)
        {
            return CreateUtility.Package(name, version);
        }
    }
}
