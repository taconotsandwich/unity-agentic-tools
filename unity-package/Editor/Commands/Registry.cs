using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;

namespace UnityAgenticTools.Commands
{
    public static class Registry
    {
        private static readonly BuiltInCommand[] BuiltIns =
        {
            new BuiltInCommand("project.refresh", "UnityEditor.AssetDatabase", "Refresh", "Refresh the Unity AssetDatabase."),
            new BuiltInCommand("project.save-assets", "UnityEditor.AssetDatabase", "SaveAssets", "Save modified project assets."),
            new BuiltInCommand("project.build.add", "UnityAgenticTools.Create.Project", "Build", "Add a scene to build settings."),
            new BuiltInCommand("project.package.add", "UnityAgenticTools.Create.Project", "Package", "Add or update a package dependency."),

            new BuiltInCommand("scene.open", "UnityAgenticTools.Util.Scene", "Open", "Open a scene in the Unity Editor."),
            new BuiltInCommand("scene.save", "UnityAgenticTools.Util.Scene", "Save", "Save the active scene."),
            new BuiltInCommand("scene.hierarchy", "UnityAgenticTools.Util.Hierarchy", "Snapshot", "Return a hierarchy snapshot for the active scene."),
            new BuiltInCommand("scene.query", "UnityAgenticTools.Util.Hierarchy", "Query", "Query a hierarchy ref from a snapshot."),

            new BuiltInCommand("query.assets", "UnityAgenticTools.Query.Assets", "Find", "Find assets with Unity AssetDatabase filters."),
            new BuiltInCommand("query.asset", "UnityAgenticTools.Query.Assets", "Info", "Inspect basic AssetDatabase metadata for an asset path."),
            new BuiltInCommand("query.scene", "UnityAgenticTools.Query.Scene", "Hierarchy", "Inspect hierarchy data for the active scene or an asset path."),
            new BuiltInCommand("query.object", "UnityAgenticTools.Query.Scene", "Object", "Inspect one GameObject in a scene or prefab asset."),

            new BuiltInCommand("create.scene", "UnityAgenticTools.Create.Scenes", "Scene", "Create a scene asset."),
            new BuiltInCommand("create.gameobject", "UnityAgenticTools.Create.Scenes", "GameObject", "Create a GameObject in a scene or prefab."),
            new BuiltInCommand("create.component", "UnityAgenticTools.Create.Scenes", "Component", "Add a component to a GameObject."),
            new BuiltInCommand("create.component-copy", "UnityAgenticTools.Create.Scenes", "ComponentCopy", "Copy a component between GameObjects."),
            new BuiltInCommand("create.prefab", "UnityAgenticTools.Create.Prefabs", "Prefab", "Create a prefab asset."),
            new BuiltInCommand("create.prefab-instance", "UnityAgenticTools.Create.Prefabs", "PrefabInstance", "Instantiate a prefab into a scene."),
            new BuiltInCommand("create.prefab-variant", "UnityAgenticTools.Create.Prefabs", "PrefabVariant", "Create a prefab variant."),
            new BuiltInCommand("create.scriptable-object", "UnityAgenticTools.Create.Assets", "ScriptableObject", "Create a ScriptableObject asset."),
            new BuiltInCommand("create.meta", "UnityAgenticTools.Create.Assets", "Meta", "Create a meta file for an asset."),
            new BuiltInCommand("create.material", "UnityAgenticTools.Create.Assets", "Material", "Create a material asset."),
            new BuiltInCommand("create.input-actions", "UnityAgenticTools.Create.Assets", "InputActions", "Create an Input Actions asset."),
            new BuiltInCommand("create.animation", "UnityAgenticTools.Create.Assets", "Animation", "Create an AnimationClip asset."),
            new BuiltInCommand("create.animator", "UnityAgenticTools.Create.Assets", "Animator", "Create an AnimatorController asset."),

            new BuiltInCommand("update.object", "UnityAgenticTools.Update.Objects", "GameObject", "Update a serialized GameObject property."),
            new BuiltInCommand("update.component", "UnityAgenticTools.Update.Objects", "Component", "Update a serialized component property."),
            new BuiltInCommand("update.transform", "UnityAgenticTools.Update.Objects", "Transform", "Update position, rotation, or scale."),
            new BuiltInCommand("update.parent", "UnityAgenticTools.Update.Objects", "Parent", "Reparent a GameObject."),
            new BuiltInCommand("update.sibling-index", "UnityAgenticTools.Update.Objects", "SiblingIndex", "Set a GameObject sibling index."),
            new BuiltInCommand("update.array", "UnityAgenticTools.Update.Serialized", "Array", "Edit a serialized array property."),
            new BuiltInCommand("update.batch", "UnityAgenticTools.Update.Serialized", "Batch", "Batch-edit GameObject serialized properties."),
            new BuiltInCommand("update.batch-components", "UnityAgenticTools.Update.Serialized", "BatchComponents", "Batch-edit component serialized properties."),
            new BuiltInCommand("update.managed-reference", "UnityAgenticTools.Update.Serialized", "ManagedReference", "Set or append a managed reference value."),
            new BuiltInCommand("update.prefab.unpack", "UnityAgenticTools.Update.Prefabs", "PrefabUnpack", "Unpack a prefab instance."),
            new BuiltInCommand("update.prefab.override", "UnityAgenticTools.Update.Prefabs", "PrefabOverride", "Set a prefab instance override."),
            new BuiltInCommand("update.prefab.batch-overrides", "UnityAgenticTools.Update.Prefabs", "PrefabBatchOverrides", "Batch-edit prefab overrides."),
            new BuiltInCommand("update.prefab.managed-reference", "UnityAgenticTools.Update.Prefabs", "PrefabManagedReference", "Set a managed reference prefab override."),
            new BuiltInCommand("update.prefab.remove-override", "UnityAgenticTools.Update.Prefabs", "PrefabRemoveOverride", "Remove a prefab override."),
            new BuiltInCommand("update.prefab.remove-component", "UnityAgenticTools.Update.Prefabs", "PrefabRemoveComponent", "Mark a prefab component as removed."),
            new BuiltInCommand("update.prefab.restore-component", "UnityAgenticTools.Update.Prefabs", "PrefabRestoreComponent", "Restore a removed prefab component."),
            new BuiltInCommand("update.prefab.remove-gameobject", "UnityAgenticTools.Update.Prefabs", "PrefabRemoveGameObject", "Mark a prefab GameObject as removed."),
            new BuiltInCommand("update.prefab.restore-gameobject", "UnityAgenticTools.Update.Prefabs", "PrefabRestoreGameObject", "Restore a removed prefab GameObject."),

            new BuiltInCommand("delete.gameobject", "UnityAgenticTools.Delete.Objects", "GameObject", "Delete a GameObject from a scene or prefab."),
            new BuiltInCommand("delete.component", "UnityAgenticTools.Delete.Objects", "Component", "Delete a component from a GameObject."),
            new BuiltInCommand("delete.asset", "UnityAgenticTools.Delete.Assets", "Asset", "Delete an asset and its meta file through AssetDatabase."),

            new BuiltInCommand("play.enter", "UnityAgenticTools.Util.PlayMode", "Enter", "Enter play mode."),
            new BuiltInCommand("play.exit", "UnityAgenticTools.Util.PlayMode", "Exit", "Exit play mode."),
            new BuiltInCommand("play.pause", "UnityAgenticTools.Util.PlayMode", "Pause", "Toggle pause state."),
            new BuiltInCommand("play.step", "UnityAgenticTools.Util.PlayMode", "Step", "Step one frame in play mode."),
            new BuiltInCommand("play.state", "UnityAgenticTools.Util.PlayMode", "GetState", "Read play mode state."),

            new BuiltInCommand("ui.snapshot", "UnityAgenticTools.Util.UI", "Snapshot", "Return UI refs and metadata."),
            new BuiltInCommand("ui.query", "UnityAgenticTools.Util.UI", "Query", "Query a UI ref."),
            new BuiltInCommand("ui.interact", "UnityAgenticTools.Util.UI", "Interact", "Interact with a UI ref."),

            new BuiltInCommand("input.map", "UnityAgenticTools.Util.Input", "Map", "Inspect available input actions and legacy axes."),
            new BuiltInCommand("input.key", "UnityAgenticTools.Util.Input", "Key", "Send a key input event."),
            new BuiltInCommand("input.mouse", "UnityAgenticTools.Util.Input", "Mouse", "Send a mouse input event."),
            new BuiltInCommand("input.touch", "UnityAgenticTools.Util.Input", "Touch", "Send a touch input event."),
            new BuiltInCommand("input.action", "UnityAgenticTools.Util.Input", "Action", "Trigger an input action."),

            new BuiltInCommand("screenshot.take", "UnityAgenticTools.Util.Screenshot", "Take", "Capture a Game view screenshot."),
            new BuiltInCommand("screenshot.annotated", "UnityAgenticTools.Util.Screenshot", "Annotated", "Capture a screenshot with UI annotations."),
            new BuiltInCommand("tests.run", "UnityAgenticTools.Util.TestRunner", "Run", "Run Unity tests."),
            new BuiltInCommand("tests.results", "UnityAgenticTools.Util.TestRunner", "GetResults", "Read the latest Unity test results.")
        };

