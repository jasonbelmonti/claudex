# claudex

Planning and execution start from [docs/normalized-sdk-plan.md](./docs/normalized-sdk-plan.md).
The initial contract model lives in [docs/capability-matrix.md](./docs/capability-matrix.md).

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## CI contract

Pull requests and pushes to `main` now run the repository's CI contract from
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run typecheck`
- `bun run test:coverage`

To run the same checks locally:

```bash
bun run check
```

To run the exact CI command, including LCOV coverage output in
`coverage/lcov.info`:

```bash
bun run ci
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
