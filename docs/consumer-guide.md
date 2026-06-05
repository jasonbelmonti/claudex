# Consumer Guide

This guide is for orchestration and agent-console consumers that want one live SDK surface over Claude, Codex, and Copilot without pretending the providers are identical. It also covers the passive `@jasonbelmonti/claudex/ingest` observation surface, which currently replays local Claude and Codex artifacts only.

## Runtime And Packaging Expectations

The current `main` branch tracks the Node-only major release line for
`@jasonbelmonti/claudex`.

- Use a standard Node runtime for supported execution and validation.
- Treat the package as ESM-only. Use `import` in ESM projects or dynamic
  `import()` from CommonJS.
- Repository CI verifies the currently supported Node release lines 20, 22, and
  24. Package metadata declares `engines.node >=20`, so consumers with an older
  floor pinned in internal tooling should read the migration guidance before
  upgrading.

If you are migrating from the Bun-first 1.x line, start with
[docs/node-only-migration.md](./node-only-migration.md).

## 1. Default To ClaudexAdapter

Use `ClaudexAdapter` when you want provider-agnostic startup and let it resolve
the first runnable provider in priority order:

```ts
import {
  ClaudexAdapter,
  supportsCapability,
} from "@jasonbelmonti/claudex";

const adapter = new ClaudexAdapter();
```

`ClaudexAdapter` defaults to `["codex", "claude"]`, exposes
`provider === null` and `capabilities === null` before resolution, and pins to
the selected provider after `checkReadiness()`, `createSession()`, or
`resumeSession()`.

Use `preferredProviders` when you already know the order you want. Copilot is
runtime-backed but intentionally non-default because the upstream SDK is still
beta/provider-preview:

```ts
const adapter = new ClaudexAdapter({
  preferredProviders: ["copilot", "codex", "claude"],
});
```

Use the `providers` option when you need explicit adapter injection or test
doubles. Provider-specific options can be passed through the opaque `claude`,
`codex`, and `copilot` option keys without importing provider SDK types from the
root package entrypoint.

All runtime-backed adapters assume CLI-authenticated local environments. API-key
and env-based auth are intentionally out of scope.

## 2. Treat Readiness As A First-Class Gate

Always call `checkReadiness()` before starting work.

```ts
const readiness = await adapter.checkReadiness();

switch (readiness.status) {
  case "ready":
  case "degraded":
    break;
  case "missing_cli":
  case "needs_auth":
  case "error":
    throw new Error(`Cannot run ${readiness.provider}: ${readiness.status}`);
}
```

Practical guidance:

- `ready`: normal execution path
- `degraded`: runnable, but some probe was inconclusive; surface the checks in your console
- `missing_cli`: do not attempt a turn
- `needs_auth`: prompt the user to authenticate in the provider CLI
- `error`: surface diagnostics and stop

Important note:

- `isProviderReady(readiness)` is a strict helper and returns `true` only for `ready`
- if your console wants to allow `degraded` execution, branch on `readiness.status` directly as shown above

## 3. Prefer Capabilities Over Provider Name

When behavior is optional, branch on capabilities instead of hard-coding
`if (provider === "...")`.

If you are using `ClaudexAdapter`, prefer `session.capabilities` or resolved
adapter metadata after readiness/session creation rather than assuming
capabilities exist before resolution.

```ts
if (supportsCapability(session.capabilities, "session:fork") && session.fork) {
  const forked = await session.fork();
  // ...
}
```

High-value capability checks in the current surface:

- `session:fork`
- `attachment:image`
- `stream:message-delta`
- `event:reasoning-summary`
- `event:file-change`
- `event:todo-update`
- `event:approval`
- `event:auth-status`
- `mcp:session-descriptors`
- `usage:cost`

## 4. Session Lifecycle Rules

The contract intentionally separates session creation from session identity minting.

- `createSession()` returns a session immediately.
- A new session may have `reference === null` until the first provider turn starts or completes.
- After a successful first turn, the session must hold a resumable `SessionReference`.
- `resumeSession(reference)` continues the existing session.
- `resumeSession(reference, { resumeStrategy: "fork" })` is capability-gated and currently only supported by Claude.

Important orchestration implication:

- Persist the minted `SessionReference` from the session object or terminal result after the first turn, not before it.
- `ClaudexAdapter.resumeSession(reference)` pins directly to `reference.provider`
  when the adapter has not resolved yet.
- once `ClaudexAdapter` is pinned, it does not silently fail over to another provider

## 5. Streaming Contract

For consumers rendering live agent output, these invariants are the useful part:

- `runStreamed()` ends with exactly one terminal event: `turn.completed` or `turn.failed`
- the terminal event is the last event in the stream
- successful streamed turns emit `turn.started`
- successful streamed turns emit `message.completed` before `turn.completed`
- `turn.started.input` preserves the normalized turn input
- provider identity is preserved on every event, result, and error

Capability-gated stream behavior:

- Claude emits `message.delta`
- Copilot emits `message.delta` when SDK streaming is enabled
- Codex does not guarantee `message.delta`, but does emit completed assistant messages and other lifecycle events
- plain resume should not emit `session.started`
- forked resume should emit `session.started`

