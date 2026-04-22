import { test } from "#test-support";

import { runSmokeScenario, shouldRunSmokeProvider } from "./helpers.js";
import { SMOKE_PROVIDERS } from "./providers.js";

if (shouldRunSmokeProvider("codex")) {
  test("codex CLI-auth smoke", { timeout: 120_000 }, async () => {
    await runSmokeScenario({
      provider: "codex",
      createAdapter: SMOKE_PROVIDERS.codex.createAdapter,
      sessionOptions: SMOKE_PROVIDERS.codex.sessionOptions,
    });
  });
} else {
  test.skip("codex CLI-auth smoke", () => {});
}
