using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityAgenticTools.Refs;

namespace UnityAgenticTools.API
{
    public static class UIAPI
    {

        // --- Snapshot ---

        public static object Snapshot()
        {

                var elements = new List<UIElementInfo>();

                // Walk uGUI
                try
                {
                    elements.AddRange(UIWalker.WalkUGUI());
                }
                catch (InvalidOperationException)
                {
                    // No EventSystem - not an error for snapshot, just means no uGUI
                }

                // Walk UI Toolkit
                elements.AddRange(UIWalker.WalkUIToolkit());

                var items = new List<object>();
                foreach (var elem in elements)
                {
                    var item = new Dictionary<string, object>
                    {
                        { "ref", elem.Ref },
                        { "type", elem.Type },
                        { "name", elem.Name },
                        { "interactable", elem.Interactable },
                        { "source", elem.Source }
                    };

                    if (!string.IsNullOrEmpty(elem.Label))
                        item["label"] = elem.Label;

                    if (!string.IsNullOrEmpty(elem.ParentRef))
                        item["parentRef"] = elem.ParentRef;

                    if (elem.ScreenRect.width > 0 || elem.ScreenRect.height > 0)
                    {
                        item["rect"] = new Dictionary<string, object>
                        {
                            { "x", Mathf.RoundToInt(elem.ScreenRect.x) },
                            { "y", Mathf.RoundToInt(elem.ScreenRect.y) },
                            { "w", Mathf.RoundToInt(elem.ScreenRect.width) },
                            { "h", Mathf.RoundToInt(elem.ScreenRect.height) }
                        };
                    }

                    items.Add(item);
                }

                return new Dictionary<string, object>
                {
                    { "refCount", RefManager.GetUIRefCount() },
                    { "elements", items.ToArray() }
                };
        }

        // --- Interact ---

        public static object Interact(string refStr, string action, string text = null, float value = 0f, string option = null, bool byIndex = false, string direction = "down", float amount = 0.1f)
        {
            var interactAction = action;

                if (!RefManager.TryResolve(refStr, out var entry, out var kind))
                    throw new ArgumentException($"Stale or invalid ref '{refStr}'. Run ui-snapshot to refresh refs.");

                if (kind != RefKind.UI)
                    throw new ArgumentException($"Ref '{refStr}' is not a UI ref. Use @uN refs from ui-snapshot.");

                // UI Toolkit path
                if (entry.InstanceId == 0 && !string.IsNullOrEmpty(entry.TreePath))
                {
                    return InteractUIToolkit(entry.TreePath, interactAction, refStr, text, value, option, byIndex, direction, amount);
                }

                // uGUI path
                var obj = UnityObjectCompat.ResolveObject(entry.InstanceId);
                if (obj == null)
                    throw new ArgumentException($"Ref '{refStr}' points to a destroyed element. Run ui-snapshot to refresh.");

                var component = obj as Component;
                if (component == null)
                    throw new ArgumentException($"Ref '{refStr}' resolved to {obj.GetType().Name}, not a UI component.");

                return InteractUGUI(component, interactAction, refStr, text, value, option, byIndex, direction, amount);
        }

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

                    // Use ExecuteEvents for proper event chain
                    var go = selectable.gameObject;
                    ExecuteEvents.Execute(go, new PointerEventData(EventSystem.current), ExecuteEvents.pointerClickHandler);

                    // Also invoke onClick for Button
                    if (selectable is Button btn)
                        btn.onClick.Invoke();

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

        // --- UI Toolkit Interaction ---

        private static object InteractUIToolkit(string treePath, string action, string refStr, string text, float value, string option, bool byIndex, string direction, float amount)
        {
            var element = ResolveUIToolkitElement(treePath);
            if (element == null)
                throw new ArgumentException($"Ref '{refStr}' could not be resolved. Run ui-snapshot to refresh.");

            var type = element.GetType();
            var typeName = type.Name;

