import type { SessionOptions } from "../../src/core/session.js";
import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider.js";
import { CONTRACT_TEST_DRIVERS } from "../contract/drivers/index.js";

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
