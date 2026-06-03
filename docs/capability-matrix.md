# Verified Capability Matrix

This matrix reflects the merged adapters plus the shared contract harness and Node-based verification coverage on `main`.

Definitions:

- `Normalized`: same caller expectation across providers; do not branch by provider name.
- `Capability-gated`: shared shape exists, but callers must check `ProviderCapabilities` before relying on it.
- `Provider-specific`: keep it in `raw` payloads or provider `extensions`; it is outside the stable core.

| Feature | Contract level | Claude | Codex | Copilot | What consumers should assume |
| --- | --- | --- | --- | --- | --- |
| Session creation | Normalized | Yes | Yes | Yes | `createSession()` returns a session with `reference === null` until the provider turn mints a session id. |
| Session resume | Normalized | Yes | Yes | Yes | `resumeSession(reference)` preserves the provided session identity on later events and results. |
| Structured output | Normalized | Yes | Yes | Yes | Runtime-backed adapters validate parsed JSON against the supplied schema and throw typed errors on invalid JSON or schema mismatch. |
| Completed assistant messages | Normalized | Yes | Yes | Yes | Successful streamed turns emit `message.completed` before the terminal event. |
| Tool lifecycle events | Normalized | Yes | Yes | Yes | Runtime-backed adapters emit canonical `tool.started`, `tool.updated`, and `tool.completed` events when provider tool activity is surfaced. |
| Token usage | Normalized | Yes | Yes | Yes | Runtime-backed adapters populate normalized token usage when the provider returns usage counters. |
| File change events | Capability-gated | Yes | Yes | No | Claude and Codex can emit `file.changed`, but they differ in granularity and failure metadata; Copilot file-change mapping is deferred. |
| Session fork | Capability-gated | Yes | No | No | Claude supports `session.fork()` and `resumeStrategy: "fork"`; Codex and Copilot reject fork semantics with `unsupported_feature`. |
| Streaming text deltas | Capability-gated | Yes | No | Yes | Claude and Copilot emit `message.delta`; Codex emits coarser item/message completion events. |
| Auth status events | Capability-gated | Yes | No | No | Readiness is normalized for all providers; live `auth.status` events are only emitted by Claude. |
| Cost telemetry | Capability-gated | Yes | No | No | Claude exposes cost in normalized usage; Codex and Copilot do not currently. |
| Image attachments | Capability-gated | No | Yes | No | Codex supports normalized local image paths only. Claude and Copilot image attachment normalization is deliberately deferred. |
| Reasoning summaries | Capability-gated | No | Yes | No | Only Codex currently emits normalized reasoning-summary events. |
| Todo updates | Capability-gated | No | Yes | No | Only Codex currently emits normalized todo-list updates. |
| Approval request/resolution events | Capability-gated | No | No | No | Approval configuration is normalized, but no runtime-backed adapter emits stable approval request/resolution events yet. |
| Session MCP descriptors | Capability-gated | Yes | No | Yes | `SessionOptions.agentConfig.mcpServers` maps to Claude and Copilot session config; Codex rejects it and callers should use `codex.sdkOptions.config` for TOML-style MCP config. |
| Managed MCP servers | Provider-specific | Yes | No | No | Claude SDK options can manage dynamic MCP/server concerns; Codex and Copilot only expose narrower MCP-related activity or config mapping. |
| Hooks and plugins | Provider-specific | Yes | No | No | Claude-specific extension systems stay outside the stable core. |

## Verified Runtime Semantics

These behaviors are enforced by the shared contract harness:

1. Successful streamed turns emit exactly one terminal event, and it is the final event in the stream.
2. Successful streamed turns emit `turn.started`, preserve the normalized input, and emit `message.completed` before `turn.completed`.
3. Newly created sessions mint a resumable `SessionReference` that can actually be resumed in a later turn.
4. Plain resume does not emit `session.started`; forked resume does.
5. Failure paths preserve provider identity, raw provider payloads, and session references once the session has been minted.

## Known Non-Parity To Preserve

These are intentional differences, not bugs to paper over:

- Claude is query-backed and synthesizes session continuity internally; Codex is thread-backed; Copilot is SDK-session-backed.
- Codex plan mode is enforced through a safe thread profile; Claude maps plan mode through its own permission system.
- Claude supports session fork; Codex and Copilot do not.
- Codex accepts normalized local image paths; Claude and Copilot image attachment normalization remains off until it is verified end-to-end.
- Claude can expose auth and richer extension surfaces; Codex is narrower but emits stronger reasoning/todo coverage in the normalized stream.
- Copilot is runtime-backed but remains opt-in because the upstream SDK is beta/provider-preview and several advanced event surfaces remain deferred.

## Consumer Rule Of Thumb

Use normalized fields first. Use `supportsCapability(...)` second. Use `raw` and provider `extensions` only when you are intentionally leaving the common path.
