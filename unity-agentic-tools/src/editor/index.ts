// Create operations
export {
    createGameObject,
    createScene,
    createPrefabVariant,
    createScriptableObject,
    createMetaFile,
    addComponent,
    copyComponent,
} from './create';

// Update operations
export {
    safeUnityYAMLEdit,
    editProperty,
    editComponentByFileId,
    editPrefabOverride,
    editTransform,
    batchEditProperties,
    reparentGameObject,
    getGameObjectBlock,
    replaceGameObjectBlock,
    editArray,
    batchEditComponentProperties,
    removePrefabOverride,
    addRemovedComponent,
    removeRemovedComponent,
    addRemovedGameObject,
    removeRemovedGameObject,
} from './update';

// Delete operations
export {
    deleteGameObject,
    removeComponent,
    deletePrefabInstance,
} from './delete';

// Duplicate & unpack operations
export {
    duplicateGameObject,
    unpackPrefab,
} from './duplicate';

// Re-export shared helpers that are part of the public API
export { validateUnityYAML } from './shared';

// Document model
export { UnityBlock } from './unity-block';
export { UnityDocument } from './unity-document';
