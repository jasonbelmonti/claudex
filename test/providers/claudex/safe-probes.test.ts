import { expect, test } from "#test-support";

import type { ProviderReadiness } from "../../../src/core/readiness.js";
import { ProviderResolutionError } from "../../../src/providers/claudex/provider-resolution-error.js";
import { toSafeProviderProbe } from "../../../src/providers/claudex/safe-probes.js";

test("safe probes fail closed for demonstrated sensitive summaries", () => {
  for (const summary of [
    "Authorization: Basic c2VjcmV0 apiKey=shortSecret123 sessionCookie=COOKIE_SECRET",
    "prompt=Open the pod bay doors response=Full confidential mission answer",
    "prompt=PRIVATE PLAN ALPHA api_key=AKIAIOSFODNN7EXAMPLE",
  ]) {
    const probe = toSafeProviderProbe({
      provider: "codex",
      status: "ready",
      checks: [{ kind: "auth", status: "pass", summary }],
      capabilities: { provider: "codex", features: {} },
    });
    expect(probe.checks[0]?.summary).toBe("<redacted-sensitive-summary>");
    expect(JSON.stringify(probe)).not.toMatch(/c2VjcmV0|pod bay doors|AKIA/);
  }
});

test("safe probes retain only bounded allowlisted check fields", () => {
  const probe = toSafeProviderProbe({ provider: "codex", status: "ready", checks: [{ kind: "runtime", status: "pass", summary: "healthy ".repeat(80), detail: "raw detail" }], capabilities: { provider: "codex", features: {} }, raw: "raw value" });
  expect(probe.checks[0]?.summary).toHaveLength(256);
  expect(Object.keys(probe.checks[0] ?? {})).toEqual(["kind", "status", "summary"]);
  expect(JSON.stringify(probe)).not.toContain("raw");
});

test("resolution errors defensively snapshot immutable probe evidence", () => {
  const check = { kind: "runtime" as const, status: "fail" as const, summary: "original", detail: "Authorization: Basic TOP_SECRET", raw: { apiKey: "SECRET" } };
  const probe = { provider: "codex" as ProviderReadiness["provider"], status: "error" as ProviderReadiness["status"], checks: [check] };

  const error = new ProviderResolutionError({
    allowedStatuses: ["ready"], code: "provider_failure", message: "failed",
    probes: [probe], provider: "codex", requiredCapabilities: [],
  });
  probe.provider = "claude";
  probe.status = "ready";
  check.summary = "mutated";

  expect(error.probes[0]).toEqual({ provider: "codex", status: "error", checks: [{ kind: "runtime", status: "fail", summary: "original" }] });
  expect(JSON.stringify(error.probes)).not.toMatch(/TOP_SECRET|SECRET/); expect([error.probes, error.probes[0], error.probes[0]?.checks, error.probes[0]?.checks[0]].every((value) => Object.isFrozen(value))).toBe(true);
  expect(() => Object.assign(error.probes[0] ?? {}, { provider: "claude" })).toThrow(TypeError);
});
