using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityAgenticTools.Refs;

namespace UnityAgenticTools.Server
{
    public class ScreenshotHandler : IRequestHandler
    {
        public string MethodPrefix => "editor.screenshot.";

        public async Task<object> HandleAsync(string method, Dictionary<string, object> parameters)
        {
            var action = method.Substring(MethodPrefix.Length);

            switch (action)
            {
                case "take":
                    return await TakeScreenshot(parameters);
                case "annotated":
                    return await TakeAnnotatedScreenshot(parameters);
                default:
                    throw new InvalidOperationException($"Unknown screenshot action: {action}");
            }
        }

        private async Task<object> TakeScreenshot(Dictionary<string, object> parameters)
        {
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var outputPath = "screenshot.png";
                if (parameters.TryGetValue("output", out var outputObj) && outputObj is string op)
                {
                    outputPath = op;
                }

                var superSize = 1;
                if (parameters.TryGetValue("superSize", out var ssObj))
                {
                    superSize = Convert.ToInt32(ssObj);
                }

                if (!Path.IsPathRooted(outputPath))
                {
                    var projectPath = Path.GetDirectoryName(Application.dataPath);
                    outputPath = Path.Combine(projectPath, outputPath);
                }

                var dir = Path.GetDirectoryName(outputPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                // Synchronous RenderTexture-based capture
                var gameView = GetGameViewRenderTexture();
                if (gameView != null)
                {
                    int width = gameView.width * superSize;
                    int height = gameView.height * superSize;

                    var scaledRT = RenderTexture.GetTemporary(width, height, 0);
                    Graphics.Blit(gameView, scaledRT);

                    var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                    var prevRT = RenderTexture.active;
                    RenderTexture.active = scaledRT;
                    tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                    tex.Apply();
                    RenderTexture.active = prevRT;
                    RenderTexture.ReleaseTemporary(scaledRT);

                    var pngData = tex.EncodeToPNG();
                    UnityEngine.Object.DestroyImmediate(tex);
                    File.WriteAllBytes(outputPath, pngData);

                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "path", outputPath },
                        { "width", width },
                        { "height", height },
                        { "message", "Screenshot saved" }
                    };
                }

