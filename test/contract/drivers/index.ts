import type { ProviderId } from "../../../src/core/provider.js";
import type { ContractProviderDriver } from "../types.js";
import { CLAUDE_CONTRACT_DRIVER } from "./claude.js";
import { CODEX_CONTRACT_DRIVER } from "./codex.js";
import { COPILOT_CONTRACT_DRIVER } from "./copilot.js";

export const CONTRACT_TEST_DRIVERS = [
  CLAUDE_CONTRACT_DRIVER,
  CODEX_CONTRACT_DRIVER,
  COPILOT_CONTRACT_DRIVER,
] satisfies ContractProviderDriver[];

export const CONTRACT_TEST_PROVIDER_IDS = CONTRACT_TEST_DRIVERS.map(
  (driver) => driver.provider,
);

export const EXPECTED_CONTRACT_PROVIDER_IDS = [
  "claude",
  "codex",
  "copilot",
] as const satisfies readonly ProviderId[];
