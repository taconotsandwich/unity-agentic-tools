# Unity Agentic Tools Roadmap

This roadmap describes the current implementation, its remaining limits, and the order in which larger architecture changes should be evaluated. The root README is the source of truth for the public command surface and current runtime flow.

## Current State

The supported product is a compact command runner connected to an already-running Unity Editor:

- the public CLI surface is `list`, `run`, `stream`, `install`, `uninstall`, `cleanup`, and `status`
- `list` and `run` resolve built-in aliases, project `[AgenticCommand]` members, and explicitly opted-in raw public static members through the Unity-side command registry
- scene, prefab, asset, GameObject, component, UI, play mode, screenshot, test, and log operations execute inside Unity
- scene, prefab, GameObject, and component mutations use Unity serialization; file-backed asset helpers still run inside the Editor and refresh or import through `AssetDatabase`; the CLI does not expose the removed local YAML mutation surface
- command discovery uses `.unity-agentic/editor.json`, the persisted `.unity-agentic/editor.last.json` cache, and a project-matched scan of ports 53782-53791
- recognized built-in reads and Play mode transitions wait through a domain reload for up to 30 seconds while the Editor PID remains alive
- streams reconnect on the same bounded budget
- ordinary mutations are not replayed after errors that could mean Unity already started executing them
- raw public static invocation requires `--raw` through the supported CLI and produces a Unity console warning

The bridge remains in the Unity Editor process. A domain reload still creates a short interval in which no server exists; the client now treats that as a bounded lifecycle transition instead of immediate bridge loss.

## Evidence Baseline

The current reliability bar is measured with committed test harnesses rather than inferred from the transport design.

`bun run test:integration:stress -- --project <path> --cycles 5` repeatedly enters and exits Play mode while reading play state, hierarchy, UI snapshots, and assets. Its acceptance bar is `total_failures: 0` and `transient_reads: 0` across repeated cycles.

`bun run test:integration:unity-tests` exercises representative scene and prefab mutations through `Registry.Run`, forces Unity re-imports, and verifies that serialized values round-trip even when names contain YAML metacharacters and embedded newlines.

These harnesses define a regression method, not a permanent performance claim. Record the Unity version, project, revision, and options with measured results, and re-run after changing discovery, transport, retry, or main-thread dispatch behavior.

## Known Limits

### 1. Action semantics are split across layers

The Unity-side registry defines which commands exist, but retry and lifecycle behavior is still classified in the TypeScript client. Because every call uses the JSON-RPC method `editor.invoke`, the client must inspect the target inside `params` to decide whether the action is a recognized read, a Play mode transition, or the conservative default command class.

This works, but the command contract does not yet advertise enough metadata for clients to derive behavior directly.

### 2. One transport carries different interaction patterns

Unary requests and persistent event streams both use JSON-RPC over WebSocket. Screenshot commands return file paths, so large artifacts already avoid the control response, but control, stream, and artifact behavior are not modeled as explicit contracts.

### 3. The server shares Unity's scripting lifecycle

Client recovery covers normal compile and Play mode reloads, but it cannot eliminate the interval in which Unity tears down the in-process bridge. A permanently broken bridge in a still-running Editor can consume the full reload deadline before failing.

### 4. The bridge assumes a trusted local machine

The server binds to loopback. The supported CLI gates unregistered targets with `--raw`, but direct local JSON-RPC callers are not authenticated and can invoke the bridge reflection handler. The registry is a supported-client safety boundary, not a transport security boundary.

## Design Principles

1. **Keep the public CLI small.** Add Unity operations to the registry instead of creating new top-level command groups.
2. **Describe actions by semantics.** Read, mutation, transition, stream, and artifact behavior should not be inferred from transport names.
3. **Let Unity own scene and prefab serialization.** Do not restore a default raw YAML mutation path for scenes, prefabs, GameObjects, or components.
4. **Do not replay uncertain mutations.** A timeout or disconnect can mean the Unity main thread already began the work.
5. **Keep transport internal.** Users should not choose between WebSocket, HTTP, gRPC, or a sidecar per command.
6. **Measure before replacing working infrastructure.** A new transport is justified only by a demonstrated lifecycle, throughput, or integration requirement.

## Next Priorities

### Phase 1: Add semantic metadata to the command registry

Status: next

Extend command definitions with lifecycle metadata such as:

- `kind`: `read | mutation | transition | stream | artifact`
- `requires_main_thread`
- `allowed_mode`: `edit | play | both`
- `idempotent`
- `timeout_class`: `short | normal | long`
- `retry_profile`: `none | transition_tolerant | reconnect`
- `reload_behavior`: `safe_to_retry | result_unknown | resume_stream`
- `project_scoped`

Then derive TypeScript client behavior from the advertised definition instead of maintaining target-name lists in `editor-client.ts`.

Acceptance criteria:

- the Unity registry is the source of truth for lifecycle semantics
- built-in and project commands expose the same metadata shape
- mutation no-replay behavior remains the default
- existing command names and top-level CLI commands do not change

### Phase 2: Model control, stream, and artifact paths explicitly

Status: after Phase 1

Define three logical interaction paths while allowing them to share the current WebSocket implementation:

- **control** for unary queries, mutations, Play mode, and command discovery
- **stream** for console, Play mode, pause, and test notifications
- **artifact** for screenshots and future large or file-backed results

Acceptance criteria:

- stream reconnection rules do not leak into unary call behavior
- artifact commands return paths or handles instead of large control-channel payloads
- transport choices remain invisible at the CLI surface

### Phase 3: Evaluate a stable local sidecar

Status: optional, evidence required

A sidecar would own stable project/session identity outside Unity's scripting domain, accept bridge reconnections, and provide a persistent endpoint for the CLI. It should be introduced only if measured workflows still fail the current lifecycle bar or require subscriptions that must survive longer Unity outages.

Evaluation questions:

- Does the current 30-second recovery model fail real projects despite the passing stress baseline?
- Do clients need subscriptions or queued work to survive an Editor restart rather than a domain reload?
- Is the operational cost of another process lower than the remaining failure cost?
- Would authentication or multi-client coordination justify the sidecar independently?

If the answers do not justify another long-lived process, keep the in-process bridge.

### Phase 4: Change transport only behind the semantic contract

Status: optional after Phases 1-3

HTTP, gRPC, a local socket, or a split transport may be appropriate later. Do not migrate transport before action semantics and session ownership are explicit, and do not introduce localhost TLS without a concrete threat or deployment requirement.

## Completed Milestones

- bridge-first Unity mutation surface replaced the old local serialized-file mutation commands
- project-aware three-tier Editor discovery
- PID-gated, deadline-based reload recovery for recognized built-in reads and Play mode transitions
- persistent stream reconnection with surfaced terminal failures
- honest Play mode responses that distinguish requested state from live state
- status readiness reporting for compilation, import, reload, and Play mode transitions
- explicit `--raw` gate and Unity console audit warning for unregistered public static invocation
- safe-surface Unity re-import and serialization regression coverage

## Non-Goals

- restoring a second CLI surface that performs the same Unity operations through local file mutation
- adding one top-level CLI command per Unity API
- exposing transport selection to callers
- treating the supported CLI's `--raw` flag as authentication for direct bridge clients
- optimizing or replacing the bridge without measurements that identify a real bottleneck
