import { expect, test } from "bun:test";

import { isProviderReady, type ProviderReadiness } from "../src/core/readiness";

test("isProviderReady returns true only for ready providers", () => {
  const ready: ProviderReadiness = {
    provider: "claude",
    status: "ready",
    checks: [],
    capabilities: {
      provider: "claude",
      features: {},
    },
  };

  const notReady: ProviderReadiness = {
    provider: "codex",
    status: "needs_auth",
    checks: [],
    capabilities: {
      provider: "codex",
      features: {},
    },
  };

  expect(isProviderReady(ready)).toBe(true);
  expect(isProviderReady(notReady)).toBe(false);
});
