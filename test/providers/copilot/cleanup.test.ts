import { expect, test } from "#test-support";

import { AgentError } from "../../../src/core/errors.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import {
  createCopilotAssistantMessageEvent,
  createCopilotIdleEvent,
  FakeCopilotClient,
  FakeCopilotSession,
} from "./fakes.js";

const STRUCTURED_SCHEMA = {
  type: "object",
  properties: { status: { type: "string" } },
  required: ["status"],
} as const;

test("CopilotAdapter disposes an owned client exactly once", async () => {
  const client = new FakeCopilotClient();
  const adapter = new CopilotAdapter({ client, ownsClient: true });

  await adapter.dispose();
  await adapter.dispose();

  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(0);
});

test("CopilotAdapter owns a client created by its factory by default", async () => {
  const client = new FakeCopilotClient({
    createSessions: [new FakeCopilotSession("factory-owned")],
  });
  const adapter = new CopilotAdapter({ clientFactory: () => client });

  await adapter.createSession();
  await adapter.dispose();

  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(0);
});

test("CopilotAdapter leaves an injected non-owned client running", async () => {
  const client = new FakeCopilotClient();
  const adapter = new CopilotAdapter({ client });

  await adapter.dispose();

  expect(client.stopCallCount).toBe(0);
  expect(client.forceStopCallCount).toBe(0);
});

test("CopilotAdapter reports stop errors separately after force-stop", async () => {
  const client = new FakeCopilotClient({
    stopErrors: [new Error("transport close failed")],
  });
  const adapter = new CopilotAdapter({ client, ownsClient: true });

  await expect(adapter.dispose()).rejects.toMatchObject({
    code: "provider_failure",
    provider: "copilot",
    details: {
      stage: "cleanup",
      lifecycleStage: "runtime_stop",
      cleanupTimedOut: false,
      forceStopFailed: false,
      cleanupErrorCount: 1,
    },
  });
  expect(client.forceStopCallCount).toBe(1);
});

test("CopilotAdapter bounds graceful cleanup and force-stops", async () => {
  const client = new FakeCopilotClient({ stopNeverResolves: true });
  const adapter = new CopilotAdapter({
    cleanupTimeoutMs: 10,
    client,
    ownsClient: true,
  });
  const startedAt = Date.now();

  await expect(adapter.dispose()).rejects.toMatchObject({
    details: {
      stage: "cleanup",
      lifecycleStage: "runtime_stop",
      cleanupTimedOut: true,
      forceStopFailed: false,
    },
  });

  expect(Date.now() - startedAt).toBeLessThan(500);
  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(1);
});

test("CopilotAdapter bounds a force-stop that also fails to complete", async () => {
  const client = new FakeCopilotClient({
    forceStopNeverResolves: true,
    stopErrors: [new Error("stop failed")],
  });
  const adapter = new CopilotAdapter({
    cleanupTimeoutMs: 10,
    client,
    ownsClient: true,
  });
  const startedAt = Date.now();

  await expect(adapter.dispose()).rejects.toMatchObject({
    details: {
      stage: "cleanup",
      lifecycleStage: "runtime_force_stop",
      cleanupTimedOut: true,
      forceStopFailed: true,
      cleanupErrorCount: 2,
    },
  });

  expect(Date.now() - startedAt).toBeLessThan(500);
});

test("turn and cleanup failures remain separate AgentErrors", async () => {
  const fakeSession = new FakeCopilotSession("cleanup-separation", [
    [
      createCopilotAssistantMessageEvent({ content: "not JSON" }),
      createCopilotIdleEvent(),
    ],
  ]);
  const client = new FakeCopilotClient({
    createSessions: [fakeSession],
    stopErrors: [new Error("cleanup failed")],
  });
  const adapter = new CopilotAdapter({ client, ownsClient: true });
  const session = await adapter.createSession();

  const primary = await captureFailure(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: STRUCTURED_SCHEMA },
    ),
  );
  const cleanup = await captureFailure(adapter.dispose());

  expect(primary).toBeInstanceOf(AgentError);
  expect(primary).toMatchObject({
    code: "structured_output_invalid",
    provider: "copilot",
  });
  expect(cleanup).toBeInstanceOf(AgentError);
  expect(cleanup).toMatchObject({
    code: "provider_failure",
    provider: "copilot",
    details: { stage: "cleanup" },
  });
  expect(cleanup).not.toBe(primary);
});

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}
