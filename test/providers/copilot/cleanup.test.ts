import { expect, test } from "#test-support";

import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import { FakeCopilotClient } from "./fakes.js";

test("CopilotAdapter disposes an owned runtime exactly once", async () => {
  const client = new FakeCopilotClient();
  const adapter = new CopilotAdapter({ client, ownsClient: true });

  await adapter.dispose();
  await adapter.dispose();

  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(0);
});

test("CopilotAdapter preserves cleanup errors as actionable AgentErrors", async () => {
  const client = new FakeCopilotClient({
    stopErrors: [new Error("transport close failed")],
  });
  const adapter = new CopilotAdapter({ client, ownsClient: true });

  await expect(adapter.dispose()).rejects.toMatchObject({
    code: "provider_failure",
    details: {
      cleanupErrorCount: 1,
      cleanupTimedOut: false,
      lifecycleStage: "runtime_stop",
      stage: "cleanup",
    },
    provider: "copilot",
  });
});

test("CopilotAdapter bounds graceful cleanup and force-stops without hanging", async () => {
  const client = new FakeCopilotClient({ stopNeverResolves: true });
  const adapter = new CopilotAdapter({
    cleanupTimeoutMs: 1,
    client,
    ownsClient: true,
  });
  const startedAt = Date.now();

  await expect(adapter.dispose()).rejects.toMatchObject({
    code: "provider_failure",
    details: {
      cleanupTimedOut: true,
      forceStopFailed: false,
      lifecycleStage: "runtime_stop",
      stage: "cleanup",
    },
  });

  expect(Date.now() - startedAt).toBeLessThan(250);
  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(1);
});

test("CopilotAdapter also bounds a failed force-stop stage", async () => {
  const client = new FakeCopilotClient({
    forceStopNeverResolves: true,
    stopNeverResolves: true,
  });
  const adapter = new CopilotAdapter({
    cleanupTimeoutMs: 1,
    client,
    ownsClient: true,
  });
  const startedAt = Date.now();

  await expect(adapter.dispose()).rejects.toMatchObject({
    details: {
      cleanupTimedOut: true,
      forceStopFailed: true,
      lifecycleStage: "runtime_force_stop",
    },
  });

  expect(Date.now() - startedAt).toBeLessThan(250);
});