            switch (action)
            {
                case "click":
                {
                    // Send ClickEvent via reflection
                    var clickEventType = FindType("UnityEngine.UIElements.ClickEvent");
                    if (clickEventType != null)
                    {
                        var panelProp = type.GetProperty("panel", BindingFlags.Public | BindingFlags.Instance);
                        var panel = panelProp?.GetValue(element);

                        // For Button, use InvokeClicked reflection or simulate
                        var clickedField = type.GetField("clicked", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
                        if (clickedField != null)
                        {
                            var action2 = clickedField.GetValue(element) as Action;
                            action2?.Invoke();
                        }
                        else
                        {
                            // Try SendEvent approach
                            var sendEvent = type.GetMethod("SendEvent", BindingFlags.Public | BindingFlags.Instance);
                            if (sendEvent != null)
                            {
                                var evt = Activator.CreateInstance(clickEventType);
                                sendEvent.Invoke(element, new[] { evt });
                            }
                        }
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "click" },
                        { "source", "UIToolkit" }
                    };
                }

                case "fill":
                case "type":
                {
                    if (text == null)
                        throw new ArgumentException("Missing required parameter: text");

                    var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                    if (valueProp == null || valueProp.PropertyType != typeof(string))
                        throw new ArgumentException($"Ref '{refStr}' does not support text input.");

                    if (action == "fill")
                    {
                        valueProp.SetValue(element, text);
                    }
                    else
                    {
                        var current = valueProp.GetValue(element) as string ?? "";
                        valueProp.SetValue(element, current + text);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", action },
                        { "text", text },
                        { "source", "UIToolkit" }
                    };
                }

                case "toggle":
                {
                    var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                    if (valueProp == null || valueProp.PropertyType != typeof(bool))
                        throw new ArgumentException($"Ref '{refStr}' is not a toggle.");

                    bool current = (bool)valueProp.GetValue(element);
                    valueProp.SetValue(element, !current);

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "toggle" },
                        { "isOn", !current },
                        { "source", "UIToolkit" }
                    };
                }

