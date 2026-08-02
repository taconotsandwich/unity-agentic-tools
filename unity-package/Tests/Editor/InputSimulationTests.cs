using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class InputSimulationTests
    {
        private Type _inputSystemType;

        [SetUp]
        public void SetUp()
        {
            _inputSystemType = FindType("UnityEngine.InputSystem.InputSystem");
            if (_inputSystemType == null)
                Assert.Ignore("The Input System package is not installed in this test project.");
        }

        [Test]
        public void MouseMove_PreservesLeftButtonBetweenDownAndUp()
        {
            var previousMouse = GetCurrentDevice("UnityEngine.InputSystem.Mouse");
            var mouse = AddDevice("Mouse", "UnityAgenticToolsTestMouse");

            try
            {
                AssertSuccess(Util.Input.Mouse(12f, 34f, "down"));
                Assert.That(ReadBoolProperty(ReadProperty(mouse, "leftButton"), "isPressed"), Is.True);

                AssertSuccess(Util.Input.Mouse(56f, 78f, "move"));
                Assert.That(ReadBoolProperty(ReadProperty(mouse, "leftButton"), "isPressed"), Is.True,
                    "A move event cleared the held left button.");

                AssertSuccess(Util.Input.Mouse(56f, 78f, "up"));
                Assert.That(ReadBoolProperty(ReadProperty(mouse, "leftButton"), "isPressed"), Is.False);
            }
            finally
            {
                TryReleaseMouse();
                RemoveDevice(mouse);
                MakeCurrent(previousMouse);
            }
        }

        [Test]
        public void TouchSequence_QueuesBeganMovedAndEndedStates()
        {
            var previousTouchscreen = GetCurrentDevice("UnityEngine.InputSystem.Touchscreen");
            var touchscreen = AddDevice("Touchscreen", "UnityAgenticToolsTestTouchscreen");

            try
            {
                AssertSuccess(Util.Input.Touch(10f, 20f, "down"));
                Assert.That(ReadTouchPhase(touchscreen), Is.EqualTo("Began"));
                Assert.That(ReadTouchPosition(touchscreen), Is.EqualTo(new Vector2(10f, 20f)));

                AssertSuccess(Util.Input.Touch(30f, 40f, "move"));
                Assert.That(ReadTouchPhase(touchscreen), Is.EqualTo("Moved"));
                Assert.That(ReadTouchPosition(touchscreen), Is.EqualTo(new Vector2(30f, 40f)));

                AssertSuccess(Util.Input.Touch(30f, 40f, "up"));
                Assert.That(ReadTouchPhase(touchscreen), Is.EqualTo("Ended"));
            }
            finally
            {
                TryReleaseTouch();
                RemoveDevice(touchscreen);
                MakeCurrent(previousTouchscreen);
            }
        }

        [Test]
        public void TouchWithoutCurrentDevice_CreatesAndCleansUpVirtualTouchscreen()
        {
            if (GetCurrentDevice("UnityEngine.InputSystem.Touchscreen") != null)
                Assert.Ignore("This regression requires an Editor without a current touchscreen device.");

            object createdTouchscreen = null;
            try
            {
                var downResult = AssertSuccess(Util.Input.Touch(15f, 25f, "down"));
                Assert.That((bool)downResult["createdTouchscreen"], Is.True);

                createdTouchscreen = GetCurrentDevice("UnityEngine.InputSystem.Touchscreen");
                Assert.That(createdTouchscreen, Is.Not.Null,
                    "input.touch did not install a virtual touchscreen on a desktop Editor.");
                Assert.That(ReadTouchPhase(createdTouchscreen), Is.EqualTo("Began"));

                AssertSuccess(Util.Input.Touch(15f, 25f, "up"));
                Assert.That(GetCurrentDevice("UnityEngine.InputSystem.Touchscreen"), Is.Null,
                    "The tool-created touchscreen was not removed after the touch ended.");
                createdTouchscreen = null;
            }
            finally
            {
                TryReleaseTouch();
                if (createdTouchscreen != null)
                    RemoveDevice(createdTouchscreen);
            }
        }

        [UnityTest]
        public IEnumerator TouchTap_ReleasesAndCleansUpOnFollowingEditorUpdate()
        {
            if (GetCurrentDevice("UnityEngine.InputSystem.Touchscreen") != null)
                Assert.Ignore("This regression requires an Editor without a current touchscreen device.");

            object createdTouchscreen = null;
            try
            {
                var tapResult = AssertSuccess(Util.Input.Touch(45f, 55f, "tap"));
                Assert.That((bool)tapResult["releaseQueued"], Is.True);
                createdTouchscreen = GetCurrentDevice("UnityEngine.InputSystem.Touchscreen");
                Assert.That(ReadTouchPhase(createdTouchscreen), Is.EqualTo("Began"));

                yield return null;
                yield return null;

                Assert.That(GetCurrentDevice("UnityEngine.InputSystem.Touchscreen"), Is.Null,
                    "The tap release did not remove the tool-created touchscreen after an Editor update.");
                createdTouchscreen = null;
            }
            finally
            {
                TryReleaseTouch();
                if (createdTouchscreen != null)
                    RemoveDevice(createdTouchscreen);
            }
        }

        private object AddDevice(string layout, string name)
        {
            foreach (var method in _inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != "AddDevice" || method.IsGenericMethodDefinition)
                    continue;

                var parameters = method.GetParameters();
                if (parameters.Length != 3 || parameters[0].ParameterType != typeof(string))
                    continue;

                return method.Invoke(null, new object[] { layout, name, null });
            }

            Assert.Fail("InputSystem.AddDevice(string, string, string) was not found.");
            return null;
        }

        private void RemoveDevice(object device)
        {
            if (device == null)
                return;

            foreach (var method in _inputSystemType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (method.Name != "RemoveDevice" || method.GetParameters().Length != 1)
                    continue;

                method.Invoke(null, new[] { device });
                return;
            }

            Assert.Fail("InputSystem.RemoveDevice(InputDevice) was not found.");
        }

        private static object GetCurrentDevice(string typeName)
        {
            var deviceType = FindType(typeName);
            return deviceType
                ?.GetProperty("current", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
        }

        private static void MakeCurrent(object device)
        {
            device?.GetType().GetMethod("MakeCurrent", BindingFlags.Public | BindingFlags.Instance)?.Invoke(device, null);
        }

        private static object ReadProperty(object target, string propertyName)
        {
            Assert.That(target, Is.Not.Null);
            var property = target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance);
            Assert.That(property, Is.Not.Null, $"{target.GetType().FullName}.{propertyName} was not found.");
            return property.GetValue(target);
        }

        private static bool ReadBoolProperty(object target, string propertyName)
        {
            return (bool)ReadProperty(target, propertyName);
        }

        private static string ReadTouchPhase(object touchscreen)
        {
            var primaryTouch = ReadProperty(touchscreen, "primaryTouch");
            var phaseControl = ReadProperty(primaryTouch, "phase");
            return ReadControlValue(phaseControl).ToString();
        }

        private static Vector2 ReadTouchPosition(object touchscreen)
        {
            var primaryTouch = ReadProperty(touchscreen, "primaryTouch");
            var positionControl = ReadProperty(primaryTouch, "position");
            return (Vector2)ReadControlValue(positionControl);
        }

        private static object ReadControlValue(object control)
        {
            var method = control.GetType().GetMethod(
                "ReadValue",
                BindingFlags.Public | BindingFlags.Instance,
                null,
                Type.EmptyTypes,
                null);
            Assert.That(method, Is.Not.Null, $"{control.GetType().FullName}.ReadValue() was not found.");
            return method.Invoke(control, null);
        }

        private static Dictionary<string, object> AssertSuccess(object rawResult)
        {
            var result = rawResult as Dictionary<string, object>;
            Assert.That(result, Is.Not.Null, "Input command returned no result payload.");
            Assert.IsTrue(
                (bool)result["success"],
                result.TryGetValue("error", out var error) ? error.ToString() : "Input command reported failure.");
            return result;
        }

        private static void TryReleaseMouse()
        {
            try
            {
                Util.Input.Mouse(0f, 0f, "up");
            }
            catch
            {
            }
        }

        private static void TryReleaseTouch()
        {
            try
            {
                Util.Input.Touch(0f, 0f, "up");
            }
            catch
            {
            }
        }

        private static Type FindType(string fullName)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType(fullName);
                if (type != null)
                    return type;
            }

            return null;
        }
    }
}