## 6. Structured Output Semantics

Use `TurnOptions.outputSchema` when you want provider-agnostic structured output.

```ts
const result = await session.run(
  {
    prompt: 'Return {"status":"ok"} and nothing else.',
  },
  {
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
      },
      required: ["status"],
      additionalProperties: false,
    },
  },
);
```

What the contract guarantees:

- runtime-backed providers parse the returned JSON
- runtime-backed providers validate it against the supplied schema
- invalid JSON or schema mismatch becomes a typed `AgentError`
- Claude may synthesize `result.text` from structured output if the SDK omits terminal text

## 7. Attachments, Approvals, And Extensions

This is where false parity gets expensive, so be explicit:

- Image attachments: only Codex currently supports normalized image attachments, and only local file paths
- Approval configuration is normalized at the session-option level; Copilot also normalizes permission request/completion events as approval request/resolution events
- Session-level MCP descriptors are normalized through `SessionOptions.agentConfig.mcpServers` for Claude and Copilot
- Codex MCP configuration remains available through `ClaudexAdapter({ codex: { sdkOptions: { config } } })`, which maps to Codex TOML-style config
- Copilot adapter/runtime options remain available through the top-level `copilot` adapter option; per-session Copilot `sessionConfig` belongs under `providerOptions.copilot.sessionConfig` on `createSession()` or `resumeSession()` options
- Skills, MCP management, hooks, plugins, and other provider-native extension systems remain outside the stable core

If you need those advanced surfaces:

- use `capabilities` to detect whether the provider can do the thing at all
- use `raw` payloads and provider `extensions` when you intentionally step outside the common contract

```ts
const session = await adapter.createSession({
  agentConfig: {
    mcpServers: {
      local: {
        transport: "stdio",
        command: "node",
        args: ["./mcp-server.js"],
      },
      remote: {
        transport: "http",
        url: "https://mcp.example.com",
      },
    },
  },
});
```

## 8. Passive Ingest Is Observation, Not Control

`@jasonbelmonti/claudex/ingest` is the read-only companion surface for replaying local Claude and Codex artifacts after the fact. It emits `ObservedIngestRecord` envelopes and does not create sessions, resume sessions, send turns, or represent authoritative live control state. Copilot live SDK support does not imply Copilot passive-ingest support.

```ts
import {
  createClaudeIngestRegistries,
  createCodexIngestRegistries,
  createSessionIngestService,
} from "@jasonbelmonti/claudex/ingest";

const service = createSessionIngestService({
  roots: [
    {
      provider: "claude",
      path: "/Users/me/.claude",
      recursive: true,
      watch: true,
    },
    {
      provider: "codex",
      path: "/Users/me/.codex",
      recursive: true,
      watch: true,
    },
  ],
  registries: [
    ...createClaudeIngestRegistries(),
    ...createCodexIngestRegistries(),
  ],
  onObservedEvent(record) {
    console.log(record.source.kind, record.event.type, record.completeness);
  },
  onObservedSession(record) {
    console.log(record.reason, record.observedSession.state);
  },
});

await service.scanNow();
```

`service.start()` uses the same root coverage for startup: it performs an initial scan across all active roots, then creates watch processing only for roots configured with `watch: true`.

Treat ingest output as best-effort observation:

- `completeness` may be `partial` or `best-effort` when files are malformed, truncated, or only partially observable
- `observedSession.state` may be `provisional` until a richer artifact refines it to a canonical session identity
- `source.discoveryPhase` tells you whether the record came from an initial scan, a watch tick, or a reconcile pass
- warnings are part of the contract; parse failures, duplicate roots, and cursor resets are surfaced instead of hidden

## 9. Supported Passive Sources

Supported by the current ingest contract:

- Claude transcript `.jsonl`
- Claude snapshot/task `.json`
- Codex transcript `.jsonl`
- Codex session-index `.jsonl`

Outside the current ingest contract:

- other provider-native logs, temp files, or extension metadata
- Copilot local artifacts
- live approval responses, hooks, plugins, MCP state, or provider control channels
- authoritative live session status

## 10. Choose Live SDK vs Passive Ingest

Use the live SDK when:

- you are starting or resuming a session
- you need authoritative `turn.completed` or `turn.failed` semantics
- you need interactive capabilities such as fork, attachments, or other session control actions

Use passive ingest when:

- you are backfilling or tailing local history from disk
- you are building read-only observability, analytics, or transcript views
- you are recovering context after the fact from provider-owned artifacts

Practical rule:

- if your code needs to change provider state, use the live SDK
- if your code only needs to observe local artifacts, use `@jasonbelmonti/claudex/ingest`

## 11. Suggested Console UX

For an orchestration console, the pragmatic rendering model is:

1. Store normalized events/results/errors as the canonical transcript.
2. Persist `SessionReference` after the first terminal success.
3. Render provider-specific detail from `raw` only as drill-down diagnostics.
4. Gate UI affordances such as fork, image upload, cost display, or auth-status panes on capabilities.

That keeps the primary experience provider-agnostic while still leaving an escape hatch for the weird stuff. Every agent system eventually grows weird stuff; the trick is keeping it in the weeds.
