# Claude/Codex Normalized SDK Implementation Record

This document is a sealed implementation checkpoint for the normalized `claudex`
SDK layer. It no longer serves as an active execution plan.

As of March 15, 2026, the provider-agnostic core, concrete Claude and Codex
adapters, passive ingest module, and `ClaudexAdapter` default resolver have all
landed on `main`.

## Status Snapshot

- Core normalized SDK: shipped
- `ClaudeAdapter`: shipped
- `CodexAdapter`: shipped
- Shared contract harness and CLI smoke coverage: shipped
- Passive `claudex/ingest` module: shipped
- `ClaudexAdapter` default resolver: shipped
- Active `claudex` backlog for this layer: none

The remaining downstream work related to this surface lives outside this repo in
consumer and integration projects. The abandoned Phase 6 review-orchestration
milestone was canceled and should not be treated as pending scope for this
checkpoint.

## Delivered Scope

### Included in the shipped layer

- CLI-authenticated local execution only
- Stable Codex TypeScript SDK thread API
- Stable Claude Agent SDK `query()` API
- A capability-first abstraction for orchestration and console use cases
- A provider-agnostic default bootstrap path via `ClaudexAdapter`
- A separate passive `claudex/ingest` surface for replaying local provider
  artifacts

### Intentionally out of scope for v1

- API key or env-based auth normalization
- Full normalization of hooks, plugins, dynamic MCP server management, custom
  subagents, or file checkpoint rewind
- Reliance on Claude `unstable_v2_*` APIs
- Pretending provider-specific features are safely portable when they are not

## Delivered Public Contract

The shipped library exports a small stable core:

- `ProviderId = "claude" | "codex"`
- `ProviderCapabilities`
- `ProviderReadiness`
- `AgentProviderAdapter`
- `AgentSession`
- `SessionOptions`
- `TurnInput`
- `TurnOptions`
- `AgentEvent`
- `TurnResult`
- `AgentError`

The delivered provider-agnostic entry points are:

- `ClaudeAdapter`
- `CodexAdapter`
- `ClaudexAdapter`

Behavioral guarantees for the common path:

- `checkReadiness()` verifies CLI presence, CLI-auth readiness, and capability
  metadata.
- `createSession()` and `resumeSession()` return an `AgentSession`.
- `run()` returns a terminal `TurnResult`.
- `runStreamed()` yields canonical `AgentEvent` values and normally finishes
  with a terminal event. That is the common contract shape, not a hard
  duplicate-suppression guarantee against misbehaving provider streams.
- Every normalized event, result, and error preserves the originating provider
  payload in `raw`. Some event shapes also carry provider-specific data in
  `extensions`, but `extensions` is not a universal result/error guarantee.
- `ClaudexAdapter` resolves a default provider in configured order, pins to the
  resolved provider for its lifetime, and keeps actual provider identity as
  `claude` or `codex`.

Canonical event categories in the shipped surface:

- `session.started`
- `turn.started`
- `message.delta`
- `message.completed`
- `reasoning.summary`
- `tool.started`
- `tool.updated`
- `tool.completed`
- `file.changed`
- `todo.updated`
- `approval.requested`
- `approval.resolved`
- `status`
- `auth.status`
- `turn.completed`
- `turn.failed`

## Known Boundaries and Non-Parity

The core is intentionally capability-gated rather than parity-forcing.

### Session lifecycle mismatch

Codex exposes explicit threads. Claude stable exposes per-turn `query()` calls
with resumable sessions. The shipped Claude adapter synthesizes an
`AgentSession` abstraction and manages continuity internally.

### Approval and sandbox mismatch

Codex exposes approval policy and coarse sandbox modes. Claude exposes
permission modes, permission callbacks, and separate sandbox configuration. The
shipped common path normalizes only high-level intent such as:

- `executionMode: "plan" | "act"`
- interactive vs deny-by-default escalation
- coarse sandbox profiles such as read-only, workspace-write, and full-access

Exact provider approval knobs remain in provider extensions.

### Tooling and MCP mismatch

Claude can define MCP servers, hooks, agents, plugins, and file checkpointing
directly. Codex primarily exposes tool and MCP activity as events plus config
passthrough. These stay outside the normalized core and are exposed through
capability flags and provider extensions.

### Streaming mismatch

Claude emits richer partial assistant and status activity than Codex. The common
path treats `message.delta` and richer status events as optional capabilities,
not guarantees.

### Usage and telemetry mismatch

Claude returns cost, model usage, and permission denials. Codex returns token
usage only. The normalized usage shape keeps required token counts and leaves
richer telemetry optional.

### Attachment parity

Codex has explicit local image input support. Claude stable can accept richer
message payloads, but attachment handling is less explicit at the top-level API.
Attachment support remains capability-gated rather than universally normalized.

### Runtime compatibility

Codex documents Node 18+, while this repo is Bun-first. The shipped Bun-hosted
implementation has not required an internal Node sidecar.

## Closure Against Original Success Criteria

1. A consumer can swap providers on the shared path without changing the call
   site for readiness, session lifecycle, buffered turns, or streamed turns.
   Status: complete.
2. Shared contract tests pass for both adapters against the normalized contract.
   Status: complete.
3. Structured output accepts one JSON Schema shape across both providers and
   returns parsed output or a typed normalization error. Status: complete.
4. CLI readiness reports `ready`, `missing_cli`, and `needs_auth` without
   crashing the host. Status: complete.
5. Opt-in smoke coverage exists for authenticated local CLIs on both providers.
   Status: complete.
6. The repo contains a capability matrix marking normalized, capability-gated,
   and provider-specific features. Status: complete.
7. Bun-hosted execution works for both adapters without introducing a public API
   change. Status: complete.

## Completed Workstreams

### Phase 1. Core contract and readiness foundation

Completed and shipped.

### Phase 2. Codex adapter

Completed and shipped.

### Phase 2B. Claude adapter

Completed and shipped.

### Phase 3. Unified contract tests and live smoke harness

Completed and shipped.

### Phase 4. Capability matrix and consumer documentation

Completed and shipped.

### Phase 5. Passive ingest module

Completed and shipped as a separate public `claudex/ingest` surface.

### ClaudexAdapter default resolver

Completed and shipped after the original phase plan so consumers no longer need
to know the concrete provider at instantiation time.

## What Remains

There is no active backlog in the `claudex` project for this normalized SDK
layer or for `ClaudexAdapter`.

If future work reopens this layer, it should be framed as a new execution slice
with fresh tickets rather than as unfinished work from this document.
