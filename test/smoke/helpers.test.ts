import { afterEach, expect, test } from "#test-support";

import type { ProviderId } from "../../src/core/provider.js";
import { shouldRunSmokeProvider } from "./helpers.js";

const PROVIDERS = ["claude", "codex", "copilot"] as const satisfies readonly ProviderId[];
const ORIGINAL_SMOKE = process.env.CLAUDEX_SMOKE;
const ORIGINAL_SMOKE_PROVIDERS = process.env.CLAUDEX_SMOKE_PROVIDERS;

afterEach(() => {
  restoreEnv("CLAUDEX_SMOKE", ORIGINAL_SMOKE);
  restoreEnv("CLAUDEX_SMOKE_PROVIDERS", ORIGINAL_SMOKE_PROVIDERS);
});

test("does not run provider smoke when the global smoke gate is disabled", () => {
  delete process.env.CLAUDEX_SMOKE;
  delete process.env.CLAUDEX_SMOKE_PROVIDERS;

  expectSmokeSelection({
    claude: false,
    codex: false,
    copilot: false,
  });
});

test("defaults to Claude and Codex when smoke is enabled without provider selection", () => {
  process.env.CLAUDEX_SMOKE = "1";
  delete process.env.CLAUDEX_SMOKE_PROVIDERS;

  expectSmokeSelection({
    claude: true,
    codex: true,
    copilot: false,
  });
});

test("runs explicitly selected Copilot smoke only", () => {
  process.env.CLAUDEX_SMOKE = "1";
  process.env.CLAUDEX_SMOKE_PROVIDERS = "copilot";

  expectSmokeSelection({
    claude: false,
    codex: false,
    copilot: true,
  });
});

test("parses trimmed comma-separated smoke provider selection", () => {
  process.env.CLAUDEX_SMOKE = "1";
  process.env.CLAUDEX_SMOKE_PROVIDERS = " copilot, codex , ";

  expectSmokeSelection({
    claude: false,
    codex: true,
    copilot: true,
  });
});

function expectSmokeSelection(expected: Record<ProviderId, boolean>): void {
  for (const provider of PROVIDERS) {
    expect(shouldRunSmokeProvider(provider)).toBe(expected[provider]);
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
