using System;

namespace UnityAgenticTools.Commands
{
    [AttributeUsage(AttributeTargets.Method | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class AgenticCommandAttribute : Attribute
    {
        public AgenticCommandAttribute(string name, string description = "")
        {
            Name = name;
            Description = description;
        }

        public string Name { get; }
        public string Description { get; }
    }
}
