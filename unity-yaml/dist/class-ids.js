"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNITY_CLASS_IDS = void 0;
exports.get_class_id_name = get_class_id_name;
exports.UNITY_CLASS_IDS = {
    1: "GameObject",
    4: "Transform",
    20: "Camera",
    23: "MeshRenderer",
    33: "MeshFilter",
    54: "Rigidbody",
    65: "BoxCollider",
    81: "AudioListener",
    82: "AudioSource",
    108: "Light",
    114: "MonoBehaviour",
    224: "RectTransform",
};
function get_class_id_name(class_id) {
    return exports.UNITY_CLASS_IDS[class_id] || `Unknown_${class_id}`;
}
//# sourceMappingURL=class-ids.js.map