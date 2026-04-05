using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.API
{
    public static class InputAPI
    {
        public static object Map()
        {
            var result = new Dictionary<string, object>();
            var actions = new List<object>();
            var legacyAxes = new List<object>();

#if ENABLE_INPUT_SYSTEM
            actions = DiscoverInputSystemActions();
            result["inputSystemAvailable"] = true;
#else
            result["inputSystemAvailable"] = false;
#endif

            legacyAxes = DiscoverLegacyAxes();
            result["actions"] = actions.ToArray();
            result["legacyAxes"] = legacyAxes.ToArray();

            return result;
        }

        public static object Key(string key, string mode = "press")
        {
#if ENABLE_INPUT_SYSTEM
            return SimulateKeyInputSystem(key, mode);
#else
            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Key simulation requires the Input System package (com.unity.inputsystem)." }
            };
#endif
        }

        public static object Mouse(float x, float y, string mode = "click")
        {
#if ENABLE_INPUT_SYSTEM
            return SimulateMouseInputSystem(x, y, mode);
#else
            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Mouse simulation requires the Input System package (com.unity.inputsystem)." }
            };
#endif
        }

        public static object Touch(float x, float y, string mode = "tap")
        {
#if ENABLE_INPUT_SYSTEM
            var touchscreenType = FindType("UnityEngine.InputSystem.Touchscreen");
            if (touchscreenType == null)
                throw new InvalidOperationException("Input System Touchscreen device not found.");

            var currentProp = touchscreenType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
            var touchscreen = currentProp?.GetValue(null);

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
#else
            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Touch simulation requires the Input System package (com.unity.inputsystem)." }
            };
#endif
        }

        public static object Action(string name, string value = null)
        {
#if ENABLE_INPUT_SYSTEM
            if (string.IsNullOrWhiteSpace(name))
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "Action name is required." }
                };
            }

            var playerInputType = FindType("UnityEngine.InputSystem.PlayerInput");
            if (playerInputType == null)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "PlayerInput type not found. Is Input System installed?" }
                };
            }

            var playerInputs = UnityEngine.Object.FindObjectsByType(playerInputType, FindObjectsSortMode.None);
            if (playerInputs.Length == 0)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "No PlayerInput component found in scene." },
                    { "action", name }
                };
            }

            int checkedCount = 0;
            var scannedObjects = new List<string>();

            foreach (var pi in playerInputs)
            {
                checkedCount++;
                var actionsProperty = playerInputType.GetProperty("actions", BindingFlags.Public | BindingFlags.Instance);
                var inputActionAsset = actionsProperty?.GetValue(pi);
                var ownerName = GetObjectName(pi);
                if (inputActionAsset == null)
                {
                    scannedObjects.Add($"{ownerName}: actions=null");
                    continue;
                }

                var findActionMethod = inputActionAsset.GetType().GetMethod("FindAction", new[] { typeof(string), typeof(bool) });
                if (findActionMethod == null)
                {
                    scannedObjects.Add($"{ownerName}: FindAction unavailable");
                    continue;
                }

                var action = findActionMethod.Invoke(inputActionAsset, new object[] { name, false });
                if (action == null)
                {
                    scannedObjects.Add($"{ownerName}: action not found");
                    continue;
                }

                var triggerMethod = action.GetType().GetMethod("Trigger", BindingFlags.Public | BindingFlags.Instance);
                if (triggerMethod != null)
                {
                    triggerMethod.Invoke(action, null);
                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "action", name },
                        { "triggered", true },
                        { "source", ownerName },
                        { "method", "Trigger" }
                    };
                }

                var performMethod = action.GetType().GetMethod("PerformInteractiveRebinding", Type.EmptyTypes);
                if (performMethod != null)
                {
                    scannedObjects.Add($"{ownerName}: Trigger unavailable");
                }

                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "action", name },
                    { "error", $"Action '{name}' was found on {ownerName} but cannot be triggered via reflection (Trigger() not available)." }
                };
            }

            return new Dictionary<string, object>
            {
                { "success", false },
                { "action", name },
                { "error", $"Action '{name}' not found in any PlayerInput component." },
                { "checkedPlayerInputs", checkedCount },
                { "details", scannedObjects.ToArray() }
            };
#else
            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Action triggering requires the Input System package (com.unity.inputsystem)." }
            };
#endif
        }

        // --- Helpers ---
        
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

        private static string GetObjectName(object obj)
        {
            if (obj is UnityEngine.Object unityObj && !string.IsNullOrEmpty(unityObj.name))
                return unityObj.name;
            return obj != null ? obj.GetType().Name : "(null)";
        }

