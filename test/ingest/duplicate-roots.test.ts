import { expect, test } from "bun:test";

import type { DiscoveryRootConfig } from "claudex/ingest";

import { resolveActiveDiscoveryRoots } from "../../src/ingest/duplicate-roots";

test("resolveActiveDiscoveryRoots keeps same-path roots when metadata differs", () => {
  const firstRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude",
    recursive: true,
    metadata: { scope: "primary" },
  };
  const secondRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude",
    recursive: true,
    metadata: { scope: "secondary" },
  };

  const result = resolveActiveDiscoveryRoots([firstRoot, secondRoot]);

  expect(result.activeRoots).toEqual([firstRoot, secondRoot]);
  expect(result.skippedRoots).toEqual([]);
});

test("resolveActiveDiscoveryRoots keeps overlapping recursive roots when filters differ", () => {
  const parentRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude",
    recursive: true,
    include: ["**/*.jsonl"],
  };
  const childRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude/nested",
    recursive: true,
    include: ["special/**/*.jsonl"],
  };

  const result = resolveActiveDiscoveryRoots([parentRoot, childRoot]);

  expect(result.activeRoots).toEqual([parentRoot, childRoot]);
  expect(result.skippedRoots).toEqual([]);
});

test("resolveActiveDiscoveryRoots still skips exact duplicate coverage", () => {
  const parentRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude",
    recursive: true,
    watch: true,
  };
  const childRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claudex/claude/nested",
    recursive: true,
    watch: true,
  };

  const result = resolveActiveDiscoveryRoots([childRoot, parentRoot]);

  expect(result.activeRoots).toEqual([parentRoot]);
  expect(result.skippedRoots).toHaveLength(1);
  expect(result.skippedRoots[0]?.root).toEqual(childRoot);
  expect(result.skippedRoots[0]?.duplicateOf).toEqual(parentRoot);
});
