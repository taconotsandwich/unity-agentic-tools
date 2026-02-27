using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Server
{
    public class InputHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.input.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "map":
                    return await GetInputMap(parameters);
                case "key":
                    return await SimulateKey(parameters);
                case "mouse":
                    return await SimulateMouse(parameters);
                case "touch":
                    return await SimulateTouch(parameters);
                case "action":
                    return await TriggerAction(parameters);
                default:
                    throw new InvalidOperationException($"Unknown input action: {action}");
            }
        }

        // --- Input Map Discovery ---

        private async Task<object> GetInputMap(Dictionary<string, object> parameters)
        {
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var result = new Dictionary<string, object>();
                var actions = new List<object>();
                var legacyAxes = new List<object>();

                // New Input System discovery
#if ENABLE_INPUT_SYSTEM
                actions = DiscoverInputSystemActions();
                result["inputSystemAvailable"] = true;
#else
                result["inputSystemAvailable"] = false;
#endif

                // Legacy Input Manager discovery (read InputManager.asset YAML)
                legacyAxes = DiscoverLegacyAxes();

                result["actions"] = actions.ToArray();
                result["legacyAxes"] = legacyAxes.ToArray();

                return result;
            });
        }

#if ENABLE_INPUT_SYSTEM
        private static List<object> DiscoverInputSystemActions()
        {
            var actions = new List<object>();

            // Find all PlayerInput components in scene
            var playerInputType = FindType("UnityEngine.InputSystem.PlayerInput");
            if (playerInputType == null) return actions;

            var playerInputs = UnityEngine.Object.FindObjectsOfType(playerInputType);
            foreach (var pi in playerInputs)
            {
                var actionsProperty = playerInputType.GetProperty("actions", BindingFlags.Public | BindingFlags.Instance);
                if (actionsProperty == null) continue;

                var inputActionAsset = actionsProperty.GetValue(pi);
                if (inputActionAsset == null) continue;

                var actionMapsProperty = inputActionAsset.GetType().GetProperty("actionMaps", BindingFlags.Public | BindingFlags.Instance);
                if (actionMapsProperty == null) continue;

                var actionMaps = actionMapsProperty.GetValue(inputActionAsset) as System.Collections.IEnumerable;
                if (actionMaps == null) continue;

                foreach (var map in actionMaps)
                {
                    var mapName = map.GetType().GetProperty("name")?.GetValue(map) as string;
                    var actionsArr = map.GetType().GetProperty("actions")?.GetValue(map) as System.Collections.IEnumerable;
                    if (actionsArr == null) continue;

                    foreach (var a in actionsArr)
                    {
                        var actionName = a.GetType().GetProperty("name")?.GetValue(a) as string;
                        var actionType = a.GetType().GetProperty("type")?.GetValue(a)?.ToString();
                        var expectedControlType = a.GetType().GetProperty("expectedControlType")?.GetValue(a) as string;

                        var bindingsProperty = a.GetType().GetProperty("bindings");
                        var bindings = bindingsProperty?.GetValue(a) as System.Collections.IEnumerable;
                        var bindingPaths = new List<string>();

                        if (bindings != null)
                        {
                            foreach (var b in bindings)
                            {
                                var path = b.GetType().GetProperty("effectivePath")?.GetValue(b) as string;
                                if (!string.IsNullOrEmpty(path))
                                    bindingPaths.Add(path);
                            }
                        }

                        actions.Add(new Dictionary<string, object>
                        {
                            { "map", mapName },
                            { "name", actionName },
                            { "type", actionType ?? "" },
                            { "controlType", expectedControlType ?? "" },
                            { "bindings", bindingPaths.ToArray() }
                        });
                    }
                }
            }

            return actions;
        }
