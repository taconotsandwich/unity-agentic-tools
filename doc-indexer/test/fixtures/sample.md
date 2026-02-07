# Unity MonoBehaviour Guide

## Introduction

MonoBehaviour is the base class from which every Unity script derives.
When you use C#, you must explicitly derive from MonoBehaviour to attach
a script to a GameObject. This is a fundamental concept in Unity development.

## Lifecycle Methods

Unity provides several lifecycle methods that are called automatically:

- `Awake()` is called when the script instance is being loaded
- `Start()` is called before the first frame update
- `Update()` is called once per frame
- `FixedUpdate()` is called at fixed time intervals

```csharp
public class PlayerController : MonoBehaviour
{
    public float speed = 5f;

    void Start()
    {
        Debug.Log("Player initialized");
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        transform.Translate(new Vector3(h, 0, v) * speed * Time.deltaTime);
    }
}
```

## Physics Integration

For physics-based movement, use Rigidbody components and FixedUpdate.
The physics engine runs at a fixed timestep independent of frame rate.

```csharp
void FixedUpdate()
{
    rb.AddForce(Vector3.forward * thrust);
}
```

## Best Practices

Always cache component references in Awake or Start rather than calling
GetComponent every frame. This avoids unnecessary overhead and improves
performance significantly in complex scenes with many GameObjects.
