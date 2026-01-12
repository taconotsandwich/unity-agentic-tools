export const UNITY_CLASS_IDS: Record<number, string> = {
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

export function get_class_id_name(class_id: number): string {
  return UNITY_CLASS_IDS[class_id] || `Unknown_${class_id}`;
}
