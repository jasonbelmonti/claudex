---
description: Use Node.js and the repository's npm-based workflows.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using standard Node.js and npm workflows.

- Use `node <file>` or `tsx <file>` instead of `bun <file>`
- Use `npm test` or `vitest run` instead of `bun test`
- Use `npm ci` for reproducible dependency installs in repo workflows
- Use `npm run <script>` instead of `bun run <script>`
- Prefer standard Node APIs and ecosystem tools over Bun-only globals or modules

## Runtime Policy

- This repository targets a Node-only release line
- `package.json` declares `engines.node >=20`
- CI verifies the repository on Node 20, 22, and 24
- The package is ESM-only

## APIs

- Prefer `node:fs/promises` or other standard Node file APIs over `Bun.file`
- Prefer `node:child_process`, `node:stream`, and standard Web APIs available in Node before reaching for runtime-specific helpers
- Do not introduce `Bun.*` globals, `bun:*` imports, or Bun-only execution assumptions

## Module Design

- Separate types/interfaces, business logic, and generic utilities into different files whenever practical
- Keep each file and class tightly focused on a single responsibility
- Prefer smaller modules over large multi-purpose files, even if that adds a bit more hierarchy
- If a file starts mixing contract types, implementation logic, and reusable helpers, split it before it grows further

## Testing

Use Vitest for tests.

```ts
import { describe, expect, it } from "vitest";

describe("example", () => {
  it("works", () => {
    expect(1).toBe(1);
  });
});
```

## Tooling

- Prefer `npm run check` for the local baseline verification path
- Use `npm run test:coverage` for coverage output
- Use `npm run package:check` to verify the packed artifact surface before publish
