using NUnit.Framework;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityAgenticTools.Refs;
using AgenticUI = UnityAgenticTools.Util.UI;

namespace UnityAgenticTools.Tests
{
    [TestFixture]
    public class UIInteractionTests
    {
        private GameObject _eventSystemObject;
        private GameObject _selectableObject;

        [SetUp]
        public void SetUp()
        {
            RefManager.ClearUI();
            _eventSystemObject = new GameObject("UIInteractionTests EventSystem", typeof(EventSystem));
        }

        [TearDown]
        public void TearDown()
        {
            if (_selectableObject != null)
            {
                Object.DestroyImmediate(_selectableObject);
            }

            if (_eventSystemObject != null)
            {
                Object.DestroyImmediate(_eventSystemObject);
            }

            RefManager.ClearUI();
        }

        [Test]
        public void ClickButton_InvokesOnClickExactlyOnce()
        {
            var button = CreateSelectable<Button>("Button");
            var invocationCount = 0;
            button.onClick.AddListener(() => invocationCount += 1);

            AgenticUI.Interact(Register(button), "click");

            Assert.That(invocationCount, Is.EqualTo(1));
        }

        [Test]
        public void ClickNonButton_UsesPointerClickHandler()
        {
            var toggle = CreateSelectable<Toggle>("Toggle");
            var valueChangedCount = 0;
            toggle.onValueChanged.AddListener(_ => valueChangedCount += 1);

            AgenticUI.Interact(Register(toggle), "click");

            Assert.That(toggle.isOn, Is.True);
            Assert.That(valueChangedCount, Is.EqualTo(1));
        }

        private T CreateSelectable<T>(string name) where T : Selectable
        {
            _selectableObject = new GameObject(name, typeof(RectTransform), typeof(T));
            return _selectableObject.GetComponent<T>();
        }

        private static string Register(Selectable selectable)
        {
#pragma warning disable CS0618
            return RefManager.RegisterUI(selectable.GetInstanceID());
#pragma warning restore CS0618
        }
    }
}
