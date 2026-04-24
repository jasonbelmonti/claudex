# claudex

`claudex` is a Node-hosted TypeScript library that exposes one normalized API over the CLI-authenticated Claude and Codex SDKs, plus a passive `@jasonbelmonti/claudex/ingest` surface for replaying local provider artifacts.

The goal is provider-agnostic orchestration, not fake parity. The stable contract covers readiness, session lifecycle, buffered and streamed turns, structured output, and normalized event/result/error shapes. Anything that does not normalize cleanly stays capability-gated or provider-specific.

## Status

- ClaudexAdapter default resolver: merged
- Claude adapter: merged
- Codex adapter: merged
- Shared contract harness: merged
- Node-based validation and package smoke checks: passing on `main`
- Migration guidance for the Node-only major release: published in-repo

## Docs

- Node-only migration guide: [docs/node-only-migration.md](./docs/node-only-migration.md)
- Implementation record: [docs/normalized-sdk-plan.md](./docs/normalized-sdk-plan.md)
- Verified capability matrix: [docs/capability-matrix.md](./docs/capability-matrix.md)
- Consumer guide: [docs/consumer-guide.md](./docs/consumer-guide.md)

## Install

```bash
npm install @jasonbelmonti/claudex
```

`main` now tracks the Node-only release line for `@jasonbelmonti/claudex`.
The package is ESM-only, repository validation runs on standard Node workflows,
and Bun is no longer part of the supported runtime or maintenance contract.

## Runtime And Module Requirements

- Package metadata currently declares `engines.node >=18`.
- Repository CI verifies the currently supported Node release lines: 20, 22, and 24.
- The package is ESM-only. CommonJS consumers must use dynamic `import()` or an ESM bridge.

If you are upgrading from the Bun-first 1.x line or running on an older Node
release, read [docs/node-only-migration.md](./docs/node-only-migration.md)
before adopting the next semver-major version.

## Quick Start

```ts
import { ClaudexAdapter, supportsCapability } from "@jasonbelmonti/claudex";

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

The stable root entrypoint intentionally exposes the provider-agnostic surface.
When you need explicit provider wiring or test doubles, pass adapters through
`ClaudexAdapter`'s `providers` option.

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

`@jasonbelmonti/claudex/ingest` is the read-only companion surface for best-effort observation of local provider artifacts. It does not create sessions, resume sessions, or represent authoritative live control state.

Supported passive sources in the current contract:

- Claude transcript `.jsonl`
- Claude snapshot/task `.json`
- Codex transcript `.jsonl`
- Codex session-index `.jsonl`

Outside the current ingest contract:

- other provider-native logs, temp files, or extension metadata
- live approvals, hooks, plugins, MCP state, and other control-plane behavior
- authoritative live session status

Use the live adapter surface when you need to start or resume sessions, or when terminal turn state must be authoritative. Use `@jasonbelmonti/claudex/ingest` when you need best-effort history backfill, watch/reconcile over local artifacts, or a read-only observability view. See [docs/consumer-guide.md](./docs/consumer-guide.md) for examples and boundary guidance.

## Development

If you're working on the repository itself:

```bash
npm ci
```

Then run the usual checks:

```bash
npm run typecheck
npm test
```

Authenticated local smoke tests are opt-in:

```bash
npm run test:smoke
```

To limit smoke to one provider:

```bash
CLAUDEX_SMOKE=1 CLAUDEX_SMOKE_PROVIDERS=codex npm run test -- ./test/smoke/codex.smoke.ts
```

## CI Contract

Pull requests and pushes to `main` run the repository CI contract from
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

- Node 20, 22, and 24 baseline verification via `npm run check`
- Node 20 and 22 test-suite verification via `npm test`
- Node 24 coverage via `npm run test:coverage`
- Node 20, 22, and 24 packed-artifact verification via `npm run package:check`

To reproduce the full CI command set locally on a supported Node release:

```bash
npm run check
npm test
npm run test:coverage
npm run package:check
```