                case "slider":
                {
                    var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                    if (valueProp == null)
                        throw new ArgumentException($"Ref '{refStr}' is not a slider.");

                    if (valueProp.PropertyType == typeof(int))
                        valueProp.SetValue(element, Convert.ToInt32(value));
                    else
                        valueProp.SetValue(element, value);

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "slider" },
                        { "value", valueProp.GetValue(element) },
                        { "source", "UIToolkit" }
                    };
                }

                case "select":
                {
                    if (option == null)
                        throw new ArgumentException("Missing required parameter: option");

                    var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                    if (valueProp != null && valueProp.PropertyType == typeof(string))
                    {
                        valueProp.SetValue(element, option);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "select" },
                        { "source", "UIToolkit" }
                    };
                }

                case "focus":
                {
                    var focusMethod = type.GetMethod("Focus", BindingFlags.Public | BindingFlags.Instance);
                    focusMethod?.Invoke(element, null);

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "focus" },
                        { "source", "UIToolkit" }
                    };
                }

                case "scroll":
                {
                    var scrollOffsetProp = type.GetProperty("scrollOffset", BindingFlags.Public | BindingFlags.Instance);
                    if (scrollOffsetProp != null)
                    {
                        var offset = (Vector2)scrollOffsetProp.GetValue(element);
                        switch (direction.ToLowerInvariant())
                        {
                            case "up": offset.y -= amount; break;
                            case "down": offset.y += amount; break;
                            case "left": offset.x -= amount; break;
                            case "right": offset.x += amount; break;
                        }
                        scrollOffsetProp.SetValue(element, offset);
                    }

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "ref", refStr },
                        { "action", "scroll" },
                        { "source", "UIToolkit" }
                    };
                }

                default:
                    throw new ArgumentException($"Unknown interaction: {action}");
            }
        }

        private static object ResolveUIToolkitElement(string treePath)
        {
            // treePath format: "{docInstanceId}/path/to/element"
            int slashIdx = treePath.IndexOf('/');
            if (slashIdx < 0) return null;

            string elementPath = treePath.Substring(slashIdx + 1).TrimStart('/');

            // Always find UIDocuments dynamically -- cached instance IDs go stale after domain reload
            var uiDocumentType = FindType("UnityEngine.UIElements.UIDocument");
            if (uiDocumentType == null) return null;

            var documents = UnityObjectCompat.FindObjects(uiDocumentType);
            foreach (var doc in documents)
            {
                var comp = doc as Component;
                if (comp == null || !comp.gameObject.activeInHierarchy) continue;
                var result = FindElementInDocument(doc, elementPath);
                if (result != null) return result;
            }

            return null;
        }

        private static object FindElementInDocument(UnityEngine.Object docObj, string elementPath)
        {
            var docType = docObj.GetType();
            var rootProp = docType.GetProperty("rootVisualElement", BindingFlags.Public | BindingFlags.Instance);
            if (rootProp == null) return null;

            var root = rootProp.GetValue(docObj);
            if (root == null) return null;

            // Walk the path to find the exact element by index
            var segments = elementPath.Split('/');
            object current = root;

            for (int s = 0; s < segments.Length; s++)
            {
                if (current == null) return null;
                var segment = segments[s];

                // Parse "name:index" format
                string name = segment;
                int targetIndex = -1;
                int colonIdx = segment.LastIndexOf(':');
                if (colonIdx > 0 && int.TryParse(segment.Substring(colonIdx + 1), out int idx))
                {
                    name = segment.Substring(0, colonIdx);
                    targetIndex = idx;
                }

                if (s == segments.Length - 1 && targetIndex < 0)
                {
                    // Last segment without index: check if current element already matches
                    var curName = current.GetType().GetProperty("name", BindingFlags.Public | BindingFlags.Instance)?.GetValue(current) as string;
                    if (curName == name) return current;

                    // Otherwise search children
                    var queryMethod = current.GetType().GetMethod("Q", new[] { typeof(string), typeof(string) });
                    if (queryMethod != null)
                        return queryMethod.Invoke(current, new object[] { name, null });
                    return null;
                }

                // Navigate to the child at the specified index
                var childCountProp = current.GetType().GetProperty("childCount", BindingFlags.Public | BindingFlags.Instance);
                if (childCountProp == null) return null;

                int childCount = (int)childCountProp.GetValue(current);
                var indexer = current.GetType().GetMethod("ElementAt", BindingFlags.Public | BindingFlags.Instance);
                if (indexer == null) return null;

                if (targetIndex >= 0 && targetIndex < childCount)
                {
                    current = indexer.Invoke(current, new object[] { targetIndex });
                }
                else
                {
                    // No index: find first child with matching name
                    object found = null;
                    for (int i = 0; i < childCount; i++)
                    {
                        var child = indexer.Invoke(current, new object[] { i });
                        var nameProp = child?.GetType().GetProperty("name", BindingFlags.Public | BindingFlags.Instance);
                        var childName = nameProp?.GetValue(child) as string;
                        if (childName == name || (string.IsNullOrEmpty(childName) && child?.GetType().Name == name))
                        {
                            found = child;
                            break;
                        }
                    }
                    if (found == null) return null;
                    current = found;
                }
            }

            return current;
        }

        // --- Query ---

        public static object Query(string refStr, string query)
        {
                if (!RefManager.TryResolve(refStr, out var entry, out var kind))
                    throw new ArgumentException($"Stale or invalid ref '{refStr}'. Run ui-snapshot to refresh refs.");

                // For UI Toolkit elements
                if (entry.InstanceId == 0 && !string.IsNullOrEmpty(entry.TreePath))
                {
                    var element = ResolveUIToolkitElement(entry.TreePath);
                    if (element == null)
                        throw new ArgumentException($"Ref '{refStr}' could not be resolved. Run ui-snapshot to refresh.");

                    return QueryUIToolkitElement(element, query, refStr);
                }

                // For uGUI
                var obj = UnityObjectCompat.ResolveObject(entry.InstanceId);
                if (obj == null)
                    throw new ArgumentException($"Ref '{refStr}' points to a destroyed element. Run ui-snapshot to refresh.");

                var component = obj as Component;
                if (component == null)
                    throw new ArgumentException($"Ref '{refStr}' resolved to {obj.GetType().Name}, not a UI component.");

                switch (query)
                {
                    case "text":
                    {
                        string text = UIWalker.GetChildTextPublic(component.transform);
                        return (object)new Dictionary<string, object>
                        {
                            { "ref", refStr },
                            { "text", text ?? "" }
                        };
                    }

                    case "value":
                    {
                        return GetUGUIValue(component, refStr);
                    }

                default:
                    throw new ArgumentException($"Unknown UI query: {query}. Use: text, value");
                }
        }

        private static object GetUGUIValue(Component component, string refStr)
        {
            if (component is Toggle toggle)
                return new Dictionary<string, object> { { "ref", refStr }, { "value", toggle.isOn } };

            if (component is Slider slider)
                return new Dictionary<string, object> { { "ref", refStr }, { "value", slider.value }, { "min", slider.minValue }, { "max", slider.maxValue } };

            if (component is InputField inputField)
                return new Dictionary<string, object> { { "ref", refStr }, { "value", inputField.text } };

            if (component is Dropdown dropdown)
                return new Dictionary<string, object>
                {
                    { "ref", refStr },
                    { "selectedIndex", dropdown.value },
                    { "selectedText", dropdown.options.Count > dropdown.value ? dropdown.options[dropdown.value].text : "" }
                };

            if (component is Scrollbar scrollbar)
                return new Dictionary<string, object> { { "ref", refStr }, { "value", scrollbar.value } };

            // TMP variants
            var typeName = component.GetType().Name;
            if (typeName == "TMP_InputField")
            {
                var textProp = component.GetType().GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
                return new Dictionary<string, object> { { "ref", refStr }, { "value", textProp?.GetValue(component) ?? "" } };
            }

            return new Dictionary<string, object> { { "ref", refStr }, { "value", null }, { "note", "Element type does not have a readable value" } };
        }

        private static object QueryUIToolkitElement(object element, string query, string refStr)
        {
            var type = element.GetType();

            switch (query)
            {
                case "text":
                {
                    var textProp = type.GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
                    var text = textProp?.GetValue(element) as string ?? "";
                    return new Dictionary<string, object> { { "ref", refStr }, { "text", text } };
                }

                case "value":
                {
                    var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
                    object val = valueProp?.GetValue(element);
                    return new Dictionary<string, object> { { "ref", refStr }, { "value", val } };
                }

                default:
                    throw new ArgumentException($"Unknown UI query: {query}. Use: text, value");
            }
        }

        // --- Wait ---

        public static async Task<object> Wait(string condition, string refStr = null, string name = null, string text = null, int timeout = 10000, int ms = 1000)
        {
            switch (condition)
            {
                case "ui":
                {
                    if (refStr == null) throw new ArgumentException("Missing required parameter: refStr");
                    return await WaitConditionRunner.WaitForCondition(() => IsUIElementActive(refStr), timeout, $"UI element {refStr} to become active");
                }

                case "ui-gone":
                {
                    if (refStr == null) throw new ArgumentException("Missing required parameter: refStr");
                    return await WaitConditionRunner.WaitForCondition(() => !IsUIElementActive(refStr), timeout, $"UI element {refStr} to deactivate");
                }

                case "scene":
                {
                    if (name == null) throw new ArgumentException("Missing required parameter: name");
                    return await WaitConditionRunner.WaitForCondition(() => UnityEngine.SceneManagement.SceneManager.GetActiveScene().name == name, timeout, $"scene '{name}' to load");
                }

                case "log":
                {
                    if (text == null) throw new ArgumentException("Missing required parameter: text");
                    return await WaitConditionRunner.WaitForLog(text, timeout);
                }

                case "compile":
                {
                    return await WaitConditionRunner.WaitForCondition(() => !EditorApplication.isCompiling, timeout, "compilation to finish");
                }

                case "delay":
                {
                    await Task.Delay(ms);
                    return new Dictionary<string, object> { { "success", true }, { "waited", ms } };
                }

                default:
                    throw new ArgumentException($"Unknown wait condition: {condition}. Use: ui, ui-gone, scene, log, compile, delay");
            }
        }

        private static bool IsUIElementActive(string refStr)
        {
            if (!RefManager.TryResolve(refStr, out var entry, out _))
                return false;

            if (entry.InstanceId == 0) return false; // UI Toolkit resolution would need re-walk

            var obj = UnityObjectCompat.ResolveObject(entry.InstanceId);
            if (obj == null) return false;

            if (obj is Component comp) return comp.gameObject.activeInHierarchy;
            if (obj is GameObject go) return go.activeInHierarchy;
            return false;
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