                // Fallback: async ScreenCapture (file won't exist immediately)
                ScreenCapture.CaptureScreenshot(outputPath, superSize);

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "path", outputPath },
                    { "superSize", superSize },
                    { "message", "WARNING: Game view texture unavailable, screenshot saved async (next frame)" }
                };
            });
        }

        private async Task<object> TakeAnnotatedScreenshot(Dictionary<string, object> parameters)
        {
            return await EditorWebSocketServer.RunOnMainThread(() =>
            {
                var outputPath = "screenshot_annotated.png";
                if (parameters.TryGetValue("output", out var outputObj) && outputObj is string op)
                {
                    outputPath = op;
                }

                if (!Path.IsPathRooted(outputPath))
                {
                    var projectPath = Path.GetDirectoryName(Application.dataPath);
                    outputPath = Path.Combine(projectPath, outputPath);
                }

                var dir = Path.GetDirectoryName(outputPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                // Capture Game view via RenderTexture for synchronous access
                var gameView = GetGameViewRenderTexture();
                if (gameView == null)
                {
                    // Fallback: use ScreenCapture + collect element data without annotation
                    ScreenCapture.CaptureScreenshot(outputPath, 1);
                    var elements = CollectUIElements();
                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "path", outputPath },
                        { "annotated", false },
                        { "message", "Screenshot captured (annotation requires active Game view)" },
                        { "elements", elements.ToArray() }
                    };
                }

                // Read pixels from game view RenderTexture
                int width = gameView.width;
                int height = gameView.height;

                var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                var prevRT = RenderTexture.active;
                RenderTexture.active = gameView;
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();
                RenderTexture.active = prevRT;

                // Collect UI elements and draw labels
                var uiElements = CollectUIElements();
                DrawAnnotationLabels(tex, uiElements, height);

                // Save
                var pngData = tex.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(tex);
                File.WriteAllBytes(outputPath, pngData);

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "path", outputPath },
                    { "annotated", true },
                    { "width", width },
                    { "height", height },
                    { "elements", uiElements.ToArray() }
                };
            });
        }

        private static RenderTexture GetGameViewRenderTexture()
        {
            // Try to get the Game view's render texture
            try
            {
                var gameViewType = typeof(EditorWindow).Assembly.GetType("UnityEditor.GameView");
                if (gameViewType == null) return null;

                var gameView = EditorWindow.GetWindow(gameViewType, false, null, false);
                if (gameView == null) return null;

                // Use reflection to access the render texture
                var targetTexProp = gameViewType.GetProperty("targetTexture",
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                if (targetTexProp != null)
                {
                    return targetTexProp.GetValue(gameView) as RenderTexture;
                }

                // Alternative: get via renderTexture field
                var renderTexField = gameViewType.GetField("m_RenderTexture",
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                return renderTexField?.GetValue(gameView) as RenderTexture;
            }
            catch
            {
                return null;
            }
        }

        private static List<Dictionary<string, object>> CollectUIElements()
        {
            var elements = new List<Dictionary<string, object>>();

            // First ensure we have a UI snapshot
            RefManager.ClearUI();

            try
            {
                var uguiElements = UIWalker.WalkUGUI();
                foreach (var elem in uguiElements)
                {
                    elements.Add(BuildElementEntry(elem));
                }
            }
            catch { }

            var uitkElements = UIWalker.WalkUIToolkit();
            foreach (var elem in uitkElements)
            {
                elements.Add(BuildElementEntry(elem));
            }

            return elements;
        }

        private static Dictionary<string, object> BuildElementEntry(UIElementInfo elem)
        {
            var entry = new Dictionary<string, object>
            {
                { "ref", elem.Ref },
                { "type", elem.Type },
                { "name", elem.Name }
            };

            if (!string.IsNullOrEmpty(elem.Label))
                entry["label"] = elem.Label;

            if (elem.ScreenRect.width > 0 || elem.ScreenRect.height > 0)
            {
                entry["rect"] = new Dictionary<string, object>
                {
                    { "x", Mathf.RoundToInt(elem.ScreenRect.x) },
                    { "y", Mathf.RoundToInt(elem.ScreenRect.y) },
                    { "w", Mathf.RoundToInt(elem.ScreenRect.width) },
                    { "h", Mathf.RoundToInt(elem.ScreenRect.height) }
                };
            }

            return entry;
        }

        private static void DrawAnnotationLabels(Texture2D tex, List<Dictionary<string, object>> elements, int texHeight)
        {
            // Draw numbered labels on each element position
            // Uses simple pixel-art digits rendered directly onto the texture

            for (int i = 0; i < elements.Count; i++)
            {
                if (!elements[i].TryGetValue("rect", out var rectObj)) continue;
                var rect = rectObj as Dictionary<string, object>;
                if (rect == null) continue;

                int x = Convert.ToInt32(rect["x"]);
                int y = Convert.ToInt32(rect["y"]);
                int w = Convert.ToInt32(rect["w"]);
                int h = Convert.ToInt32(rect["h"]);

                // Position label at top-left of element bounds
                // Flip Y (texture Y=0 is bottom, screen Y=0 is top)
                int labelX = x;
                int labelY = texHeight - y - h;

                string number = (i + 1).ToString();
                DrawNumberLabel(tex, labelX, labelY, number);
            }
        }

        private static void DrawNumberLabel(Texture2D tex, int x, int y, string number)
        {
            int charWidth = 5;
            int charHeight = 7;
            int padding = 2;
            int totalWidth = number.Length * (charWidth + 1) + padding * 2;
            int totalHeight = charHeight + padding * 2;

            // Draw background rectangle (red)
            var bgColor = new Color(0.9f, 0.1f, 0.1f, 0.85f);
            var textColor = Color.white;

            for (int dy = 0; dy < totalHeight; dy++)
            {
                for (int dx = 0; dx < totalWidth; dx++)
                {
                    int px = x + dx;
                    int py = y + dy;
                    if (px >= 0 && px < tex.width && py >= 0 && py < tex.height)
                    {
                        tex.SetPixel(px, py, bgColor);
                    }
                }
            }

            // Draw each digit character
            for (int c = 0; c < number.Length; c++)
            {
                int digit = number[c] - '0';
                if (digit < 0 || digit > 9) continue;

                var pattern = GetDigitPattern(digit);
                for (int row = 0; row < charHeight; row++)
                {
                    for (int col = 0; col < charWidth; col++)
                    {
                        if (pattern[row * charWidth + col])
                        {
                            int px = x + padding + c * (charWidth + 1) + col;
                            int py = y + padding + (charHeight - 1 - row);
                            if (px >= 0 && px < tex.width && py >= 0 && py < tex.height)
                            {
                                tex.SetPixel(px, py, textColor);
                            }
                        }
                    }
                }
            }
        }

        private static bool[] GetDigitPattern(int digit)
        {
            // 5x7 pixel-art digit patterns
            bool[][] patterns = new bool[][]
            {
                // 0
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, true,
                    true, false, false, true, true,
                    true, false, true, false, true,
                    true, true, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false
                },
                // 1
                new bool[] {
                    false, false, true, false, false,
                    false, true, true, false, false,
                    false, false, true, false, false,
                    false, false, true, false, false,
                    false, false, true, false, false,
                    false, false, true, false, false,
                    false, true, true, true, false
                },
                // 2
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, true,
                    false, false, false, false, true,
                    false, false, false, true, false,
                    false, false, true, false, false,
                    false, true, false, false, false,
                    true, true, true, true, true
                },
                // 3
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, true,
                    false, false, false, false, true,
                    false, false, true, true, false,
                    false, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false
                },
                // 4
                new bool[] {
                    false, false, false, true, false,
                    false, false, true, true, false,
                    false, true, false, true, false,
                    true, false, false, true, false,
                    true, true, true, true, true,
                    false, false, false, true, false,
                    false, false, false, true, false
                },
                // 5
                new bool[] {
                    true, true, true, true, true,
                    true, false, false, false, false,
                    true, true, true, true, false,
                    false, false, false, false, true,
                    false, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false
                },
                // 6
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, false,
                    true, false, false, false, false,
                    true, true, true, true, false,
                    true, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false
                },
                // 7
                new bool[] {
                    true, true, true, true, true,
                    false, false, false, false, true,
                    false, false, false, true, false,
                    false, false, true, false, false,
                    false, false, true, false, false,
                    false, false, true, false, false,
                    false, false, true, false, false
                },
                // 8
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false,
                    true, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, false
                },
                // 9
                new bool[] {
                    false, true, true, true, false,
                    true, false, false, false, true,
                    true, false, false, false, true,
                    false, true, true, true, true,
                    false, false, false, false, true,
                    false, false, false, false, true,
                    false, true, true, true, false
                }
            };

            return digit >= 0 && digit <= 9 ? patterns[digit] : patterns[0];
        }
    }
}
