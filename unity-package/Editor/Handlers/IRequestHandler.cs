using System.Collections.Generic;
using System.Threading.Tasks;

namespace UnityAgenticTools.Server
{
    public interface IRequestHandler
    {
        string MethodPrefix { get; }
        Task<object> HandleAsync(string method, Dictionary<string, object> parameters);
    }
}
