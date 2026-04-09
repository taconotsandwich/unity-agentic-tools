# Unity Agentic Tools Roadmap

This document tracks the current editor-bridge problems, the intended connection architecture on the Unity Editor side, and the rollout plan to get there.

## Why This Exists

The current editor bridge works, but recent stress testing showed that it is still too dependent on Unity's in-process lifecycle.

What is already true:

- compile-triggered domain reload recovery is much better than before
- play enter/exit recovery is much better than before
- project-aware bridge discovery is in place
- read actions and command actions now have different retry behavior

What is not yet good enough:

- some short read operations like `editor play-state` can still miss the bridge during the first part of a play-mode transition
- discovery is still too tied to Unity-owned process state
- transport concerns and action semantics are still not cleanly separated

## Current Problems

These are based on actual debugging and live stress runs against a real Unity project.

### 1. In-process bridge lifetime is still the root fragility

The WebSocket server lives inside Unity editor scripting. During assembly reload and some play-mode transitions, the server disappears because the whole editor-domain lifecycle is being torn down and rebuilt.

Impact:

- even when recovery succeeds, there can still be a short unavailable window
- changing transport alone does not fix this if the server stays inside Unity

### 2. Discovery has been too dependent on `editor.json`

Historically, the CLI treated `.unity-agentic/editor.json` as the source of truth. If it disappeared during reload, the CLI often failed immediately.

Recent fixes improved this:

- project-aware port probing was added
- a last-known bridge cache was added
- reload transitions now preserve `editor.json` instead of deleting it

Remaining issue:

- a short live miss still happens in some play-entry probes even after these fixes

### 3. Process-local caching is not enough for a CLI

Each CLI call is a fresh process. That means in-memory recovery state is not sufficient by itself.

Impact:

- any recovery hint needed across invocations must be persisted on disk or owned by a long-lived sidecar

### 4. All editor actions were treated too similarly

`play-state` and `play` should not have the same retry model.

Read-like actions need to tolerate brief transition windows.
Command-like actions should fail faster to avoid accidental double-execution or confusing long waits.

Recent fixes improved this:

- transition-tolerant retry semantics were added for read actions
- shorter retry behavior remains for command actions

### 5. The current architecture still conflates contract and transport

The editor API surface is mostly method-name based. The CLI knows how to call methods, but the system does not yet treat actions as first-class semantic contracts with lifecycle rules.

Impact:

- retry decisions are harder than they should be
- future transport splits are harder than they should be
- stream vs unary vs artifact-returning behavior is not modeled centrally

### 6. The current blocker is a loaded-file blocker, not a mutation-safety blocker

The existing protection in `loaded-protection.ts` is useful, but it mostly answers one question:

- "is this `.unity` or `.prefab` currently loaded in the editor?"

That is not the same as answering the more important question:

- "is this mutation path safe enough to let a lower-level model perform it without producing invalid Unity YAML?"

Current gap:

- a low-level model can still choose a file-based mutation path that is syntactically or semantically risky
- `--bypass-loaded-protection` is a transport/lifecycle escape hatch, not a true write-safety model
- YAML-level writes are still too available relative to their risk profile

Impact:

- the tool can still be used in ways that produce invalid YAML
- current protection is stronger against editor state conflicts than against invalid serialization output

## Stress-Test Findings

The most relevant recent findings are:

- compile reload stress passed: repeated explicit `RequestScriptCompilation` cycles dropped and recovered the bridge successfully
- play enter/exit stress passed in the sense that the bridge always recovered
- transient read failures still exist during play entry

Latest observed residual issue after multiple fixes:

- a short `editor play-state` probe still produced `transient_reads=1` across `3` play cycles with `8` reads per cycle

Interpretation:

- the hard outage problem is much smaller than before
- the remaining bug is now a narrow transition-window problem, not a full bridge-loss problem

## Design Principles

### 1. Define actions by semantics, not by transport

