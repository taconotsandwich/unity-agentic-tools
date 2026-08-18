using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace UnityAgenticTools.Util
{
    public static partial class Input
    {
#if ENABLE_INPUT_SYSTEM
        private static bool _simulatedLeftButtonPressed;
        private static int _mouseButtonRevision;
        private static Vector2 _simulatedMousePosition;

        private static bool _simulatedTouchActive;
        private static int _activeTouchId;
        private static int _nextTouchId = 1;
        private static object _activeTouchscreen;
        private static object _ownedTouchscreen;
        private static Vector2 _activeTouchPosition;

        static Input()
        {
            AssemblyReloadEvents.beforeAssemblyReload += CleanupOwnedTouchscreen;
            EditorApplication.quitting += CleanupOwnedTouchscreen;
        }

        private static object SimulateMouseInputSystem(float x, float y, string mode)
        {
            var normalizedMode = NormalizeMode(mode, "click");
            if (normalizedMode != "click" && normalizedMode != "down" &&
                normalizedMode != "move" && normalizedMode != "up")
            {
                return Failure($"Unsupported mouse mode '{mode}'. Use click, down, move, or up.");
            }

            var mouseType = FindType("UnityEngine.InputSystem.Mouse");
            if (mouseType == null)
                throw new InvalidOperationException("Input System Mouse device not found.");

            var currentProp = mouseType.GetProperty("current", BindingFlags.Public | BindingFlags.Static);
            var mouse = currentProp?.GetValue(null);
            if (mouse == null)
                throw new InvalidOperationException("No mouse device is currently active.");

            var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            var mouseStateType = FindType("UnityEngine.InputSystem.LowLevel.MouseState");
            if (inputSystemType == null || mouseStateType == null)
                throw new InvalidOperationException("InputSystem or MouseState type not found.");

            var pressed = normalizedMode == "move"
                ? _simulatedLeftButtonPressed
                : normalizedMode == "click" || normalizedMode == "down";

            QueueMouseState(inputSystemType, mouseStateType, mouse, x, y, pressed);
            _simulatedMousePosition = new Vector2(x, y);
            _simulatedLeftButtonPressed = pressed;

            if (normalizedMode != "move")
                _mouseButtonRevision += 1;

            if (normalizedMode == "click")
            {
                var releaseRevision = _mouseButtonRevision;
                void ReleaseOnUpdate()
                {
                    EditorApplication.update -= ReleaseOnUpdate;
                    if (!_simulatedLeftButtonPressed || releaseRevision != _mouseButtonRevision)
                        return;

                    try
                    {
                        QueueMouseState(
                            inputSystemType,
                            mouseStateType,
                            mouse,
                            _simulatedMousePosition.x,
                            _simulatedMousePosition.y,
                            false);
                        _simulatedLeftButtonPressed = false;
                        _mouseButtonRevision += 1;
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[UnityAgenticTools] Failed to release simulated mouse click: {ex.Message}");
                    }
                }

                EditorApplication.update += ReleaseOnUpdate;
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "x", x },
                { "y", y },
                { "mode", normalizedMode },
                { "leftButtonPressed", pressed }
            };
        }

        private static object SimulateTouchInputSystem(float x, float y, string mode)
        {
            var normalizedMode = NormalizeMode(mode, "tap");
            if (normalizedMode != "tap" && normalizedMode != "down" &&
                normalizedMode != "move" && normalizedMode != "up")
            {
                return Failure($"Unsupported touch mode '{mode}'. Use tap, down, move, or up.");
            }

            var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            var touchStateType = FindType("UnityEngine.InputSystem.LowLevel.TouchState");
            if (inputSystemType == null || touchStateType == null)
                throw new InvalidOperationException("InputSystem or TouchState type not found.");

            if (normalizedMode == "tap" || normalizedMode == "down")
            {
                if (_simulatedTouchActive)
                    return Failure("A simulated touch is already active. Send input.touch with mode up before starting another touch.");

                var touchscreen = GetOrCreateTouchscreen(inputSystemType);

                var touchId = AllocateTouchId();
                var position = new Vector2(x, y);
                try
                {
                    QueueTouchState(inputSystemType, touchStateType, touchscreen, touchId, position, "Began");
                }
                catch
                {
                    CleanupOwnedTouchscreen();
                    throw;
                }

                _simulatedTouchActive = true;
                _activeTouchId = touchId;
                _activeTouchscreen = touchscreen;
                _activeTouchPosition = position;

                if (normalizedMode == "tap")
                    QueueTapRelease(inputSystemType, touchStateType, touchscreen, touchId);

                return TouchSuccess(
                    x,
                    y,
                    normalizedMode,
                    touchId,
                    "Began",
                    normalizedMode == "tap",
                    _ownedTouchscreen != null);
            }

            if (!_simulatedTouchActive || _activeTouchscreen == null)
                return Failure($"Cannot send touch mode '{normalizedMode}' because no simulated touch is active.");

            var nextPosition = new Vector2(x, y);
            var phase = normalizedMode == "move" ? "Moved" : "Ended";
            QueueTouchState(
                inputSystemType,
                touchStateType,
                _activeTouchscreen,
                _activeTouchId,
                nextPosition,
                phase);
            _activeTouchPosition = nextPosition;

            var result = TouchSuccess(
                x,
                y,
                normalizedMode,
                _activeTouchId,
                phase,
                false,
                _ownedTouchscreen != null);
            if (normalizedMode == "up")
                ResetTouchState(inputSystemType);

            return result;
        }

        private static void QueueTapRelease(Type inputSystemType, Type touchStateType, object touchscreen, int touchId)
        {
            void ReleaseOnUpdate()
            {
                EditorApplication.update -= ReleaseOnUpdate;
                if (!_simulatedTouchActive || _activeTouchId != touchId)
                    return;

                try
                {
                    QueueTouchState(
                        inputSystemType,
                        touchStateType,
                        touchscreen,
                        touchId,
                        _activeTouchPosition,
                        "Ended");
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityAgenticTools] Failed to release simulated touch: {ex.Message}");
                }
                finally
                {
                    if (_activeTouchId == touchId)
                        ResetTouchState(inputSystemType);
                }
            }

            EditorApplication.update += ReleaseOnUpdate;
        }

        private static object GetOrCreateTouchscreen(Type inputSystemType)
        {
            var touchscreenType = FindType("UnityEngine.InputSystem.Touchscreen");
            if (touchscreenType == null)
                throw new InvalidOperationException("Input System Touchscreen device not found.");

            var touchscreen = touchscreenType
                .GetProperty("current", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            if (touchscreen != null)
                return touchscreen;

            foreach (var method in inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != "AddDevice" || method.IsGenericMethodDefinition)
                    continue;

                var parameters = method.GetParameters();
                if (parameters.Length != 3 || parameters[0].ParameterType != typeof(string))
                    continue;

                try
                {
                    _ownedTouchscreen = method.Invoke(
                        null,
                        new object[] { "Touchscreen", "UnityAgenticToolsTouchscreen", null });
                    return _ownedTouchscreen ??
                        throw new InvalidOperationException("InputSystem.AddDevice returned no touchscreen.");
                }
                catch (TargetInvocationException ex)
                {
                    throw new InvalidOperationException(
                        "Could not create a virtual touchscreen for input.touch.",
                        ex.InnerException ?? ex);
                }
            }

            throw new InvalidOperationException("InputSystem.AddDevice(string, string, string) was not found.");
        }

        private static void QueueMouseState(
            Type inputSystemType,
            Type mouseStateType,
            object mouse,
            float x,
            float y,
            bool pressed)
        {
            var state = Activator.CreateInstance(mouseStateType);
            var positionField = mouseStateType.GetField("position", BindingFlags.Public | BindingFlags.Instance);
            var buttonsField = mouseStateType.GetField("buttons", BindingFlags.Public | BindingFlags.Instance);
            if (positionField == null || buttonsField == null)
                throw new InvalidOperationException("MouseState position or buttons field not found.");

            positionField.SetValue(state, new Vector2(x, y));
            buttonsField.SetValue(state, pressed ? (ushort)1 : (ushort)0);
            QueueInputStateEvent(inputSystemType, mouseStateType, mouse, state);
        }

        private static void QueueTouchState(
            Type inputSystemType,
            Type touchStateType,
            object touchscreen,
            int touchId,
            Vector2 position,
            string phaseName)
        {
            var state = Activator.CreateInstance(touchStateType);
            var touchIdField = touchStateType.GetField("touchId", BindingFlags.Public | BindingFlags.Instance);
            var positionField = touchStateType.GetField("position", BindingFlags.Public | BindingFlags.Instance);
            var pressureField = touchStateType.GetField("pressure", BindingFlags.Public | BindingFlags.Instance);
            var phaseProperty = touchStateType.GetProperty("phase", BindingFlags.Public | BindingFlags.Instance);
            if (touchIdField == null || positionField == null || pressureField == null || phaseProperty == null)
                throw new InvalidOperationException("TouchState fields required for simulation were not found.");

            touchIdField.SetValue(state, touchId);
            positionField.SetValue(state, position);
            pressureField.SetValue(state, phaseName == "Ended" ? 0f : 1f);
            phaseProperty.SetValue(state, Enum.Parse(phaseProperty.PropertyType, phaseName));
            QueueInputStateEvent(inputSystemType, touchStateType, touchscreen, state);
        }

        private static void QueueInputStateEvent(Type inputSystemType, Type stateType, object device, object state)
        {
            Exception invocationError = null;
            foreach (var method in inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != "QueueStateEvent" || !method.IsGenericMethodDefinition ||
                    method.GetGenericArguments().Length != 1)
                    continue;

                try
                {
                    var genericMethod = method.MakeGenericMethod(stateType);
                    var parameters = genericMethod.GetParameters();
                    var args = new object[parameters.Length];
                    args[0] = device;
                    args[1] = state;
                    for (var index = 2; index < parameters.Length; index += 1)
                    {
                        args[index] = parameters[index].ParameterType == typeof(double)
                            ? -1.0
                            : parameters[index].DefaultValue;
                    }

                    genericMethod.Invoke(null, args);
                    var updateMethod = inputSystemType.GetMethod(
                        "Update",
                        BindingFlags.Public | BindingFlags.Static,
                        null,
                        Type.EmptyTypes,
                        null);
                    if (updateMethod == null)
                        throw new InvalidOperationException("InputSystem.Update() was not found.");

                    updateMethod.Invoke(null, null);
                    return;
                }
                catch (TargetInvocationException ex)
                {
                    invocationError = ex.InnerException ?? ex;
                }
                catch (Exception ex)
                {
                    invocationError = ex;
                }
            }

            throw new InvalidOperationException(
                $"Could not queue Input System state event for {stateType.FullName}.",
                invocationError);
        }

        private static Dictionary<string, object> TouchSuccess(
            float x,
            float y,
            string mode,
            int touchId,
            string phase,
            bool releaseQueued,
            bool createdTouchscreen)
        {
            return new Dictionary<string, object>
            {
                { "success", true },
                { "x", x },
                { "y", y },
                { "mode", mode },
                { "touchId", touchId },
                { "phase", phase },
                { "releaseQueued", releaseQueued },
                { "createdTouchscreen", createdTouchscreen }
            };
        }

        private static Dictionary<string, object> Failure(string error)
        {
            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", error }
            };
        }

        private static string NormalizeMode(string mode, string fallback)
        {
            return string.IsNullOrWhiteSpace(mode) ? fallback : mode.Trim().ToLowerInvariant();
        }

        private static int AllocateTouchId()
        {
            var touchId = _nextTouchId;
            _nextTouchId = _nextTouchId == int.MaxValue ? 1 : _nextTouchId + 1;
            return touchId;
        }

        private static void ResetTouchState(Type inputSystemType)
        {
            _simulatedTouchActive = false;
            _activeTouchId = 0;
            _activeTouchscreen = null;
            _activeTouchPosition = Vector2.zero;
            RemoveOwnedTouchscreen(inputSystemType);
        }

        private static void CleanupOwnedTouchscreen()
        {
            var inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            if (inputSystemType != null)
                RemoveOwnedTouchscreen(inputSystemType);
        }

        private static void RemoveOwnedTouchscreen(Type inputSystemType)
        {
            var touchscreen = _ownedTouchscreen;
            _ownedTouchscreen = null;
            if (touchscreen == null)
                return;

            foreach (var method in inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != "RemoveDevice" || method.GetParameters().Length != 1)
                    continue;

                try
                {
                    method.Invoke(null, new[] { touchscreen });
                    return;
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityAgenticTools] Failed to remove virtual touchscreen: {ex.Message}");
                    return;
                }
            }

            Debug.LogWarning("[UnityAgenticTools] InputSystem.RemoveDevice(InputDevice) was not found.");
        }
#endif
    }
}
