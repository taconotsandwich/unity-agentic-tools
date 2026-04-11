using System;
using System.Collections.Generic;
using System.Reflection;
using UnityAgenticTools;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UnityAgenticTools.Refs
{
    public struct UIElementInfo
    {
        public string Ref;
        public string Type;
        public string Name;
        public string Label;
        public bool Interactable;
        public Rect ScreenRect;
        public int Depth;
        public string ParentRef;
        public string Source; // "uGUI" or "UIToolkit"
    }

    public static class UIWalker
    {
        // --- uGUI Walking ---

        public static List<UIElementInfo> WalkUGUI()
        {
            var results = new List<UIElementInfo>();

            var eventSystem = UnityObjectCompat.FindAnyObject<EventSystem>();
            if (eventSystem == null)
            {
                throw new InvalidOperationException(
                    "No active EventSystem found in scene. uGUI interactions require an EventSystem. " +
                    "Add one via GameObject > UI > EventSystem.");
            }

            var canvases = UnityObjectCompat.FindObjects<Canvas>();
            foreach (var canvas in canvases)
            {
                if (!canvas.gameObject.activeInHierarchy) continue;
                if (canvas.transform.parent != null)
                {
                    var parentCanvas = canvas.GetComponentInParent<Canvas>();
                    if (parentCanvas != null && parentCanvas != canvas) continue;
                }

                WalkCanvasChildren(canvas.transform, results, 0, null, canvas);
            }

            return results;
        }

        private static void WalkCanvasChildren(Transform parent, List<UIElementInfo> results, int depth, string parentRef, Canvas rootCanvas)
        {
            for (int i = 0; i < parent.childCount; i++)
            {
                var child = parent.GetChild(i);
                if (!child.gameObject.activeInHierarchy) continue;

                string currentRef = null;
                var selectable = child.GetComponent<Selectable>();

                if (selectable != null)
                {
                    string type = GetSelectableType(selectable);
                    string label = GetSelectableLabel(selectable);

                    currentRef = RefManager.RegisterUI(UnityObjectCompat.GetObjectId(selectable));
                    results.Add(new UIElementInfo
                    {
                        Ref = currentRef,
                        Type = type,
                        Name = child.name,
                        Label = label,
                        Interactable = selectable.interactable,
                        ScreenRect = GetScreenRect(child as RectTransform, rootCanvas),
                        Depth = depth,
                        ParentRef = parentRef,
                        Source = "uGUI"
                    });
                }

                var scrollRect = child.GetComponent<ScrollRect>();
                if (scrollRect != null && selectable == null)
                {
                    currentRef = RefManager.RegisterUI(UnityObjectCompat.GetObjectId(scrollRect));
                    results.Add(new UIElementInfo
                    {
                        Ref = currentRef,
                        Type = "ScrollRect",
                        Name = child.name,
                        Label = null,
                        Interactable = true,
                        ScreenRect = GetScreenRect(child as RectTransform, rootCanvas),
                        Depth = depth,
                        ParentRef = parentRef,
                        Source = "uGUI"
                    });
                }

                WalkCanvasChildren(child, results, depth + 1, currentRef ?? parentRef, rootCanvas);
            }
        }

        private static string GetSelectableType(Selectable selectable)
        {
            if (selectable is Button) return "Button";
            if (selectable is Toggle) return "Toggle";
            if (selectable is Slider) return "Slider";
            if (selectable is Scrollbar) return "Scrollbar";

            // Check for TMP variants via type name to avoid hard dependency
            var typeName = selectable.GetType().Name;
            if (typeName == "TMP_Dropdown" || selectable is Dropdown) return "Dropdown";
            if (typeName == "TMP_InputField" || selectable is InputField) return "InputField";

            return typeName;
        }

        private static string GetSelectableLabel(Selectable selectable)
        {
            // Button: look for Text/TMP child
            if (selectable is Button)
            {
                return GetChildText(selectable.transform);
            }

            // Toggle: get isOn + label
            if (selectable is Toggle toggle)
            {
                var label = GetChildText(selectable.transform);
                return label ?? (toggle.isOn ? "on" : "off");
            }

            // Slider: value
            if (selectable is Slider slider)
            {
                return slider.value.ToString("G");
            }

            // Dropdown / TMP_Dropdown
            if (selectable is Dropdown dropdown)
            {
                return dropdown.options.Count > dropdown.value
                    ? dropdown.options[dropdown.value].text
                    : dropdown.value.ToString();
            }

            // TMP_Dropdown via reflection
            var typeName = selectable.GetType().Name;
            if (typeName == "TMP_Dropdown")
            {
                return GetTMPDropdownLabel(selectable);
            }

            // InputField / TMP_InputField
            if (selectable is InputField inputField)
            {
                return string.IsNullOrEmpty(inputField.text) ? inputField.placeholder?.GetComponent<Text>()?.text : inputField.text;
            }
            if (typeName == "TMP_InputField")
            {
                return GetTMPInputFieldText(selectable);
            }

            return GetChildText(selectable.transform);
        }

        public static string GetChildTextPublic(Transform parent)
        {
            return GetChildText(parent);
        }

        private static string GetChildText(Transform parent)
        {
            // Check for TMP first (via reflection to avoid hard dep)
            for (int i = 0; i < parent.childCount; i++)
            {
                var child = parent.GetChild(i);
                var tmpText = GetTMPText(child.gameObject);
                if (tmpText != null) return tmpText;

                var uiText = child.GetComponent<Text>();
                if (uiText != null && !string.IsNullOrEmpty(uiText.text)) return uiText.text;
            }

            // Also check direct text
            var directTmp = GetTMPText(parent.gameObject);
            if (directTmp != null) return directTmp;

            var directText = parent.GetComponent<Text>();
            if (directText != null && !string.IsNullOrEmpty(directText.text)) return directText.text;

            return null;
        }

        private static string GetTMPText(GameObject go)
        {
            // Use reflection to avoid hard dependency on TMP package
            var comp = go.GetComponent("TMP_Text");
            if (comp == null) comp = go.GetComponent("TextMeshProUGUI");
            if (comp == null) return null;

            var textProp = comp.GetType().GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
            if (textProp == null) return null;

            return textProp.GetValue(comp) as string;
        }

        private static string GetTMPDropdownLabel(Selectable selectable)
        {
            var type = selectable.GetType();
            var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
            var optionsProp = type.GetProperty("options", BindingFlags.Public | BindingFlags.Instance);
            if (valueProp == null || optionsProp == null) return null;

            int value = (int)valueProp.GetValue(selectable);
            var options = optionsProp.GetValue(selectable) as System.Collections.IList;
            if (options == null || value >= options.Count) return value.ToString();

            var item = options[value];
            var textProp = item.GetType().GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
            return textProp?.GetValue(item) as string ?? value.ToString();
        }

        private static string GetTMPInputFieldText(Selectable selectable)
        {
            var type = selectable.GetType();
            var textProp = type.GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
            return textProp?.GetValue(selectable) as string;
        }

        private static Rect GetScreenRect(RectTransform rt, Canvas rootCanvas)
        {
            if (rt == null) return Rect.zero;

            var corners = new Vector3[4];
            rt.GetWorldCorners(corners);

            if (rootCanvas.renderMode == RenderMode.ScreenSpaceOverlay)
            {
                // World corners ARE screen coords for overlay
                float minX = Mathf.Min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
                float maxX = Mathf.Max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
                float minY = Mathf.Min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
                float maxY = Mathf.Max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
                return new Rect(minX, minY, maxX - minX, maxY - minY);
            }

            // Camera or WorldSpace: project via camera
            var cam = rootCanvas.worldCamera ?? Camera.main;
            if (cam == null) return Rect.zero;

            var screenCorners = new Vector2[4];
            for (int i = 0; i < 4; i++)
            {
                screenCorners[i] = RectTransformUtility.WorldToScreenPoint(cam, corners[i]);
            }

            float sMinX = Mathf.Min(screenCorners[0].x, screenCorners[1].x, screenCorners[2].x, screenCorners[3].x);
            float sMaxX = Mathf.Max(screenCorners[0].x, screenCorners[1].x, screenCorners[2].x, screenCorners[3].x);
            float sMinY = Mathf.Min(screenCorners[0].y, screenCorners[1].y, screenCorners[2].y, screenCorners[3].y);
            float sMaxY = Mathf.Max(screenCorners[0].y, screenCorners[1].y, screenCorners[2].y, screenCorners[3].y);
            return new Rect(sMinX, sMinY, sMaxX - sMinX, sMaxY - sMinY);
        }

        // --- UI Toolkit Walking ---

        public static List<UIElementInfo> WalkUIToolkit()
        {
            var results = new List<UIElementInfo>();

            // UI Toolkit: find all UIDocument components in scene
            // Use reflection to avoid compile error if UIElements not available
            var uiDocumentType = FindType("UnityEngine.UIElements.UIDocument");
            if (uiDocumentType == null) return results;

            var documents = UnityObjectCompat.FindObjects(uiDocumentType);
            foreach (var doc in documents)
            {
                var comp = doc as Component;
                if (comp == null || !comp.gameObject.activeInHierarchy) continue;

                var rootProp = uiDocumentType.GetProperty("rootVisualElement", BindingFlags.Public | BindingFlags.Instance);
                if (rootProp == null) continue;

                var root = rootProp.GetValue(doc);
                if (root == null) continue;

                int docInstanceId = UnityObjectCompat.GetObjectId(comp);
                WalkVisualElement(root, results, 0, null, docInstanceId, "");
            }

            return results;
        }

        private static void WalkVisualElement(object element, List<UIElementInfo> results, int depth, string parentRef, int docInstanceId, string path)
        {
            if (element == null) return;

            var type = element.GetType();
            string typeName = type.Name;

            bool isInteractive = IsInteractiveUIToolkitType(typeName);

            if (isInteractive)
            {
                string currentPath = BuildElementPath(element, path);
                string label = GetUIToolkitLabel(element, typeName);
                Rect bounds = GetUIToolkitBounds(element);

                string refStr = RefManager.RegisterUI(0, $"{docInstanceId}/{currentPath}");
                results.Add(new UIElementInfo
                {
                    Ref = refStr,
                    Type = MapUIToolkitType(typeName),
                    Name = GetElementName(element),
                    Label = label,
                    Interactable = GetUIToolkitEnabled(element),
                    ScreenRect = bounds,
                    Depth = depth,
                    ParentRef = parentRef,
                    Source = "UIToolkit"
                });

                parentRef = refStr;
            }

            // Walk children
            var childCountProp = type.GetProperty("childCount", BindingFlags.Public | BindingFlags.Instance);
            if (childCountProp == null) return;

            int childCount = (int)childCountProp.GetValue(element);
            var indexer = type.GetMethod("ElementAt", BindingFlags.Public | BindingFlags.Instance);
            if (indexer == null) return;

            for (int i = 0; i < childCount; i++)
            {
                var child = indexer.Invoke(element, new object[] { i });
                string childPath = $"{path}/{GetElementName(child)}:{i}";
                WalkVisualElement(child, results, depth + 1, parentRef, docInstanceId, childPath);
            }
        }

        private static bool IsInteractiveUIToolkitType(string typeName)
        {
            switch (typeName)
            {
                case "Button":
                case "TextField":
                case "Toggle":
                case "RadioButton":
                case "Slider":
                case "SliderInt":
                case "MinMaxSlider":
                case "DropdownField":
                case "PopupField`1":
                case "ScrollView":
                case "Foldout":
                case "EnumField":
                    return true;
                default:
                    return false;
            }
        }

        private static string MapUIToolkitType(string typeName)
        {
            switch (typeName)
            {
                case "TextField": return "InputField";
                case "RadioButton": return "Toggle";
                case "SliderInt": return "Slider";
                case "MinMaxSlider": return "Slider";
                case "DropdownField": return "Dropdown";
                case "PopupField`1": return "Dropdown";
                case "EnumField": return "Dropdown";
                default: return typeName;
            }
        }

        private static string GetUIToolkitLabel(object element, string typeName)
        {
            var type = element.GetType();

            // Try "text" property (Button, Toggle, etc.)
            var textProp = type.GetProperty("text", BindingFlags.Public | BindingFlags.Instance);
            if (textProp != null)
            {
                var text = textProp.GetValue(element) as string;
                if (!string.IsNullOrEmpty(text)) return text;
            }

            // Try "value" property (Slider, TextField, etc.)
            var valueProp = type.GetProperty("value", BindingFlags.Public | BindingFlags.Instance);
            if (valueProp != null)
            {
                var val = valueProp.GetValue(element);
                if (val != null) return val.ToString();
            }

            // Try "label" property
            var labelProp = type.GetProperty("label", BindingFlags.Public | BindingFlags.Instance);
            if (labelProp != null)
            {
                var label = labelProp.GetValue(element) as string;
                if (!string.IsNullOrEmpty(label)) return label;
            }

            return null;
        }

        private static bool GetUIToolkitEnabled(object element)
        {
            var prop = element.GetType().GetProperty("enabledSelf", BindingFlags.Public | BindingFlags.Instance);
            if (prop == null) return true;
            return (bool)prop.GetValue(element);
        }

        private static Rect GetUIToolkitBounds(object element)
        {
            var prop = element.GetType().GetProperty("worldBound", BindingFlags.Public | BindingFlags.Instance);
            if (prop == null) return Rect.zero;
            return (Rect)prop.GetValue(element);
        }

        private static string GetElementName(object element)
        {
            if (element == null) return "";
            var nameProp = element.GetType().GetProperty("name", BindingFlags.Public | BindingFlags.Instance);
            if (nameProp == null) return element.GetType().Name;
            var name = nameProp.GetValue(element) as string;
            return string.IsNullOrEmpty(name) ? element.GetType().Name : name;
        }

        private static string BuildElementPath(object element, string parentPath)
        {
            string name = GetElementName(element);
            return string.IsNullOrEmpty(parentPath) ? name : $"{parentPath}/{name}";
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
