# Node-Only Migration Guide

This guide captures the support-policy change for the 3.0.0
`@jasonbelmonti/claudex` release line.

## What Is Changing

- Bun is no longer part of the supported runtime, CI, or release contract.
- Repository development, validation, and package smoke checks run on standard
  Node workflows.
- The package remains ESM-only.
- The 3.0.0 release line should be read as a Node-only release, not as a
  Bun-first package with a Node fallback.

## Why This Is A Breaking Change

`claudex` 1.x positioned Bun as the supported host runtime for the package and
repository tooling. The 3.0.0 line removes that support policy and treats Node
as the maintained execution path for local development, CI verification,
package smoke checks, and release automation.

For consumers already on 2.x, 3.0.0 also raises the published package metadata
from `engines.node >=18` to `engines.node >=20`.

If you currently rely on Bun for `claudex` execution, a successful local run is
no longer enough to treat that setup as supported. The maintenance contract,
repro steps, and release validation all assume Node.

## Runtime Support Policy For 3.0.0

- `package.json` declares `engines.node >=20`
- repository CI verifies the supported upstream Node 20, 22, and 24 lines
- the package is ESM-only

As of April 30, 2025, upstream Node 18 is end-of-life. The package metadata now
matches the maintained release floor, so consumers adopting the 3.x line should
plan on Node 20 or newer.

## Runtime Support Policy For 4.0.0

Version 4.0.0 applies the July 2026 provider SDK refresh and raises the runtime
floor to match `@github/copilot-sdk@1.0.5`:

- `package.json` declares `engines.node ^20.19.0 || >=22.12.0`
- repository CI verifies Node 20.19.0, Node 22.12.0, and the currently
  supported upstream Node 24 line

Consumers adopting 4.0.0 or newer should plan on Node 20.19.0 or newer on Node
20, or Node 22.12.0 or newer on Node 22.

## What Downstream Consumers Should Change

1. Move execution to a standard supported Node runtime before adopting `claudex`
   3.0.0 or newer.
2. Update installation, CI, and local maintenance commands to use Node package
   workflows such as `npm install`, `npm ci`, `npm test`, and `npm run ...`.
3. Treat the package as ESM-only. If your application is still CommonJS-only,
   add an ESM bridge or use dynamic `import()`.
4. Re-run any provider-authenticated smoke or readiness flows under Node rather
   than assuming Bun parity.

## Repository Command Mapping

| Bun-first 1.x habit | Node-only replacement |
| --- | --- |
| `bun add @jasonbelmonti/claudex` | `npm install @jasonbelmonti/claudex` |
| `bun install` | `npm ci` |
| `bun test` | `npm test` |
| `bun run check` | `npm run check` |
| `bun run ci` | `npm run ci` |
| `bun run package:check` | `npm run package:check` |

## Release Notes Summary

For release notes or migration callouts, the headline should be:

- `@jasonbelmonti/claudex` 3.0.0 is Node-only and ESM-only.
- Bun is removed from the supported runtime and repository validation surface.
- Downstream consumers should migrate their install, CI, and smoke flows to
  Node before adopting the release.
- Consumers pinned to Node 18 should upgrade to Node 20 or newer before moving
  to 3.0.0.
- Consumers on early Node 20 or early Node 22 should upgrade to Node 20.19.0 or
  newer on Node 20, or Node 22.12.0 or newer on Node 22, before moving to 4.0.0
  or newer.
