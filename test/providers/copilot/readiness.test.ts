import { expect, test } from "#test-support";

import type { AgentError } from "../../../src/core/errors.js";
import { ClaudexAdapter } from "../../../src/providers/claudex/adapter.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import { createCopilotCapabilities } from "../../../src/providers/copilot/capabilities.js";
import { checkCopilotReadiness } from "../../../src/providers/copilot/readiness.js";
import { FakeCopilotClient } from "./fakes.js";

test("Copilot capabilities do not overclaim deferred session and telemetry support", () => {
  const capabilities = createCopilotCapabilities({
    providerVersion: "1.0.56",
    extensions: {
      protocolVersion: 3,
    },
  });

  expect(capabilities.provider).toBe("copilot");
  expect(capabilities.providerVersion).toBe("1.0.56");
  expect(capabilities.extensions?.protocolVersion).toBe(3);
  expect(capabilities.features["session:create"]?.available).toBe(false);
  expect(capabilities.features["session:resume"]?.available).toBe(false);
  expect(capabilities.features["attachment:image"]?.available).toBe(false);
  expect(capabilities.features["event:reasoning-summary"]?.available).toBe(false);
  expect(capabilities.features["usage:cost"]?.available).toBe(false);
});

test("checkReadiness reports ready and stops owned factory-created clients", async () => {
  const client = new FakeCopilotClient({
    authStatus: {
      authType: "gh-cli",
      isAuthenticated: true,
      login: "octocat",
      statusMessage: "Authenticated",
    },
    status: {
      protocolVersion: 3,
      version: "1.0.56",
    },
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(readiness.status).toBe("ready");
  expect(readiness.capabilities.providerVersion).toBe("1.0.56");
  expect(readiness.capabilities.extensions?.protocolVersion).toBe(3);
  expect(readiness.checks.map((check) => check.status)).toEqual([
    "pass",
    "pass",
    "pass",
  ]);
  expect(client.startCallCount).toBe(1);
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness reports needs_auth for unauthenticated SDK auth status", async () => {
  const client = new FakeCopilotClient({
    authStatus: {
      authType: "user",
      isAuthenticated: false,
      statusMessage: "Not authenticated",
    },
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(readiness.status).toBe("needs_auth");
  expect(readiness.checks[1]).toMatchObject({
    kind: "auth",
    status: "fail",
    summary: "Copilot needs authentication",
  });
  expect(readiness.checks[1]?.detail).toContain("Not authenticated");
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness does not stop injected clients unless ownership is explicit", async () => {
  const sharedClient = new FakeCopilotClient();

  const sharedReadiness = await checkCopilotReadiness({
    client: sharedClient,
  });

  expect(sharedReadiness.status).toBe("ready");
  expect(sharedClient.startCallCount).toBe(1);
  expect(sharedClient.stopCallCount).toBe(0);

  const ownedClient = new FakeCopilotClient();

  const ownedReadiness = await checkCopilotReadiness({
    client: ownedClient,
    ownsClient: true,
  });

  expect(ownedReadiness.status).toBe("ready");
  expect(ownedClient.startCallCount).toBe(1);
  expect(ownedClient.stopCallCount).toBe(1);
});

test("checkReadiness reports startup failures and attempts owned cleanup", async () => {
  const client = new FakeCopilotClient({
    startError: new Error("runtime spawn failed"),
  });

  const startupFailure = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(startupFailure).toMatchObject({
    provider: "copilot",
    status: "error",
  });
  expect(startupFailure.checks[0]).toMatchObject({
    kind: "runtime",
    status: "fail",
    summary: "Copilot SDK runtime failed to start",
    detail: "runtime spawn failed",
  });
  expect(startupFailure.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "pass",
    summary: "Copilot SDK runtime stopped cleanly",
  });
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness reports status probe failures and stops owned clients", async () => {
  const client = new FakeCopilotClient({
    statusError: new Error("status unavailable"),
  });

  const statusFailure = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(statusFailure).toMatchObject({
    provider: "copilot",
    status: "error",
  });
  expect(statusFailure.checks[0]).toMatchObject({
    kind: "runtime",
    status: "fail",
    summary: "Copilot SDK status probe failed",
    detail: "status unavailable",
  });
  expect(statusFailure.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "pass",
    summary: "Copilot SDK runtime stopped cleanly",
  });
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness reports auth probe failures and stops owned clients", async () => {
  const client = new FakeCopilotClient({
    authStatusError: new Error("auth probe failed"),
  });

  const authFailure = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(authFailure).toMatchObject({
    provider: "copilot",
    status: "error",
  });
  expect(authFailure.checks[0]).toMatchObject({
    kind: "runtime",
    status: "pass",
  });
  expect(authFailure.checks[1]).toMatchObject({
    kind: "auth",
    status: "fail",
    summary: "Copilot auth probe failed",
    detail: "auth probe failed",
  });
  expect(authFailure.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "pass",
    summary: "Copilot SDK runtime stopped cleanly",
  });
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness reports cleanup failures as degraded diagnostics", async () => {
  const client = new FakeCopilotClient({
    stopErrors: [new Error("runtime did not exit")],
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(readiness.status).toBe("degraded");
  expect(readiness.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "warn",
    summary: "Copilot SDK runtime cleanup reported errors",
    detail: "runtime did not exit",
  });
  expect(readiness.raw).toMatchObject({
    cleanupErrors: [expect.any(Error)],
  });
});

test("checkReadiness reports thrown cleanup failures as degraded diagnostics", async () => {
  const client = new FakeCopilotClient({
    stopThrowError: new Error("stop crashed"),
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
  });

  expect(readiness.status).toBe("degraded");
  expect(readiness.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "warn",
    summary: "Copilot SDK runtime cleanup failed",
    detail: "stop crashed",
  });
  expect(readiness.raw).toMatchObject({
    cleanupErrors: [expect.any(Error)],
  });
});

test("CopilotAdapter exposes readiness and rejects session operations as deferred", async () => {
  const adapter = new CopilotAdapter({
    clientFactory: () => new FakeCopilotClient(),
  });

  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    provider: "copilot",
    status: "ready",
  });
  await expect(adapter.createSession()).rejects.toMatchObject({
    name: "AgentError",
    code: "unsupported_feature",
    provider: "copilot",
  } satisfies Partial<AgentError>);
  await expect(
    adapter.resumeSession({
      provider: "copilot",
      sessionId: "copilot-session",
    }),
  ).rejects.toMatchObject({
    name: "AgentError",
    code: "unsupported_feature",
    provider: "copilot",
  } satisfies Partial<AgentError>);
});

test("ClaudexAdapter can load the default Copilot adapter for readiness", async () => {
  const client = new FakeCopilotClient();
  const adapter = new ClaudexAdapter({
    preferredProviders: ["copilot"],
    copilot: {
      clientFactory: () => client,
    },
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.provider).toBe("copilot");
  expect(readiness.status).toBe("ready");
  expect(adapter.provider).toBe("copilot");
  expect(client.stopCallCount).toBe(1);
});
