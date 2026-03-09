# Claude/Codex Normalized SDK Plan

## Summary

Build a Bun-hosted TypeScript library that presents one provider-agnostic API over the CLI-authenticated Claude and Codex SDKs. The normalized surface should cover sessions, turns, streaming events, structured output, attachments, usage, and explicit resume/fork semantics while preserving provider-specific escape hatches.

## Scope

### In scope

- CLI-authenticated local execution only
- Stable Codex TypeScript SDK thread API
- Stable Claude Agent SDK `query()` API
- A capability-first abstraction for orchestration and console use cases

### Out of scope for v1

- API key or env-based auth normalization
- Full normalization of hooks, plugins, dynamic MCP server management, custom subagents, or file checkpoint rewind
- Reliance on Claude `unstable_v2_*` APIs

## Public Contract

The library should export a small, stable core:

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

Behavioral expectations:

- `checkReadiness()` verifies CLI presence, CLI-auth readiness, and adapter capability metadata.
- `createSession()` and `resumeSession()` return an `AgentSession`. New sessions may not have a provider session ID until the first provider turn starts or completes.
- `run()` returns a terminal `TurnResult`.
- `runStreamed()` yields canonical `AgentEvent` objects and finishes with `turn.completed` or `turn.failed`.
- Every normalized event/result includes the original provider payload in `raw` plus an `extensions` bag for provider-only data.

Canonical event categories:

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

## Normalization Gaps and Design Constraints

### Session lifecycle mismatch

Codex exposes explicit threads. Claude stable exposes per-turn `query()` calls with resumable sessions. The Claude adapter will need to synthesize an `AgentSession` abstraction and manage session IDs internally after the first streamed response.

### Approval and sandbox mismatch

Codex exposes approval policy and coarse sandbox modes. Claude exposes permission modes, permission callbacks, and separate sandbox configuration. V1 should normalize only high-level intent such as:

- `executionMode: "plan" | "act"`
- interactive vs deny-by-default escalation
- coarse sandbox profiles such as read-only, workspace-write, and full-access

Exact provider approval knobs must remain in adapter extensions.

### Tooling and MCP mismatch

Claude can define MCP servers, hooks, agents, plugins, and file checkpointing directly. Codex TypeScript surfaces tool and MCP activity primarily as events plus config passthrough. These features should stay outside the normalized core and be exposed via capability flags and provider extensions.

### Streaming mismatch

Claude emits partial assistant events, auth status, hook events, task progress, prompt suggestions, and rate-limit events. Codex emits a smaller item lifecycle stream. The core must treat `message.delta` and rich status events as optional capabilities, not guarantees.

### Usage and telemetry mismatch

Claude returns cost, model usage, and permission denials. Codex returns token usage only. The normalized usage shape must keep token counts required and richer telemetry optional.

### Attachment parity risk

Codex has explicit local image input support. Claude stable can accept richer message payloads, but attachment handling is less explicit at the top-level API. Attachment support must be capability-gated and verified in smoke tests before it is advertised as normalized behavior.

### Runtime risk

Codex documents Node 18+ while this repo is Bun-first. The public API should remain Bun-hosted, but the implementation should preserve the option of an internal Node sidecar for the Codex adapter if Bun compatibility proves unreliable.

## Materially Verifiable Success Criteria

1. A consumer can swap `provider: "claude"` and `provider: "codex"` without changing the call site for `checkReadiness()`, `createSession()`, `resumeSession()`, `run()`, or `runStreamed()`.
2. Shared contract tests pass for both adapters against the same normalized fixtures for a simple turn, a structured-output turn, a resumed turn, and an error turn.
3. Given the same JSON schema fixture, both adapters return a parsed `structuredOutput` object or a typed normalization error rather than an untyped string failure.
4. CLI readiness checks report `ready`, `missing_cli`, and `needs_auth` states without crashing the host process.
5. Opt-in smoke tests pass against authenticated local CLIs for one new session, one resumed session, and one structured-output turn on both providers.
6. The repo contains a capability matrix that marks every provider feature as normalized, capability-gated, or provider-specific.
7. Bun-hosted execution works for both adapters, or the Codex adapter ships with a documented and tested internal Node fallback without changing the public contract.

## Workstreams, Dependencies, and Sequencing

### 1. Core contract and readiness foundation

Deliver the provider-agnostic type system, session contract, canonical event schema, readiness checks, and capability model.

Depends on: nothing

### 2. Codex adapter

Wrap the stable Codex thread API, map thread events into the canonical event schema, and normalize structured output, attachments, usage, and resume behavior.

Depends on: core contract and readiness foundation

### 3. Claude adapter

Wrap stable Claude `query()` calls, synthesize session continuity, and normalize streaming messages, permissions, structured output, and resume/fork behavior.

Depends on: core contract and readiness foundation

### 4. Unified contract tests and live smoke harness

Add deterministic contract tests plus opt-in CLI smoke tests for both providers under a Bun-hosted runner.

Depends on: Codex adapter and Claude adapter

### 5. Capability matrix and consumer documentation

Publish the supported surface area, provider-specific escape hatches, known gaps, and minimal usage examples.

Depends on: unified contract tests and live smoke harness

## Initial Backlog Slices

- Define the normalized core contracts, capability matrix shape, and readiness model.
- Implement the Codex adapter on the stable thread API.
- Implement the Claude adapter on stable `query()` with explicit resume/fork handling.
- Add contract tests and opt-in smoke tests for both providers.
- Document normalized behavior, unsupported features, and provider escape hatches.
