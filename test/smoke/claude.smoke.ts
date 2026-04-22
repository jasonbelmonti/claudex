import { test } from "#test-support";

import { runSmokeScenario, shouldRunSmokeProvider } from "./helpers.js";
import { SMOKE_PROVIDERS } from "./providers.js";

if (shouldRunSmokeProvider("claude")) {
  test("claude CLI-auth smoke", { timeout: 120_000 }, async () => {
    await runSmokeScenario({
      provider: "claude",
      createAdapter: SMOKE_PROVIDERS.claude.createAdapter,
      sessionOptions: SMOKE_PROVIDERS.claude.sessionOptions,
    });
  });
} else {
  test.skip("claude CLI-auth smoke", () => {});
}
