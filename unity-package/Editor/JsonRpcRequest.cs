using System.Collections.Generic;

namespace UnityAgenticTools
{
    public struct JsonRpcRequest
    {
        public string Id;
        public string Method;
        public Dictionary<string, object> Params;
    }
}