        public static object List(string query = "", bool includeRaw = false)
        {
            var normalizedQuery = (query ?? string.Empty).Trim();
            var commands = new List<Dictionary<string, object>>();

            foreach (var definition in GetRegisteredCommands())
            {
                if (!MatchesQuery(definition, normalizedQuery))
                {
                    continue;
                }

                commands.Add(ToDictionary(definition));
            }

            if (includeRaw)
            {
                foreach (var definition in GetRawCommands(normalizedQuery))
                {
                    commands.Add(ToDictionary(definition));
                }
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "query", normalizedQuery },
                { "count", commands.Count },
                { "commands", commands.ToArray() }
            };
        }

        public static object Run(string target, string argsJson = "[]", string setValue = null)
        {
            if (string.IsNullOrWhiteSpace(target))
            {
                throw new ArgumentException("Missing required command or method target.");
            }

            var definition = ResolveCommand(target.Trim());
            if (definition == null)
            {
                throw new ArgumentException(
                    $"Command or method not found: {target}. Use `unity-agentic-tools list {target}` to discover available commands.");
            }

            var type = FindType(definition.TypeName);
            if (type == null)
            {
                throw new ArgumentException($"Type not found: {definition.TypeName}");
            }

            if (setValue != null)
            {
                return SetProperty(type, definition.MemberName, setValue);
            }

