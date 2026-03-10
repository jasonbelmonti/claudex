import { setDefaultTimeout, test } from "bun:test";

import { runSmokeScenario, shouldRunSmokeProvider } from "./helpers";
import { SMOKE_PROVIDERS } from "./providers";

setDefaultTimeout(120_000);

if (shouldRunSmokeProvider("claude")) {
  test("claude CLI-auth smoke", async () => {
    await runSmokeScenario({
      provider: "claude",
      createAdapter: SMOKE_PROVIDERS.claude.createAdapter,
      sessionOptions: SMOKE_PROVIDERS.claude.sessionOptions,
    });
  });
} else {
  test.skip("claude CLI-auth smoke", () => {});
}