The editor layer should define what an action is and what guarantees it needs.
The transport should be an implementation detail.

### 2. Split by interaction pattern

There are three main classes of editor actions:

- unary control/query
- streaming/subscription
- artifact or bulk output

### 3. Preserve CLI stability

The CLI surface should not expose transport choices like "use WebSocket for this command, use gRPC for that command".
Users should call editor actions the same way regardless of transport internals.

### 4. Prefer local loopback simplicity

For local editor automation, local HTTP/gRPC or a local socket is preferable to HTTPS.
TLS on localhost adds complexity without fixing the Unity lifecycle issue.

### 5. Block by mutation safety, not only by editor loaded-state

The tool should make the safe path the default path.

That means:

- prefer editor-side mutations whenever Unity serialization is available
- downgrade file-based YAML mutation to a controlled fallback
- make risky write paths explicit and harder to reach
- prevent lower-level models from selecting raw mutation paths by default

### 6. Capability should be tiered by trust level

Not every caller should get the same write surface.

Suggested trust model:

- high-level orchestrator: can choose between editor mutation and gated file mutation
- lower-level model: should get safe semantic actions, not raw YAML-shaping power
- human operator: can still use force/bypass options explicitly

## Target Editor-Side Connection Model

This is the intended more complete design.

### A. Semantic action registry

Every editor action should have metadata in the editor layer, not only a method string.

Suggested fields:

- `action_id`
- `kind`: `read | command | stream | artifact`
- `requires_main_thread`
- `allowed_mode`: `edit | play | both`
- `idempotent`
- `default_timeout_class`: `short | normal | long`
- `retry_profile`: `none | transition_tolerant | reconnect_required`
- `reload_behavior`: `safe_to_retry | must_fail_fast | resume_stream`
- `project_scoped`

Examples:

- `editor.playMode.getState`
  - `kind=read`
  - `allowed_mode=both`
  - `retry_profile=transition_tolerant`
- `editor.playMode.enter`
  - `kind=command`
  - `allowed_mode=edit`
  - `retry_profile=must_fail_fast`
- `editor.console.subscribe`
  - `kind=stream`
  - `allowed_mode=both`
  - `reload_behavior=resume_stream`
- `editor.screenshot.take`
  - `kind=artifact`
  - `allowed_mode=both`

### B. Three logical connection planes

These are logical planes. They may share one transport initially.

#### 1. Control plane

Use for unary requests:

- play mode
- queries
- invoke
- scene operations
- console snapshot
- screenshots request initiation

Good future transport:

- local unary RPC
- local HTTP/gRPC
- or current JSON-RPC over WebSocket until migration

#### 2. Stream plane

Use for subscriptions:

- console follow
- test progress
- future hierarchy watch
- future UI watch

Good future transport:

- WebSocket
- server stream
- sidecar-mediated stream

#### 3. Artifact plane

Use for large or file-backed outputs:

- screenshots
- exported snapshots
- large test reports

Rule:

- return file paths, references, or handles
- avoid pushing large blobs through the same channel as normal control traffic

### C. Discovery should become advisory, not critical

Current discovery artifacts:

- `.unity-agentic/editor.json`
- `.unity-agentic/editor.last.json`

These should remain useful, but they should not be the only way a fresh CLI process finds the right editor.

Longer-term target:

- stable project identity owned outside the Unity reload boundary
- editor-side reconnection should update the stable owner rather than re-establish the entire world from zero

## Target Mutation-Safety Blocker Model

This is the intended design for preventing invalid YAML from lower-level tool use.

### A. Classify mutation actions by serialization authority

Every mutation should declare where truth comes from.

#### 1. Editor-owned mutations

These should prefer Unity serialization whenever the editor is available.

Examples:

- scene GameObject/component/transform edits
- prefab instance/override edits
- ScriptableObject field edits
- imported asset metadata edits where Unity already has a canonical object model

Rule:

- if editor is connected, mutate through the editor
- do not default to file-based YAML editing for these