#endif

        private static List<object> DiscoverLegacyAxes()
        {
            var axes = new List<object>();

            try
            {
                var inputManager = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
                if (inputManager == null || inputManager.Length == 0) return axes;

                var serialized = new SerializedObject(inputManager[0]);
                var axesProperty = serialized.FindProperty("m_Axes");
                if (axesProperty == null || !axesProperty.isArray) return axes;

                for (int i = 0; i < axesProperty.arraySize; i++)
                {
                    var axis = axesProperty.GetArrayElementAtIndex(i);
                    var nameProperty = axis.FindPropertyRelative("m_Name");
                    var positiveButton = axis.FindPropertyRelative("positiveButton");
                    var negativeButton = axis.FindPropertyRelative("negativeButton");
                    var altPositiveButton = axis.FindPropertyRelative("altPositiveButton");
                    var altNegativeButton = axis.FindPropertyRelative("altNegativeButton");
                    var typeProperty = axis.FindPropertyRelative("type");
                    var axisProperty = axis.FindPropertyRelative("axis");

                    var entry = new Dictionary<string, object>
                    {
                        { "name", nameProperty?.stringValue ?? "" }
                    };

                    if (positiveButton != null && !string.IsNullOrEmpty(positiveButton.stringValue))
                        entry["positiveButton"] = positiveButton.stringValue;

                    if (negativeButton != null && !string.IsNullOrEmpty(negativeButton.stringValue))
                        entry["negativeButton"] = negativeButton.stringValue;

                    if (altPositiveButton != null && !string.IsNullOrEmpty(altPositiveButton.stringValue))
                        entry["altPositiveButton"] = altPositiveButton.stringValue;

                    if (altNegativeButton != null && !string.IsNullOrEmpty(altNegativeButton.stringValue))
                        entry["altNegativeButton"] = altNegativeButton.stringValue;

                    if (typeProperty != null)
                    {
                        // 0 = Key/Button, 1 = Mouse Movement, 2 = Joystick Axis
                        string[] typeNames = { "KeyOrButton", "MouseMovement", "JoystickAxis" };
                        int typeVal = typeProperty.intValue;
                        entry["type"] = typeVal >= 0 && typeVal < typeNames.Length ? typeNames[typeVal] : typeVal.ToString();
                    }

                    if (axisProperty != null)
                        entry["axis"] = axisProperty.intValue;

                    axes.Add(entry);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityAgenticTools] Failed to read legacy input axes: {ex.Message}");
            }

            return axes;
        }

        // --- Key Simulation ---

        private async Task<object> SimulateKey(Dictionary<string, object> parameters)
        {
            if (!parameters.TryGetValue("key", out var keyObj) || !(keyObj is string keyName))
                throw new ArgumentException("Missing required parameter: key");

            string mode = "press";
            if (parameters.TryGetValue("mode", out var modeObj) && modeObj is string m)
                mode = m;

#if ENABLE_INPUT_SYSTEM
            return await SimulateKeyInputSystem(keyName, mode);
#else
            return await Task.FromResult<object>(new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Key simulation requires the Input System package (com.unity.inputsystem). Legacy Input (UnityEngine.Input) is read-only with no injection API." },
                { "suggestion", "Install the Input System package: Window > Package Manager > Input System" }
            });
#endif
        }

#if ENABLE_INPUT_SYSTEM
        private async Task<object> SimulateKeyInputSystem(string keyName, string mode)
        {
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var keyboardType = FindType("UnityEngine.InputSystem.Keyboard");
                if (keyboardType == null)
                    throw new InvalidOperationException("Input System Keyboard device not found.");

                var currentProp = keyboardType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
                var keyboard = currentProp?.GetValue(null);
                if (keyboard == null)
                    throw new InvalidOperationException("No keyboard device is currently active.");

                var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
                if (inputSystemType == null)
                    throw new InvalidOperationException("InputSystem type not found.");

                // Find the Key enum value
                var keyEnumType = FindType("UnityEngine.InputSystem.Key");
                if (keyEnumType == null)
                    throw new InvalidOperationException("Key enum type not found.");

                object keyValue;
                try
                {
                    keyValue = Enum.Parse(keyEnumType, keyName, ignoreCase: true);
                }
                catch
                {
                    throw new ArgumentException($"Unknown key: '{keyName}'. Use Input System key names (e.g., Space, A, LeftShift, Enter).");
                }

                // Use InputSystem.QueueStateEvent or direct key simulation
                // The most reliable way is through the testing utilities
                var keyControl = keyboard.GetType().GetProperty("Item", new[] { keyEnumType });
                if (keyControl == null)
                {
                    // Try indexer
                    keyControl = keyboard.GetType().GetProperty("Item");
                }

                // Queue state event approach
                var queueMethod = inputSystemType.GetMethod("QueueStateEvent",
                    BindingFlags.Public | BindingFlags.Static);

                // Use Press/Release helpers from InputTestFixture-like approach
                var keyCtrl = keyControl?.GetValue(keyboard, new[] { keyValue });
                if (keyCtrl != null)
                {
                    var pressMethod = FindType("UnityEngine.InputSystem.InputControl")
                        ?.GetMethod("QueueValueChange", BindingFlags.Public | BindingFlags.Static);

                    // Simple approach: use extension methods
                    switch (mode)
                    {
                        case "press":
                        case "down":
                            QueueKeyChange(keyCtrl, 1f, inputSystemType);
                            if (mode == "press")
                            {
                                // Schedule release after update
                                EditorApplication.delayCall += () =>
                                {
                                    try { QueueKeyChange(keyCtrl, 0f, inputSystemType); } catch { }
                                };
                            }
                            break;
                        case "up":
                            QueueKeyChange(keyCtrl, 0f, inputSystemType);
                            break;
                        case "hold":
                            QueueKeyChange(keyCtrl, 1f, inputSystemType);
                            // Hold for ~500ms then release
                            float holdDuration = 0.5f;
                            var holdStart = (float)EditorApplication.timeSinceStartup;
                            void ReleaseOnUpdate()
                            {
                                if ((float)EditorApplication.timeSinceStartup - holdStart >= holdDuration)
                                {
                                    EditorApplication.update -= ReleaseOnUpdate;
                                    try { QueueKeyChange(keyCtrl, 0f, inputSystemType); } catch { }
                                }
                            }
                            EditorApplication.update += ReleaseOnUpdate;
                            break;
                    }
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "key", keyName },
                    { "mode", mode }
                };
            });
        }

        private static void QueueKeyChange(object keyControl, float value, Type inputSystemType)
        {
            // Use InputState.Change for direct state manipulation
            var inputStateType = FindType("UnityEngine.InputSystem.LowLevel.InputState");
            if (inputStateType == null) return;

            var changeMethod = inputStateType.GetMethods(BindingFlags.Public | BindingFlags.Static);
            foreach (var method in changeMethod)
            {
                if (method.Name == "Change" && method.IsGenericMethod)
                {
                    var genericMethod = method.MakeGenericMethod(typeof(float));
                    try
                    {
                        genericMethod.Invoke(null, new object[] { keyControl, value, null, null });
                        return;
                    }
                    catch { }
                }
            }
        }
