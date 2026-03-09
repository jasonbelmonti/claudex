import { expect, test } from "bun:test";

import { supportsCapability } from "../../src/core/capabilities";
import {
  CONTRACT_TEST_DRIVERS,
  CONTRACT_TEST_PROVIDER_IDS,
  EXPECTED_CONTRACT_PROVIDER_IDS,
} from "./drivers";

test("contract drivers stay aligned with the shared harness shape", async () => {
  expect(CONTRACT_TEST_PROVIDER_IDS).toEqual(EXPECTED_CONTRACT_PROVIDER_IDS);

  for (const driver of CONTRACT_TEST_DRIVERS) {
    expect(driver.readiness.ready.expectedStatus).toBe("ready");
    expect(driver.readiness.missing_cli.expectedStatus).toBe("missing_cli");
    expect(driver.readiness.needs_auth.expectedStatus).toBe("needs_auth");
    expect(driver.readiness.error.expectedStatus).toBe("error");

    const adapter = driver.sessions.create().createAdapter();

    expect(adapter.provider).toBe(driver.provider);
    expect(
      supportsCapability(adapter.capabilities, "session:fork"),
    ).toBe(driver.capabilityExpectations.supportsFork);
    expect(
      supportsCapability(adapter.capabilities, "stream:message-delta"),
    ).toBe(driver.capabilityExpectations.supportsMessageDelta);
  }
});
