import { expect, test } from "#test-support";

import type { ProviderReadiness } from "../../../src/core/readiness.js";
import { toSafeProviderProbe } from "../../../src/providers/claudex/safe-probes.js";

test.each([
  "Authorization: Basic c2VjcmV0 apiKey=shortSecret123 sessionCookie=COOKIE_SECRET",
  "prompt=Open the pod bay doors response=Full confidential mission answer",
  "prompt=PRIVATE PLAN ALPHA api_key=AKIAIOSFODNN7EXAMPLE",
])("safe probes fail closed for sensitive summary: %s", (summary) => {
  const readiness: ProviderReadiness = {
    provider: "codex",
    status: "ready",
    checks: [
      {
        kind: "auth",
        status: "pass",
        summary,
      },
    ],
    capabilities: {
      provider: "codex",
      features: {},
    },
  };

  const probe = toSafeProviderProbe(readiness);

  expect(probe.checks[0]?.summary).toBe(
    "<redacted-sensitive-summary>",
  );
  expect(JSON.stringify(probe)).not.toContain("c2VjcmV0");
  expect(JSON.stringify(probe)).not.toContain("pod bay doors");
  expect(JSON.stringify(probe)).not.toContain("AKIA");
});
