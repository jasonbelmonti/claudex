import { test } from "#test-support";

import { runSmokeScenario, shouldRunSmokeProvider } from "./helpers.js";
import { SMOKE_PROVIDERS } from "./providers.js";

if (shouldRunSmokeProvider("copilot")) {
  test("copilot CLI-auth smoke", { timeout: 120_000 }, async () => {
    await runSmokeScenario({
      provider: "copilot",
      createAdapter: SMOKE_PROVIDERS.copilot.createAdapter,
      sessionOptions: SMOKE_PROVIDERS.copilot.sessionOptions,
    });
  });
} else {
  test.skip("copilot CLI-auth smoke", () => {});
}
