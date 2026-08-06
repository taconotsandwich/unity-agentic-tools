using System;
using System.Collections.Generic;
using System.Globalization;

namespace UnityAgenticTools.Bridge.Transport
{
    public static class RequestTimeout
    {
        public const int DefaultMilliseconds = 30000;

        public static int ResolveMilliseconds(Dictionary<string, object> parameters)
        {
            if (parameters == null || !parameters.TryGetValue("_timeout", out var timeoutValue))
            {
                return DefaultMilliseconds;
            }

            if (timeoutValue is int timeoutInt)
            {
                return Math.Max(1, timeoutInt);
            }

            if (timeoutValue is long timeoutLong)
            {
                return (int)Math.Max(1L, Math.Min(timeoutLong, int.MaxValue));
            }

            if (timeoutValue is double timeoutDouble)
            {
                if (double.IsNaN(timeoutDouble))
                {
                    return DefaultMilliseconds;
                }

                return (int)Math.Max(1d, Math.Min(timeoutDouble, int.MaxValue));
            }

            if (timeoutValue is string timeoutString && int.TryParse(
                timeoutString,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var parsedTimeout))
            {
                return Math.Max(1, parsedTimeout);
            }

            return DefaultMilliseconds;
        }
    }
}