            var args = ParseJsonStringArray(argsJson ?? "[]");
            return InvokeMember(type, definition.MemberName, args);
        }

        private static IEnumerable<CommandDefinition> GetRegisteredCommands()
        {
            foreach (var builtIn in BuiltIns)
            {
                yield return builtIn.ToDefinition();
            }

            foreach (var definition in GetAttributeCommands())
            {
                yield return definition;
            }
        }

        private static IEnumerable<CommandDefinition> GetAttributeCommands()
        {
            foreach (var type in GetLoadableTypes())
            {
                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    var attribute = method.GetCustomAttribute<AgenticCommandAttribute>();
                    if (attribute == null)
                    {
                        continue;
                    }

                    yield return new CommandDefinition(
                        attribute.Name,
                        type.FullName,
                        method.Name,
                        attribute.Description,
                        "project");
                }

                foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Static))
                {
                    var attribute = property.GetCustomAttribute<AgenticCommandAttribute>();
                    if (attribute == null)
                    {
                        continue;
                    }

                    yield return new CommandDefinition(
                        attribute.Name,
                        type.FullName,
                        property.Name,
                        attribute.Description,
                        "project");
                }
            }
        }

        private static IEnumerable<CommandDefinition> GetRawCommands(string query)
        {
            if (string.IsNullOrWhiteSpace(query) || query.Length < 3)
            {
                yield break;
            }

            foreach (var type in GetLoadableTypes())
            {
                if (!MatchesRawType(type, query))
                {
                    continue;
                }

                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (method.IsGenericMethodDefinition || method.IsSpecialName)
                    {
                        continue;
                    }

                    yield return new CommandDefinition(
                        $"{type.FullName}.{method.Name}",
                        type.FullName,
                        method.Name,
                        string.Empty,
                        "raw");
                }

                foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Static))
                {
                    yield return new CommandDefinition(
                        $"{type.FullName}.{property.Name}",
                        type.FullName,
                        property.Name,
                        string.Empty,
                        "raw");
                }
            }
        }

        private static CommandDefinition ResolveCommand(string target)
        {
            var registered = GetRegisteredCommands()
                .FirstOrDefault(command =>
                    string.Equals(command.Name, target, StringComparison.Ordinal) ||
                    string.Equals(command.Method, target, StringComparison.Ordinal));
            if (registered != null)
            {
                return registered;
            }

            return ResolveRawCommand(target);
        }

        private static CommandDefinition ResolveRawCommand(string target)
        {
            var dotIndex = target.LastIndexOf('.');
            while (dotIndex > 0)
            {
                var typeName = target.Substring(0, dotIndex);
                var memberName = target.Substring(dotIndex + 1);
                var type = FindType(typeName);
                if (type != null && HasPublicStaticMember(type, memberName))
                {
                    return new CommandDefinition(target, type.FullName, memberName, string.Empty, "raw");
                }

                dotIndex = target.LastIndexOf('.', dotIndex - 1);
            }

            return null;
        }

        private static object InvokeMember(Type type, string memberName, string[] args)
        {
            var property = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
            if (property != null && args.Length == 0)
            {
                if (!property.CanRead)
                {
                    throw new ArgumentException($"Property is write-only: {type.FullName}.{memberName}");
                }

                return property.GetValue(null, null);
            }

            var method = ResolveMethod(type, memberName, args.Length);
            if (method == null)
            {
                throw new ArgumentException($"No public static method or readable property found: {type.FullName}.{memberName}");
            }

            var invokeArgs = ConvertArguments(method, args);
            return TryInvoke(() => method.Invoke(null, invokeArgs));
        }

        private static object SetProperty(Type type, string memberName, string value)
        {
            var property = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
            if (property == null)
            {
                throw new ArgumentException($"Static property not found: {type.FullName}.{memberName}");
            }

            if (!property.CanWrite)
            {
                throw new ArgumentException($"Property is read-only: {type.FullName}.{memberName}");
            }

            var converted = ConvertArgument(value, property.PropertyType);
            TryInvoke(() => property.SetValue(null, converted, null));
            return new Dictionary<string, object> { { "success", true } };
        }

        private static MethodInfo ResolveMethod(Type type, string memberName, int argCount)
        {
            var matches = new List<MethodInfo>();
            var availableArities = new List<string>();

            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != memberName || method.IsGenericMethodDefinition)
                {
                    continue;
                }

                var parameters = method.GetParameters();
                var minParams = parameters.Count(parameter => !parameter.IsOptional);
                availableArities.Add($"{minParams}-{parameters.Length}");
                if (argCount >= minParams && argCount <= parameters.Length)
                {
                    matches.Add(method);
                }
            }

            if (matches.Count == 1)
            {
                return matches[0];
            }

            if (matches.Count > 1)
            {
                throw new ArgumentException(
                    $"Ambiguous: {type.FullName}.{memberName} has multiple overloads accepting {argCount} argument(s).");
            }

            if (availableArities.Count > 0)
            {
                throw new ArgumentException(
                    $"No overload of {type.FullName}.{memberName} accepts {argCount} argument(s). Available ranges: {string.Join(", ", availableArities.ToArray())}.");
            }

            return null;
        }

        private static object[] ConvertArguments(MethodInfo method, string[] args)
        {
            var parameters = method.GetParameters();
            var converted = new object[parameters.Length];

            for (var index = 0; index < parameters.Length; index += 1)
            {
                if (index < args.Length)
                {
                    converted[index] = ConvertArgument(args[index], parameters[index].ParameterType);
                }
                else
                {
                    converted[index] = parameters[index].HasDefaultValue
                        ? parameters[index].DefaultValue
                        : Type.Missing;
                }
            }

            return converted;
        }

        private static object ConvertArgument(string value, Type targetType)
        {
            if (targetType == typeof(string))
            {
                return value;
            }

            if (targetType == typeof(bool))
            {
                if (bool.TryParse(value, out var boolValue))
                {
                    return boolValue;
                }

                if (value == "1")
                {
                    return true;
                }

                if (value == "0")
                {
                    return false;
                }
            }

            if (targetType.IsEnum)
            {
                return Enum.Parse(targetType, value, true);
            }

            return Convert.ChangeType(value, targetType, CultureInfo.InvariantCulture);
        }

        private static T TryInvoke<T>(Func<T> invoker)
        {
            try
            {
                return invoker();
            }
            catch (TargetInvocationException ex) when (ex.InnerException != null)
            {
                ExceptionDispatchInfo.Capture(ex.InnerException).Throw();
                throw;
            }
        }

        private static void TryInvoke(Action invoker)
        {
            try
            {
                invoker();
            }
            catch (TargetInvocationException ex) when (ex.InnerException != null)
            {
                ExceptionDispatchInfo.Capture(ex.InnerException).Throw();
                throw;
            }
        }

        private static Dictionary<string, object> ToDictionary(CommandDefinition definition)
        {
            var type = FindType(definition.TypeName);
            var args = type != null
                ? DescribeArguments(type, definition.MemberName)
                : Array.Empty<object>();

            return new Dictionary<string, object>
            {
                { "name", definition.Name },
                { "method", definition.Method },
                { "description", definition.Description },
                { "source", definition.Source },
                { "args", args }
            };
        }

        private static object[] DescribeArguments(Type type, string memberName)
        {
            var method = type.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .FirstOrDefault(candidate => candidate.Name == memberName && !candidate.IsGenericMethodDefinition);
            if (method != null)
            {
                return method.GetParameters()
                    .Select(parameter => new Dictionary<string, object>
                    {
                        { "name", parameter.Name },
                        { "type", SimplifyTypeName(parameter.ParameterType) },
                        { "optional", parameter.IsOptional },
                        { "default", parameter.HasDefaultValue ? parameter.DefaultValue : null }
                    })
                    .Cast<object>()
                    .ToArray();
            }

            var property = type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
            if (property != null)
            {
                return new object[]
                {
                    new Dictionary<string, object>
                    {
                        { "name", "value" },
                        { "type", SimplifyTypeName(property.PropertyType) },
                        { "optional", true },
                        { "mode", property.CanWrite ? "get/set" : "get" }
                    }
                };
            }

            return Array.Empty<object>();
        }

        private static string SimplifyTypeName(Type type)
        {
            if (type == typeof(string)) return "string";
            if (type == typeof(bool)) return "bool";
            if (type == typeof(int)) return "int";
            if (type == typeof(float)) return "float";
            if (type == typeof(double)) return "double";
            return type.Name;
        }

        private static bool MatchesQuery(CommandDefinition definition, string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return true;
            }

            return definition.Name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                definition.Method.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                definition.Description.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                definition.Source.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool MatchesRawType(Type type, string query)
        {
            var fullName = type.FullName ?? string.Empty;
            return fullName.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool HasPublicStaticMember(Type type, string memberName)
        {
            return type.GetMethod(memberName, BindingFlags.Public | BindingFlags.Static) != null ||
                type.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static) != null;
        }

        private static Type FindType(string fullName)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var type = assembly.GetType(fullName);
                    if (type != null)
                    {
                        return type;
                    }
                }
                catch
                {
                }
            }

            return null;
        }

        private static IEnumerable<Type> GetLoadableTypes()
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try
                {
                    types = assembly.GetTypes();
                }
                catch (ReflectionTypeLoadException ex)
                {
                    types = ex.Types.Where(type => type != null).ToArray();
                }
                catch
                {
                    continue;
                }

                foreach (var type in types)
                {
                    if (type != null)
                    {
                        yield return type;
                    }
                }
            }
        }

        private static string[] ParseJsonStringArray(string json)
        {
            json = (json ?? string.Empty).Trim();
            if (!json.StartsWith("[") || !json.EndsWith("]"))
            {
                return new[] { json };
            }

            json = json.Substring(1, json.Length - 2).Trim();
            if (string.IsNullOrEmpty(json))
            {
                return new string[0];
            }

            var result = new List<string>();
            var index = 0;
            while (index < json.Length)
            {
                while (index < json.Length && (json[index] == ' ' || json[index] == '\t' || json[index] == ','))
                {
                    index += 1;
                }

                if (index >= json.Length)
                {
                    break;
                }

                if (json[index] == '"')
                {
                    index += 1;
                    var builder = new StringBuilder();
                    while (index < json.Length)
                    {
                        var current = json[index++];
                        if (current == '"')
                        {
                            break;
                        }

                        if (current == '\\' && index < json.Length)
                        {
                            var escaped = json[index++];
                            switch (escaped)
                            {
                                case '"': builder.Append('"'); break;
                                case '\\': builder.Append('\\'); break;
                                case '/': builder.Append('/'); break;
                                case 'n': builder.Append('\n'); break;
                                case 'r': builder.Append('\r'); break;
                                case 't': builder.Append('\t'); break;
                                case 'b': builder.Append('\b'); break;
                                case 'f': builder.Append('\f'); break;
                                case 'u':
                                    if (index + 4 <= json.Length)
                                    {
                                        builder.Append((char)Convert.ToInt32(json.Substring(index, 4), 16));
                                        index += 4;
                                    }
                                    else
                                    {
                                        builder.Append(escaped);
                                    }
                                    break;
                                default:
                                    builder.Append(escaped);
                                    break;
                            }
                        }
                        else
                        {
                            builder.Append(current);
                        }
                    }

                    result.Add(builder.ToString());
                }
                else
                {
                    var start = index;
                    while (index < json.Length && json[index] != ',')
                    {
                        index += 1;
                    }

                    result.Add(json.Substring(start, index - start).Trim());
                }
            }

            return result.ToArray();
        }

        private sealed class BuiltInCommand
        {
            public BuiltInCommand(string name, string typeName, string memberName, string description)
            {
                Name = name;
                TypeName = typeName;
                MemberName = memberName;
                Description = description;
            }

            private string Name { get; }
            private string TypeName { get; }
            private string MemberName { get; }
            private string Description { get; }

            public CommandDefinition ToDefinition()
            {
                return new CommandDefinition(Name, TypeName, MemberName, Description, "builtin");
            }
        }

        private sealed class CommandDefinition
        {
            public CommandDefinition(string name, string typeName, string memberName, string description, string source)
            {
                Name = name;
                TypeName = typeName;
                MemberName = memberName;
                Description = description ?? string.Empty;
                Source = source;
            }

            public string Name { get; }
            public string TypeName { get; }
            public string MemberName { get; }
            public string Description { get; }
            public string Source { get; }
            public string Method => $"{TypeName}.{MemberName}";
        }
    }
}
