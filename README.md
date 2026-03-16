# claudex

`claudex` is a Bun-hosted TypeScript library that exposes one normalized API over the CLI-authenticated Claude and Codex SDKs, plus a passive `claudex/ingest` surface for replaying local provider artifacts.

The goal is provider-agnostic orchestration, not fake parity. The stable contract covers readiness, session lifecycle, buffered and streamed turns, structured output, and normalized event/result/error shapes. Anything that does not normalize cleanly stays capability-gated or provider-specific.

## Status

- ClaudexAdapter default resolver: merged
- Claude adapter: merged
- Codex adapter: merged
- Shared contract harness: merged
- Bun-hosted CLI smoke tests: passing for Claude and Codex
- Node fallback for Codex: not needed at the moment

## Docs

- Implementation record: [docs/normalized-sdk-plan.md](./docs/normalized-sdk-plan.md)
- Verified capability matrix: [docs/capability-matrix.md](./docs/capability-matrix.md)
- Consumer guide: [docs/consumer-guide.md](./docs/consumer-guide.md)

## Install

```bash
bun install
```

## Quick Start

```ts
import { ClaudexAdapter, supportsCapability } from "claudex";

const adapter = new ClaudexAdapter();
const readiness = await adapter.checkReadiness();

if (readiness.status !== "ready" && readiness.status !== "degraded") {
  throw new Error(
    `Provider is not runnable: ${readiness.provider} (${readiness.status})`,
  );
}

const session = await adapter.createSession({
  executionMode: "plan",
  approvalMode: "deny",
});

const result = await session.run({
  prompt: "Summarize the repository state.",
});

console.log(result.text);

if (supportsCapability(session.capabilities, "session:fork") && session.fork) {
  const forked = await session.fork();
  await forked.run({
    prompt: "Take a different approach.",
  });
}
```

Use `ClaudeAdapter` or `CodexAdapter` directly when you already know the target
provider or want explicit provider-specific wiring.

## What The Contract Guarantees

- `checkReadiness()` returns a normalized readiness object with provider status, checks, capabilities, and raw provider diagnostics.
- `createSession()` and `resumeSession()` return an `AgentSession` with the same `run()` and `runStreamed()` surface for both providers.
- `run()` returns a normalized `TurnResult`.
- `runStreamed()` yields normalized `AgentEvent` values and normally finishes with a terminal event; consumers should treat that as the common contract shape, not as a hard duplicate-suppression guarantee.
- Structured output accepts one JSON Schema shape for both providers and returns parsed `structuredOutput` or a typed `AgentError`.
- Every event, result, and error preserves the originating provider and keeps raw provider payloads in `raw`. `extensions` may appear on some event shapes, but they are not a universal result/error guarantee.

## What Callers Still Need To Gate

Do not branch on provider name when a capability flag will do.

- `session:fork`: Claude only
- `attachment:image`: Codex only in v1, and only for local file paths
- `stream:message-delta`: Claude only
- `event:reasoning-summary`: Codex only in the current normalized surface
- `event:file-change`: both providers, but payload detail differs
- `usage:cost`: Claude only

See [docs/capability-matrix.md](./docs/capability-matrix.md) for the full matrix and [docs/consumer-guide.md](./docs/consumer-guide.md) for orchestration guidance.

## Passive Ingest

`claudex/ingest` is the read-only companion surface for best-effort observation of local provider artifacts. It does not create sessions, resume sessions, or represent authoritative live control state.

Supported passive sources in the current contract:

- Claude transcript `.jsonl`
- Claude snapshot/task `.json`
- Codex transcript `.jsonl`
- Codex session-index `.jsonl`

Outside the current ingest contract:

- other provider-native logs, temp files, or extension metadata
- live approvals, hooks, plugins, MCP state, and other control-plane behavior
- authoritative live session status

Use the live adapter surface when you need to start or resume sessions, or when terminal turn state must be authoritative. Use `claudex/ingest` when you need best-effort history backfill, watch/reconcile over local artifacts, or a read-only observability view. See [docs/consumer-guide.md](./docs/consumer-guide.md) for examples and boundary guidance.

## Development

```bash
bun run typecheck
bun test
```

Authenticated local smoke tests are opt-in:

```bash
bun run test:smoke
```

To limit smoke to one provider:

```bash
CLAUDEX_SMOKE=1 CLAUDEX_SMOKE_PROVIDERS=codex bun test ./test/smoke/codex.smoke.ts
```

## CI Contract

Pull requests and pushes to `main` run the repository CI contract from
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run typecheck`
- `bun run test:coverage`

To run the same checks locally:

```bash
bun run check
```

To run the exact CI command, including LCOV coverage output in `coverage/lcov.info`:

```bash
bun run ci
```