#endif

        // --- Mouse Simulation ---

        private async Task<object> SimulateMouse(Dictionary<string, object> parameters)
        {
            if (!parameters.TryGetValue("x", out var xObj))
                throw new ArgumentException("Missing required parameter: x");
            if (!parameters.TryGetValue("y", out var yObj))
                throw new ArgumentException("Missing required parameter: y");

            float x = Convert.ToSingle(xObj);
            float y = Convert.ToSingle(yObj);

            string mode = "click";
            if (parameters.TryGetValue("mode", out var modeObj) && modeObj is string m)
                mode = m;

#if ENABLE_INPUT_SYSTEM
            return await SimulateMouseInputSystem(x, y, mode);
#else
            return await Task.FromResult<object>(new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Mouse simulation requires the Input System package (com.unity.inputsystem). Legacy Input is read-only." },
                { "suggestion", "Install the Input System package: Window > Package Manager > Input System" }
            });
#endif
        }

#if ENABLE_INPUT_SYSTEM
        private async Task<object> SimulateMouseInputSystem(float x, float y, string mode)
        {
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var mouseType = FindType("UnityEngine.InputSystem.Mouse");
                if (mouseType == null)
                    throw new InvalidOperationException("Input System Mouse device not found.");

                var currentProp = mouseType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
                var mouse = currentProp?.GetValue(null);
                if (mouse == null)
                    throw new InvalidOperationException("No mouse device is currently active.");

                var inputStateType = FindType("UnityEngine.InputSystem.LowLevel.InputState");

                // Set position
                var positionProp = mouseType.GetProperty("position", BindingFlags.Public | BindingFlags.Instance);
                if (positionProp != null)
                {
                    var posControl = positionProp.GetValue(mouse);
                    ChangeInputState(inputStateType, posControl, new Vector2(x, y));
                }

                // Handle click/down/up
                if (mode == "click" || mode == "down")
                {
                    var leftButtonProp = mouseType.GetProperty("leftButton", BindingFlags.Public | BindingFlags.Instance);
                    if (leftButtonProp != null)
                    {
                        var leftButton = leftButtonProp.GetValue(mouse);
                        ChangeInputState(inputStateType, leftButton, 1f);

                        if (mode == "click")
                        {
                            EditorApplication.delayCall += () =>
                            {
                                try { ChangeInputState(inputStateType, leftButton, 0f); } catch { }
                            };
                        }
                    }
                }
                else if (mode == "up")
                {
                    var leftButtonProp = mouseType.GetProperty("leftButton", BindingFlags.Public | BindingFlags.Instance);
                    if (leftButtonProp != null)
                    {
                        var leftButton = leftButtonProp.GetValue(mouse);
                        ChangeInputState(inputStateType, leftButton, 0f);
                    }
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "x", x },
                    { "y", y },
                    { "mode", mode }
                };
            });
        }

        private static void ChangeInputState(Type inputStateType, object control, object value)
        {
            if (inputStateType == null || control == null) return;

            var methods = inputStateType.GetMethods(BindingFlags.Public | BindingFlags.Static);
            foreach (var method in methods)
            {
                if (method.Name == "Change" && method.IsGenericMethod)
                {
                    var valueType = value.GetType();
                    var genericMethod = method.MakeGenericMethod(valueType);
                    try
                    {
                        genericMethod.Invoke(null, new[] { control, value, null, null });
                        return;
                    }
                    catch { }
                }
            }
        }
