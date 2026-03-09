# Initial Capability Matrix

This matrix defines the initial normalization policy for the shared contract. `Normalized` means callers should not branch by provider. `Capability-gated` means callers must inspect `ProviderCapabilities` before relying on the feature. `Provider-specific` means the feature belongs in `raw` payloads or provider `extensions`, not the stable core contract.

| Feature | Contract level | Claude | Codex | Notes |
| --- | --- | --- | --- | --- |
| Session creation | Normalized | Yes | Yes | Core entrypoint for both providers |
| Session resume | Normalized | Yes | Yes | Claude stable resumes by session id, Codex resumes by thread id |
| Session fork | Capability-gated | Yes | No | Codex stable thread API exposes start/resume, but not fork |
| Structured output | Normalized | Yes | Yes | Shared JSON schema input with normalized parsed output; Claude may synthesize `text` from structured output when the SDK omits terminal text |
| Image attachments | Capability-gated | No | Yes | Claude stable `query()` attachment normalization is deferred in v1 |
| Streaming text deltas | Capability-gated | Yes | Limited | Claude exposes partial message events; Codex stream is coarser |
| Reasoning summaries | Capability-gated | Limited | Yes | Provider semantics differ and must stay optional |
| Tool lifecycle events | Normalized | Yes | Yes | Canonical start/update/completed event family |
| File change events | Capability-gated | Limited | Yes | Availability and granularity differ |
| Todo updates | Capability-gated | Limited | Yes | Not guaranteed on all providers or models |
| Approval events | Capability-gated | No | No | Both adapters normalize approval configuration, but neither exposes approval request/resolution events in the stable core today |
| Auth status events | Capability-gated | Yes | No | Readiness is normalized; live auth stream is optional |
| Token usage | Normalized | Yes | Yes | Shared token usage shape |
| Cost telemetry | Capability-gated | Yes | Limited | Claude exposes cost directly; Codex may not |
| Managed MCP servers | Provider-specific | Yes | Limited | Keep out of the core contract |
| Hooks and plugins | Provider-specific | Yes | No | Escape hatch only |

## Normalization rules

1. Put a feature in the stable core only when both providers can support the same caller expectation without leaking provider-specific enums or control flow.
2. Mark a feature `Capability-gated` when the caller can still use a shared field or event shape, but must check availability first.
3. Mark a feature `Provider-specific` when the behavior is too asymmetric to standardize safely in v1.
4. Preserve original provider payloads in `raw` and any extra adapter metadata in `extensions` so advanced consumers can opt out of the common path.
