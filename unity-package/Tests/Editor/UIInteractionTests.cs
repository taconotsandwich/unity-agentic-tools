using System.Collections.Generic;
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
        private GameObject _canvasObject;
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

            if (_canvasObject != null)
            {
                Object.DestroyImmediate(_canvasObject);
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

        [Test]
        public void Snapshot_ReplacesPreviousRefs()
        {
            _canvasObject = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            var button = CreateSelectable<Button>("Button");
            button.transform.SetParent(_canvasObject.transform, false);
            Register(button);

            AssertSnapshotStartsAtFirstRef(AgenticUI.Snapshot(0));
            AssertSnapshotStartsAtFirstRef(AgenticUI.Snapshot(0));
        }

        private T CreateSelectable<T>(string name) where T : Selectable
        {
            _selectableObject = new GameObject(name, typeof(RectTransform), typeof(T));
            return _selectableObject.GetComponent<T>();
        }

        private static string Register(Selectable selectable)
        {
            return RefManager.RegisterUI(UnityObjectCompat.GetObjectId(selectable));
        }

        private static void AssertSnapshotStartsAtFirstRef(object result)
        {
            var snapshot = result as Dictionary<string, object>;
            Assert.That(snapshot, Is.Not.Null);

            var elements = snapshot["elements"] as object[];
            Assert.That(elements, Is.Not.Null.And.Not.Empty);
            Assert.That(snapshot["refCount"], Is.EqualTo(elements.Length));

            var firstElement = elements[0] as Dictionary<string, object>;
            Assert.That(firstElement, Is.Not.Null);
            Assert.That(firstElement["ref"], Is.EqualTo("@u1"));
        }
    }
}
