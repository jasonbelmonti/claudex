import type { SessionOptions } from "../../src/core/session";
import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider";
import { CONTRACT_TEST_DRIVERS } from "../contract/drivers";

type SmokeProviderConfig = {
  createAdapter: () => AgentProviderAdapter;
  sessionOptions?: SessionOptions;
};

export const SMOKE_PROVIDERS = CONTRACT_TEST_DRIVERS.reduce(
  (providers, driver) => {
    providers[driver.provider] = {
      createAdapter: driver.createSmokeAdapter,
      sessionOptions: driver.smokeSessionOptions,
    };

    return providers;
  },
  {} as Record<ProviderId, SmokeProviderConfig>,
);
