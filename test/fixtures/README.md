# Fixture Conventions

The `test/fixtures` tree holds provider-owned artifact samples used by the
passive-ingest suite.

## Deterministic fixtures

Checked-in deterministic fixtures are the default audit input:

- keep them small and replay-focused
- prefer representative artifacts over synthetic noise
- update them intentionally when the scenario contract changes

Current deterministic fixtures already cover the baseline parity set for Claude
and Codex replay.

## Sanitized live fixtures

Live-capture fixtures are opt-in validation artifacts. They should live beside
the provider artifacts they exercise and use an adjacent sidecar ending in
`.fixture.json`.

Example layout:

```text
test/fixtures/codex/upgrade-text-turn.jsonl
test/fixtures/codex/upgrade-text-turn.fixture.json
```

The sidecar should carry the provenance fields defined in
`test/ingest/audit-matrix.ts`:

- `scenarioId`
- `provider`
- `sourceFamilies`
- `capturedAt`
- `captureKind`
- `artifactVersion`
- `providerVersion`
- `sdkVersion`
- `sanitizerVersion`
- `sanitizedBy`

## Upgrade rule

When Claude or Codex dependencies change, do not overwrite fixtures blindly.
Add or refresh fixtures in a way that keeps the scenario id and provenance
history explicit so the audit harness can compare old and new behavior.

