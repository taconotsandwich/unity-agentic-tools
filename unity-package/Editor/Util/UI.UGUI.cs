using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UnityAgenticTools.Util
{
    public static partial class UI
    {
        private static object InteractUGUI(Component component, string action, string refStr, string text, float value, string option, bool byIndex, string direction, float amount)
        {
            switch (action)
            {
                case "click":
                {
                    var selectable = component as Selectable ?? component.GetComponent<Selectable>();
                    if (selectable == null)
                        throw new ArgumentException($"Ref '{refStr}' is not a clickable element.");

                    if (!selectable.interactable)
                        throw new ArgumentException($"Element '{refStr}' is not interactable (disabled).");

                    // Buttons invoke onClick from their IPointerClickHandler implementation.
                    // Dispatch only through ExecuteEvents so every Selectable follows the same
                    // pointer-click path and Button listeners are not invoked twice.
                    var go = selectable.gameObject;
                    ExecuteEvents.Execute(go, new PointerEventData(EventSystem.current), ExecuteEvents.pointerClickHandler);

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "click" }
                    };
                }

                case "fill":
                {
                    if (text == null)
                        throw new ArgumentException("Missing required parameter: text");

                    if (component is InputField inputField)
                    {
                        inputField.text = text;
                        inputField.onValueChanged.Invoke(text);
                        inputField.onEndEdit.Invoke(text);
                    }
                    else
                    {
                        SetTMPInputFieldText(component, text, clear: true);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "fill" },
                        { "text", text }
                    };
                }

                case "type":
                {
                    if (text == null)
                        throw new ArgumentException("Missing required parameter: text");

                    if (component is InputField inputField)
                    {
                        inputField.text += text;
                        inputField.onValueChanged.Invoke(inputField.text);
                    }
                    else
                    {
                        SetTMPInputFieldText(component, text, clear: false);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "type" },
                        { "text", text }
                    };
                }

                case "toggle":
                {
                    if (!(component is Toggle) && component.GetComponent<Toggle>() == null)
                        throw new ArgumentException($"Ref '{refStr}' is not a Toggle.");

                    var toggle = component as Toggle ?? component.GetComponent<Toggle>();
                    toggle.isOn = !toggle.isOn;

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "toggle" },
                        { "isOn", toggle.isOn }
                    };
                }

                case "slider":
                {
                    if (!(component is Slider) && component.GetComponent<Slider>() == null)
                        throw new ArgumentException($"Ref '{refStr}' is not a Slider.");

                    var slider = component as Slider ?? component.GetComponent<Slider>();
                    slider.value = value;

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "slider" },
                        { "value", slider.value }
                    };
                }

                case "select":
                {
                    if (option == null)
                        throw new ArgumentException("Missing required parameter: option");

                    return SelectDropdown(component, option, byIndex, refStr);
                }

                case "scroll":
                {
                    var scrollRect = component as ScrollRect ?? component.GetComponent<ScrollRect>();
                    if (scrollRect == null)
                        throw new ArgumentException($"Ref '{refStr}' is not a ScrollRect.");

                    var pos = scrollRect.normalizedPosition;
                    switch (direction.ToLowerInvariant())
                    {
                        case "up": pos.y = Mathf.Clamp01(pos.y + amount); break;
                        case "down": pos.y = Mathf.Clamp01(pos.y - amount); break;
                        case "left": pos.x = Mathf.Clamp01(pos.x - amount); break;
                        case "right": pos.x = Mathf.Clamp01(pos.x + amount); break;
                    }
                    scrollRect.normalizedPosition = pos;

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "scroll" },
                        { "normalizedPosition", new Dictionary<string, object> { { "x", pos.x }, { "y", pos.y } } }
                    };
                }

                case "focus":
                {
                    var selectable = component as Selectable ?? component.GetComponent<Selectable>();
                    if (selectable != null)
                    {
                        selectable.Select();
                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "ref", refStr },
                            { "action", "focus" }
                        };
                    }

                    throw new ArgumentException($"Ref '{refStr}' is not a focusable element.");
                }

                default:
                    throw new ArgumentException($"Unknown interaction: {action}. Use: click, fill, type, toggle, slider, select, scroll, focus");
            }
        }

        private static void SetTMPInputFieldText(Component component, string text, bool clear)
        {
            // TMP_InputField via reflection
            var type = component.GetType();
            if (type.Name != "TMP_InputField")
                throw new ArgumentException($"Element is {type.Name}, not an InputField.");

            var textProp = type.GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
            if (textProp == null)
                throw new ArgumentException("Cannot access text property on TMP_InputField.");

            if (clear)
            {
                textProp.SetValue(component, text);
            }
            else
            {
                var current = textProp.GetValue(component) as string ?? "";
                textProp.SetValue(component, current + text);
            }

            // Invoke onValueChanged
            var eventProp = type.GetField("onValueChanged", BindingFlags.Public | BindingFlags.Instance);
            if (eventProp != null)
            {
                var evt = eventProp.GetValue(component);
                var invoke = evt?.GetType().GetMethod("Invoke", new[] { typeof(string) });
                invoke?.Invoke(evt, new object[] { textProp.GetValue(component) });
            }
        }

        private static object SelectDropdown(Component component, string option, bool byIndex, string refStr)
        {
            // Standard Dropdown
            if (component is Dropdown dropdown)
            {
                if (byIndex)
                {
                    dropdown.value = int.Parse(option);
                }
                else
                {
                    int idx = dropdown.options.FindIndex(o => o.text == option);
                    if (idx < 0)
                        throw new ArgumentException($"Option '{option}' not found. Available: {string.Join(", ", dropdown.options.ConvertAll(o => o.text))}");
                    dropdown.value = idx;
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "ref", refStr },
                    { "action", "select" },
                    { "selectedIndex", dropdown.value },
                    { "selectedText", dropdown.options[dropdown.value].text }
                };
            }

            // TMP_Dropdown via reflection
            var type = component.GetType();
            if (type.Name == "TMP_Dropdown")
            {
                var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                var optionsProp = type.GetProperty("options", BindingFlags.Public | BindingFlags.Instance);

                if (byIndex)
                {
                    valueProp.SetValue(component, int.Parse(option));
                }
                else
                {
                    var options = optionsProp.GetValue(component) as System.Collections.IList;
                    int idx = -1;
                    for (int i = 0; i < options.Count; i++)
                    {
                        var textProp = options[i].GetType().GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
                        if (textProp != null && (string)textProp.GetValue(options[i]) == option)
                        {
                            idx = i;
                            break;
                        }
                    }
                    if (idx < 0)
                        throw new ArgumentException($"Option '{option}' not found in TMP_Dropdown.");
                    valueProp.SetValue(component, idx);
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "ref", refStr },
                    { "action", "select" }
                };
            }

            throw new ArgumentException($"Ref '{refStr}' is not a Dropdown.");
        }
    }
}