#if ENABLE_INPUT_SYSTEM
        private static List<object> DiscoverInputSystemActions()
        {
            var actions = new List<object>();
            var playerInputType = FindType("UnityEngine.InputSystem.PlayerInput");
            if (playerInputType == null) return actions;

            var playerInputs = UnityEngine.Object.FindObjectsByType(playerInputType, FindObjectsSortMode.None);
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

        private static object SimulateKeyInputSystem(string keyName, string mode)
        {
            var keyboardType = FindType("UnityEngine.InputSystem.Keyboard");
            if (keyboardType == null) throw new InvalidOperationException("Input System Keyboard device not found.");

            var currentProp = keyboardType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
            var keyboard = currentProp?.GetValue(null);
            if (keyboard == null) throw new InvalidOperationException("No keyboard device is currently active.");

            var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            if (inputSystemType == null) throw new InvalidOperationException("InputSystem type not found.");

            var keyEnumType = FindType("UnityEngine.InputSystem.Key");
            if (keyEnumType == null) throw new InvalidOperationException("Key enum type not found.");

            object keyValue;
            try { keyValue = Enum.Parse(keyEnumType, keyName, ignoreCase: true); }
            catch { throw new ArgumentException($"Unknown key: '{keyName}'. Use Input System key names (e.g., Space, A, LeftShift)."); }

            var keyControl = keyboard.GetType().GetProperty("Item", new[] { keyEnumType }) ?? keyboard.GetType().GetProperty("Item");
            var keyCtrl = keyControl?.GetValue(keyboard, new[] { keyValue });

            if (keyCtrl != null)
            {
                switch (mode)
                {
                    case "press":
                    case "down":
                        QueueKeyChange(keyCtrl, 1f, inputSystemType);
                        if (mode == "press")
                        {
                            EditorApplication.delayCall += () => { try { QueueKeyChange(keyCtrl, 0f, inputSystemType); } catch { } };
                        }
                        break;
                    case "up":
                        QueueKeyChange(keyCtrl, 0f, inputSystemType);
                        break;
                    case "hold":
                        QueueKeyChange(keyCtrl, 1f, inputSystemType);
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

            return new Dictionary<string, object> { { "success", true }, { "key", keyName }, { "mode", mode } };
        }

        private static void QueueKeyChange(object keyControl, float value, Type inputSystemType)
        {
            var inputStateType = FindType("UnityEngine.InputSystem.LowLevel.InputState");
            if (inputStateType == null) return;
            var changeMethod = inputStateType.GetMethods(BindingFlags.Public | BindingFlags.Static);
            foreach (var method in changeMethod)
            {
                if (method.Name == "Change" && method.IsGenericMethod)
                {
                    var genericMethod = method.MakeGenericMethod(typeof(float));
                    try { genericMethod.Invoke(null, new object[] { keyControl, value, null, null }); return; } catch { }
                }
            }
        }

        private static object SimulateMouseInputSystem(float x, float y, string mode)
        {
            var mouseType = FindType("UnityEngine.InputSystem.Mouse");
            if (mouseType == null) throw new InvalidOperationException("Input System Mouse device not found.");

            var currentProp = mouseType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
            var mouse = currentProp?.GetValue(null);
            if (mouse == null) throw new InvalidOperationException("No mouse device is currently active.");

            var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            var mouseStateType = FindType("UnityEngine.InputSystem.LowLevel.MouseState");
            if (inputSystemType == null || mouseStateType == null) throw new InvalidOperationException("InputSystem or MouseState type not found.");

            QueueMouseState(inputSystemType, mouseStateType, mouse, x, y, pressed: mode == "click" || mode == "down");

            if (mode == "click")
            {
                EditorApplication.delayCall += () =>
                {
                    try { QueueMouseState(inputSystemType, mouseStateType, mouse, x, y, pressed: false); } catch { }
                };
            }

            return new Dictionary<string, object> { { "success", true }, { "x", x }, { "y", y }, { "mode", mode } };
        }

        private static void QueueMouseState(Type inputSystemType, Type mouseStateType, object mouse, float x, float y, bool pressed)
        {
            var stateObj = Activator.CreateInstance(mouseStateType);

            var posField = mouseStateType.GetField("position", BindingFlags.Public | BindingFlags.Instance);
            posField?.SetValue(stateObj, new Vector2(x, y));

            var buttonsField = mouseStateType.GetField("buttons", BindingFlags.Public | BindingFlags.Instance);
            buttonsField?.SetValue(stateObj, pressed ? (ushort)1 : (ushort)0);

            var queueMethods = inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static);
            foreach (var method in queueMethods)
            {
                if (method.Name == "QueueStateEvent" && method.IsGenericMethod)
                {
                    var genericMethod = method.MakeGenericMethod(mouseStateType);
                    var methodParams = genericMethod.GetParameters();

                    var args = new List<object> { mouse, stateObj };
                    for (int i = 2; i < methodParams.Length; i++)
                    {
                        if (methodParams[i].ParameterType == typeof(double)) args.Add(-1.0);
                        else args.Add(null);
                    }

                    try { genericMethod.Invoke(null, args.ToArray()); break; } catch { }
                }
            }

            var updateMethod = inputSystemType.GetMethod("Update", BindingFlags.Public | BindingFlags.Static, null, Type.EmptyTypes, null);
            updateMethod?.Invoke(null, null);
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

                    var entry = new Dictionary<string, object> { { "name", nameProperty?.stringValue ?? "" } };

                    if (positiveButton != null && !string.IsNullOrEmpty(positiveButton.stringValue)) entry["positiveButton"] = positiveButton.stringValue;
                    if (negativeButton != null && !string.IsNullOrEmpty(negativeButton.stringValue)) entry["negativeButton"] = negativeButton.stringValue;
                    if (altPositiveButton != null && !string.IsNullOrEmpty(altPositiveButton.stringValue)) entry["altPositiveButton"] = altPositiveButton.stringValue;
                    if (altNegativeButton != null && !string.IsNullOrEmpty(altNegativeButton.stringValue)) entry["altNegativeButton"] = altNegativeButton.stringValue;

                    if (typeProperty != null)
                    {
                        string[] typeNames = { "KeyOrButton", "MouseMovement", "JoystickAxis" };
                        int typeVal = typeProperty.intValue;
                        entry["type"] = typeVal >= 0 && typeVal < typeNames.Length ? typeNames[typeVal] : typeVal.ToString();
                    }

                    if (axisProperty != null) entry["axis"] = axisProperty.intValue;

                    axes.Add(entry);
                }
            }
            catch (Exception ex) { Debug.LogWarning($"[UnityAgenticTools] Failed to read legacy input axes: {ex.Message}"); }
            return axes;
        }
    }
}
