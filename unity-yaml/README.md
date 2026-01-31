# unity-yaml

Fast, token-efficient Unity YAML parser for AI agents.

## Installation

```bash
npm install -g unity-yaml
```

Or install locally:

```bash
npm install unity-yaml
```

## Usage

### CLI

```bash
# Inspect entire file
unity-yaml inspect-all MyScene.unity

# Inspect specific GameObject by name
unity-yaml inspect MyScene.unity Player

# Inspect specific GameObject by file ID
unity-yaml inspect MyScene.unity 1847675923

# Include component properties
unity-yaml inspect MyScene.unity Player --properties

# List all GameObjects
unity-yaml list MyScene.unity

# Find GameObjects by name
unity-yaml find MyScene.unity Camera

# Find with exact match
unity-yaml find MyScene.unity "Main Camera" --exact

# Get details by ID
unity-yaml get MyScene.unity 1847675923 --component Transform
```

### API

```typescript
import { UnityScanner } from 'unity-yaml';

const scanner = new UnityScanner();

// List all GameObjects
const gameobjects = scanner.scan_scene_minimal('MyScene.unity');

// List with components
const withComponents = scanner.scan_scene_with_components('MyScene.unity');

// Find by name (fuzzy)
const found = scanner.find_by_name('MyScene.unity', 'Player', true);

// Find by name (exact)
const exactMatch = scanner.find_by_name('MyScene.unity', 'Main Camera', false);

// Inspect specific object
const player = scanner.inspect({
  file: 'MyScene.unity',
  identifier: 'Player',
  include_properties: false,
});

// Inspect entire file
const scene = scanner.inspect_all('MyScene.unity', false);
```

## Output Format

All CLI commands output JSON by default:

```json
{
  "file": "MyScene.unity",
  "count": 4,
  "gameobjects": [
    {
      "name": "Player",
      "file_id": "1847675923",
      "active": true,
      "tag": "Player",
      "layer": 0,
      "components": [
        {
          "type": "Transform",
          "class_id": 4,
          "file_id": "1847675924",
          "script_guid": "a1b2c3d4e5f6789012345678abcdef01",
          "script_name": "PlayerController",
          "properties": {
            "LocalPosition": "{x: 0, y: 0.5, z: 0}"
          }
        }
      ]
    }
  ]
}
```

## Features

- Fast, token-efficient parsing using regex
- No dependencies (zero runtime dependencies)
- Supports .unity and .prefab files
- Fuzzy name matching
- Component type detection with Unity class ID mapping
- MonoBehaviour script GUID extraction
- Complete scene inspection in single call

## Unity Class IDs Supported

| ID | Component |
|----|-----------|
| 1 | GameObject |
| 4 | Transform |
| 20 | Camera |
| 23 | MeshRenderer |
| 33 | MeshFilter |
| 54 | Rigidbody |
| 65 | BoxCollider |
| 81 | AudioListener |
| 82 | AudioSource |
| 108 | Light |
| 114 | MonoBehaviour |
| 224 | RectTransform |

## License

Apache-2.0
