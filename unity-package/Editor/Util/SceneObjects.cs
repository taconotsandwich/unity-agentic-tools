using System;
using UnityEngine;
using UnityScene = UnityEngine.SceneManagement.Scene;
using UnitySceneManager = UnityEngine.SceneManagement.SceneManager;

namespace UnityAgenticTools.Util
{
    /// <summary>
    /// The only place in this package that may call `new GameObject`.
    ///
    /// Constructing a GameObject is an implicit write to whatever scene the
    /// editor happens to have active, exactly as GetActiveScene() is an implicit
    /// read. Every caller here already knows which scene it means, so the move
    /// belongs in the same statement as the construction -- a bare `new
    /// GameObject` elsewhere reads as harmless and silently dirties the user's
    /// open scene. A grep cannot tell the two apart, so the rule is enforced by
    /// there being one function to grep for.
    /// </summary>
    internal static class SceneObjects
    {
        public static GameObject Create(string name, UnityScene target)
        {
            if (!target.IsValid())
            {
                throw new ArgumentException(
                    $"Cannot create \"{name}\": the target scene is not valid. "
                    + "Open the scene through AssetMutationContext or a preview scene first.");
            }

            var gameObject = new GameObject(name);
            UnitySceneManager.MoveGameObjectToScene(gameObject, target);
            return gameObject;
        }
    }
}
