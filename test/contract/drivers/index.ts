import { PROVIDER_IDS } from "../../../src/core/provider";
import type { ContractProviderDriver } from "../types";
import { CLAUDE_CONTRACT_DRIVER } from "./claude";
import { CODEX_CONTRACT_DRIVER } from "./codex";

export const CONTRACT_TEST_DRIVERS = [
  CLAUDE_CONTRACT_DRIVER,
  CODEX_CONTRACT_DRIVER,
] satisfies ContractProviderDriver[];

export const CONTRACT_TEST_PROVIDER_IDS = CONTRACT_TEST_DRIVERS.map(
  (driver) => driver.provider,
);

export const EXPECTED_CONTRACT_PROVIDER_IDS = [...PROVIDER_IDS];