#### 2. File-owned structured mutations

These are file-based mutations where the tool has strong structural knowledge and can validate shape well.

Examples:

- some project settings files
- build settings scene list edits
- package manifest edits
- tightly-scoped asset file operations with a native parser-backed writer

Rule:

- allow file mutation only through structured operations, never arbitrary text shaping
- require post-write structural validation

#### 3. Unsafe or weakly-typed raw mutations

These are mutations where the model is effectively shaping YAML without enough semantic guarantees.

Examples:

- raw batch edits against unknown structures
- generic property writes on poorly typed YAML blocks
- commands that can alter serialized references without a strong schema

Rule:

- do not expose these as first-class low-level model tools
- require explicit force/unsafe mode or human/orchestrator approval

### B. Introduce blocker levels

The blocker should return a decision, not just "loaded or not loaded".

Suggested levels:

#### Level 0. Allow

The mutation is safe enough to run directly.

#### Level 1. Redirect

The mutation is valid in intent, but must run through the editor path instead of file YAML mutation.

Example:

- editor is connected
- target is a loaded scene or prefab
- semantic editor action exists

#### Level 2. Gate with validation

The mutation may run file-based, but only with validation gates.

Required steps:

- preflight type/shape validation
- write to temp or staged output
- native Unity-YAML structural validation
- if possible, Unity import validation before commit

#### Level 3. Refuse by default

The tool should refuse unless the caller explicitly opts into an unsafe path.

Examples:

- raw mutation of weakly-typed structures
- edits that can invalidate references without a full object model
- batch operations from low-level models without a semantic action wrapper

### C. Make editor-first mutation a first-class path

The current design still leans too hard on file editing.

Target behavior:

- if the editor is connected and a semantic editor mutation exists, use that path first
- file mutation becomes fallback, not primary path, for editor-owned assets

Benefits:

- Unity owns serialization correctness
- fewer invalid YAML outcomes
- less need for downstream repair or import validation

### D. Separate safe semantic tools from unsafe raw tools

A lower-level model should not choose from the full mutation surface.

Instead, expose:

- safe semantic actions
- typed parameters
- small, validated edit scopes

Keep hidden or restricted:

- generic raw property mutation on complex YAML
- unrestricted batch mutation
- force/bypass flags

### E. Add staged commit semantics for file mutations

For any remaining file-based mutation path, use a transaction-like flow.

Suggested flow:

1. Resolve mutation intent into a typed operation.
2. Run blocker classification.
3. If redirected, execute editor mutation.
4. If file-based, write staged output.
5. Run structural validation.
6. If editor/headless validation is available, import-validate.
7. Commit only after validation passes.

This turns validation into part of mutation, not an optional afterthought.

### F. Record mutation receipts

Each mutation should be able to produce a receipt describing:

- path used: `editor` or `file`
- blocker decision
- validations run
- whether Unity import validation was executed
- whether the action used an unsafe override

This makes it easier to debug model behavior and tool failures later.

## Recommended Architecture Evolution

### Phase 0. Harden the current in-process bridge

Status: in progress

Work:

- keep `editor.json` during reload/play transitions
- keep project-aware discovery
- keep persisted last-known bridge cache
- keep semantic retry differences for read vs command calls
- reduce remaining play-entry read misses

Success criteria:

- no lost bridge across repeated compile reloads
- no lost bridge across repeated play enter/exit cycles
- `editor play-state` should not miss during normal play transitions

### Phase 0.5. Replace the loaded-file blocker with a mutation-safety blocker

Status: not started

Work:

- classify mutation commands by serialization authority and risk
- introduce blocker decisions: allow, redirect, gate-with-validation, refuse
- make editor-first mutation the default for editor-owned assets
- reduce lower-level model access to raw YAML-shaping commands
- add staged validation to remaining file-based write paths

Success criteria:

- lower-level model flows cannot trivially produce invalid YAML through the default tool surface
- loaded-edit protection becomes one input into the blocker, not the blocker itself
- file-based mutation is no longer the default path for editor-owned assets when the editor is connected

### Phase 1. Introduce a real semantic action registry

Status: not started

Work:

- define action metadata in the editor package
- teach the CLI client to derive retry/timeout/stream behavior from action metadata
- stop scattering action behavior rules across ad hoc client code

Success criteria:

- retry behavior is data-driven
- stream/unary/artifact behavior is explicit
- `editor invoke` remains an escape hatch, not the primary contract

### Phase 2. Split logical planes while keeping current transport if needed

Status: not started

Work:

- define control, stream, and artifact pathways in the editor package
- allow the same underlying WebSocket transport temporarily
- separate handler responsibilities accordingly

Success criteria:

- streaming features do not share the same assumptions as unary queries
- artifact-producing actions avoid oversized RPC payloads

### Phase 3. Add a stable local sidecar

Status: recommended

This is the design change that actually addresses Unity lifecycle fragility.

Sidecar responsibilities:

- own stable project identity and editor session mapping
- expose control and stream endpoints to the CLI
- accept reconnects from the Unity package after reload
- keep subscriptions and session state alive across Unity-domain resets where possible

Unity package responsibilities:

- act as an adapter to Unity editor APIs
- reconnect to the sidecar after reload
- push events and answer calls while available

CLI responsibilities:

- talk to the sidecar first, not directly to Unity
- rely on action semantics, not transport details

Success criteria:

- CLI can survive Unity reloads without rediscovering everything from scratch
- project identity remains stable across reloads
- stream subscriptions can reconnect cleanly

### Phase 4. Migrate transports behind the semantic contract

Status: optional after sidecar

Potential outcome:

- control plane: local gRPC or HTTP RPC
- stream plane: WebSocket or gRPC streaming
- artifact plane: files on disk plus metadata returned over control plane

Important:

- do not introduce HTTPS on localhost unless there is a clear security or deployment requirement
- do not expose transport choice in the CLI interface

## What Not To Do

- Do not split CLI commands by "WebSocket commands" vs "gRPC commands".
- Do not treat transport change as the fix for Unity reload behavior by itself.
- Do not rely on a process-local cache as the main recovery mechanism for a short-lived CLI.
- Do not make `editor invoke` the primary path for all future features.

## Near-Term Tasks

These are the next concrete tasks worth doing.

1. Eliminate the remaining play-entry `play-state` transition miss.
2. Add automated regression coverage for transition-time read calls against the live bridge or a higher-fidelity harness.
3. Introduce a semantic action registry in the editor package.
4. Refactor the client so action behavior is derived from that registry.
5. Design the sidecar session model and project identity model.
6. Replace the current loaded-file blocker with a semantic mutation-safety blocker.
7. Define which mutation commands are editor-owned, file-owned, or unsafe.
8. Add staged validation/commit flow for remaining file-based writes.

## Acceptance Bar For "Bridge Is Stable"

The editor bridge should not be considered stable until all of the following are true:

- repeated compile reload cycles keep the bridge available
- repeated play enter/exit cycles keep the bridge available
- unary reads like `play-state`, `console-logs`, and `hierarchy-snapshot` do not transiently fail during normal transitions
- stream subscriptions reconnect without manual intervention
- discovery is no longer critically dependent on a single Unity-owned file
- lower-level model mutation flows cannot produce invalid YAML through the default safe tool surface
- force/unsafe mutation paths are explicit and auditable

## Current Recommendation

Short term:

- keep the current WebSocket bridge
- continue hardening the editor lifecycle behavior
- finish the semantic action model
- redesign the blocker around mutation safety instead of only loaded-file state

Long term:

- move to a sidecar-owned session model
- split control, stream, and artifact planes behind the semantic contract
- move editor-owned mutations to editor serialization first, with file YAML mutation as controlled fallback
- only change transport after the semantic contract and session model are clear
