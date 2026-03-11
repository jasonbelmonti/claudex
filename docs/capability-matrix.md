# Verified Capability Matrix

This matrix reflects the merged adapters plus the shared contract harness and Bun-hosted CLI smoke coverage on `main`.

Definitions:

- `Normalized`: same caller expectation across providers; do not branch by provider name.
- `Capability-gated`: shared shape exists, but callers must check `ProviderCapabilities` before relying on it.
- `Provider-specific`: keep it in `raw` payloads or provider `extensions`; it is outside the stable core.

| Feature | Contract level | Claude | Codex | What consumers should assume |
| --- | --- | --- | --- | --- |
| Session creation | Normalized | Yes | Yes | `createSession()` returns a session with `reference === null` until the provider turn mints a session id. |
| Session resume | Normalized | Yes | Yes | `resumeSession(reference)` preserves the provided session identity on later events and results. |
| Structured output | Normalized | Yes | Yes | Both adapters validate parsed JSON against the supplied schema and throw typed errors on invalid JSON or schema mismatch. |
| Completed assistant messages | Normalized | Yes | Yes | Successful streamed turns emit `message.completed` before the terminal event. |
| Tool lifecycle events | Normalized | Yes | Yes | Both adapters emit canonical `tool.started`, `tool.updated`, and `tool.completed` events. |
| Token usage | Normalized | Yes | Yes | Both adapters populate normalized token usage. |
| File change events | Capability-gated | Yes | Yes | Both can emit `file.changed`, but Claude and Codex differ in granularity and failure metadata. |
| Session fork | Capability-gated | Yes | No | Claude supports `session.fork()` and `resumeStrategy: "fork"`; Codex rejects fork semantics with `unsupported_feature`. |
| Streaming text deltas | Capability-gated | Yes | No | Claude emits `message.delta`; Codex emits coarser item/message completion events. |
| Auth status events | Capability-gated | Yes | No | Readiness is normalized for both; live `auth.status` events are only emitted by Claude. |
| Cost telemetry | Capability-gated | Yes | No | Claude exposes cost in normalized usage; Codex does not currently. |
| Image attachments | Capability-gated | No | Yes | Codex supports normalized local image paths only. Claude image attachment normalization is deliberately deferred. |
| Reasoning summaries | Capability-gated | No | Yes | The current Claude adapter does not emit a normalized reasoning-summary event. |
| Todo updates | Capability-gated | No | Yes | Only Codex currently emits normalized todo-list updates. |
| Approval request/resolution events | Capability-gated | No | No | Approval configuration is normalized, but neither adapter emits stable approval request/resolution events yet. |
| Managed MCP servers | Provider-specific | Yes | No | Claude SDK options can manage MCP/server concerns; Codex only surfaces MCP-related activity, not server management. |
| Hooks and plugins | Provider-specific | Yes | No | Claude-specific extension systems stay outside the stable core. |

## Verified Runtime Semantics

These behaviors are enforced by the shared contract harness:

1. Successful streamed turns emit exactly one terminal event, and it is the final event in the stream.
2. Successful streamed turns emit `turn.started`, preserve the normalized input, and emit `message.completed` before `turn.completed`.
3. Newly created sessions mint a resumable `SessionReference` that can actually be resumed in a later turn.
4. Plain resume does not emit `session.started`; forked resume does.
5. Failure paths preserve provider identity, raw provider payloads, and session references once the session has been minted.

## Known Non-Parity To Preserve

These are intentional differences, not bugs to paper over:

- Claude is query-backed and synthesizes session continuity internally; Codex is thread-backed.
- Codex plan mode is enforced through a safe thread profile; Claude maps plan mode through its own permission system.
- Claude supports session fork; Codex does not.
- Codex accepts normalized local image paths; Claude image attachment normalization remains off until it is verified end-to-end.
- Claude can expose auth and richer extension surfaces; Codex is narrower but emits stronger reasoning/todo coverage in the normalized stream.

## Consumer Rule Of Thumb

Use normalized fields first. Use `supportsCapability(...)` second. Use `raw` and provider `extensions` only when you are intentionally leaving the common path.