#endif

        // --- Touch Simulation ---

        private async Task<object> SimulateTouch(Dictionary<string, object> parameters)
        {
            if (!parameters.TryGetValue("x", out var xObj))
                throw new ArgumentException("Missing required parameter: x");
            if (!parameters.TryGetValue("y", out var yObj))
                throw new ArgumentException("Missing required parameter: y");

            float x = Convert.ToSingle(xObj);
            float y = Convert.ToSingle(yObj);

            string mode = "tap";
            if (parameters.TryGetValue("mode", out var modeObj) && modeObj is string m)
                mode = m;

#if ENABLE_INPUT_SYSTEM
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var touchscreenType = FindType("UnityEngine.InputSystem.Touchscreen");
                if (touchscreenType == null)
                    throw new InvalidOperationException("Input System Touchscreen device not found.");

                var currentProp = touchscreenType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
                var touchscreen = currentProp?.GetValue(null);

                // If no touchscreen, just simulate as mouse
                if (touchscreen == null)
                {
                    return new Dictionary<string, object>
                    {
                        { "success", false },
                        { "error", "No touchscreen device available. Use input-mouse for screen coordinate interaction." }
                    };
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "x", x },
                    { "y", y },
                    { "mode", mode },
                    { "note", "Touch simulation queued" }
                };
            });
#else
            return await Task.FromResult<object>(new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Touch simulation requires the Input System package (com.unity.inputsystem)." },
                { "suggestion", "Install the Input System package: Window > Package Manager > Input System" }
            });
#endif
        }

        // --- Action Trigger ---

        private async Task<object> TriggerAction(Dictionary<string, object> parameters)
        {
            if (!parameters.TryGetValue("name", out var nameObj) || !(nameObj is string actionName))
                throw new ArgumentException("Missing required parameter: name");

#if ENABLE_INPUT_SYSTEM
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var playerInputType = FindType("UnityEngine.InputSystem.PlayerInput");
                if (playerInputType == null)
                    throw new InvalidOperationException("PlayerInput type not found. Is Input System installed?");

                var playerInputs = UnityEngine.Object.FindObjectsOfType(playerInputType);
                if (playerInputs.Length == 0)
                    throw new InvalidOperationException("No PlayerInput component found in scene.");

                foreach (var pi in playerInputs)
                {
                    var actionsProperty = playerInputType.GetProperty("actions", BindingFlags.Public | BindingFlags.Instance);
                    var inputActionAsset = actionsProperty?.GetValue(pi);
                    if (inputActionAsset == null) continue;

                    // Find action by name
                    var findActionMethod = inputActionAsset.GetType().GetMethod("FindAction",
                        new[] { typeof(string), typeof(bool) });
                    if (findActionMethod == null) continue;

                    var action = findActionMethod.Invoke(inputActionAsset, new object[] { actionName, false });
                    if (action == null) continue;

                    // Trigger the action
                    var triggerMethod = action.GetType().GetMethod("Trigger", BindingFlags.Public | BindingFlags.Instance);
                    if (triggerMethod != null)
                    {
                        triggerMethod.Invoke(action, null);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "action", actionName },
                        { "triggered", true }
                    };
                }

                throw new ArgumentException($"Action '{actionName}' not found in any PlayerInput component.");
            });
#else
            return await Task.FromResult<object>(new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Action triggering requires the Input System package (com.unity.inputsystem)." },
                { "suggestion", "Install the Input System package: Window > Package Manager > Input System" }
            });
#endif
        }

        private static Type FindType(string fullName)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var t = asm.GetType(fullName);
                    if (t != null) return t;
                }
                catch { }
            }
            return null;
        }
    }
}
