import { expect, test } from "bun:test";

import {
  CAPABILITY_CATALOG,
  supportsCapability,
  type CapabilityId,
  type ProviderCapabilities,
} from "../src/core/capabilities";

test("capability catalog ids are unique", () => {
  const ids = CAPABILITY_CATALOG.map((capability) => capability.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("capability catalog includes normalized and gated features", () => {
  expect(CAPABILITY_CATALOG.some((capability) => capability.normalization === "normalized")).toBe(
    true,
  );
  expect(
    CAPABILITY_CATALOG.some((capability) => capability.normalization === "capability-gated"),
  ).toBe(true);
});

test("supportsCapability returns true only for available features", () => {
  const capabilities: ProviderCapabilities = {
    provider: "codex",
    features: {
      "session:create": { available: true },
      "event:auth-status": { available: false, notes: "Not emitted by fixture provider" },
    },
  };

  expect(supportsCapability(capabilities, "session:create")).toBe(true);
  expect(supportsCapability(capabilities, "event:auth-status")).toBe(false);
  expect(supportsCapability(capabilities, "usage:cost")).toBe(false);
});

test("every fixture feature key resolves to a declared capability id", () => {
  const validCapabilityIds = new Set<CapabilityId>(CAPABILITY_CATALOG.map((capability) => capability.id));
  const fixtureFeatureKeys = ["session:create", "session:resume", "output:structured"] as const;

  for (const key of fixtureFeatureKeys) {
    expect(validCapabilityIds.has(key)).toBe(true);
  }
});
