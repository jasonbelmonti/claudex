import { expect, test } from "bun:test";

import {
  CONTRACT_TEST_DRIVERS,
} from "./drivers";

for (const driver of CONTRACT_TEST_DRIVERS) {
  test(`${driver.provider} readiness scenarios satisfy the normalized contract`, async () => {
    for (const scenario of Object.values(driver.readiness)) {
      const readiness = await scenario.createAdapter().checkReadiness();

      expect(readiness.provider).toBe(driver.provider);
      expect(readiness.status).toBe(scenario.expectedStatus);
      expect(readiness.capabilities.provider).toBe(driver.provider);
      expect(readiness.checks.length).toBeGreaterThan(0);
    }
  });
}
