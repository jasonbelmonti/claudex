import { setDefaultTimeout, test } from "bun:test";

import { runSmokeScenario, shouldRunSmokeProvider } from "./helpers";
import { SMOKE_PROVIDERS } from "./providers";

setDefaultTimeout(120_000);

if (shouldRunSmokeProvider("codex")) {
  test("codex CLI-auth smoke", async () => {
    await runSmokeScenario({
      provider: "codex",
      createAdapter: SMOKE_PROVIDERS.codex.createAdapter,
      sessionOptions: SMOKE_PROVIDERS.codex.sessionOptions,
    });
  });
} else {
  test.skip("codex CLI-auth smoke", () => {});
}
