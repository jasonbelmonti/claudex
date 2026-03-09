import { expect, test } from "bun:test";

import * as claudex from "../index";

test("public api exports the core contract surface", () => {
  expect(claudex.PROVIDER_IDS).toEqual(["claude", "codex"]);
  expect(claudex.CAPABILITY_CATALOG.length).toBeGreaterThan(0);
  expect(typeof claudex.supportsCapability).toBe("function");
  expect(typeof claudex.isProviderReady).toBe("function");
  expect(typeof claudex.AgentError).toBe("function");
  expect(typeof claudex.CodexAdapter).toBe("function");
});
