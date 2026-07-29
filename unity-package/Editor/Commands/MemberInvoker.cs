using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;

namespace UnityAgenticTools.Commands
{
    /// <summary>
    /// Calls a public static member by name with string arguments. Knows nothing
    /// about commands or aliases -- the registry decides what may be invoked, this
    /// decides how.
    /// </summary>
    internal static class MemberInvoker
    {
        internal static object Invoke(Type type, string memberName, string[] args)
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

        internal static object SetProperty(Type type, string memberName, string value)
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

        internal static MethodInfo ResolveMethod(Type type, string memberName, int argCount)
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
    }
}
