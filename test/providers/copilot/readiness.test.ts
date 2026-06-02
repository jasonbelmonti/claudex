import { expect, test } from "#test-support";

import { ClaudexAdapter } from "../../../src/providers/claudex/adapter.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import { createCopilotCapabilities } from "../../../src/providers/copilot/capabilities.js";
import { checkCopilotReadiness } from "../../../src/providers/copilot/readiness.js";
import { FakeCopilotClient, FakeCopilotSession } from "./fakes.js";

test("Copilot capabilities expose runtime support without overclaiming deferred telemetry", () => {
  const capabilities = createCopilotCapabilities({
    providerVersion: "1.0.56",
    extensions: {
      protocolVersion: 3,
    },
  });

  expect(capabilities.provider).toBe("copilot");
  expect(capabilities.providerVersion).toBe("1.0.56");
  expect(capabilities.extensions?.protocolVersion).toBe(3);
  expect(capabilities.features["session:create"]?.available).toBe(true);
  expect(capabilities.features["session:resume"]?.available).toBe(true);
  expect(capabilities.features["output:structured"]?.available).toBe(true);
  expect(capabilities.features["stream:message-delta"]?.available).toBe(true);
  expect(capabilities.features["event:tool-lifecycle"]?.available).toBe(true);
  expect(capabilities.features["usage:tokens"]?.available).toBe(true);
  expect(capabilities.features["mcp:session-descriptors"]?.available).toBe(true);
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

test("checkReadiness times out startup and attempts owned cleanup", async () => {
  const client = new FakeCopilotClient({
    startNeverResolves: true,
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
    readinessTimeoutMs: 0,
  });

  expect(readiness).toMatchObject({
    provider: "copilot",
    status: "error",
  });
  expect(readiness.checks[0]).toMatchObject({
    kind: "runtime",
    status: "fail",
    summary: "Copilot SDK runtime failed to start",
  });
  expect(readiness.checks[0]?.detail).toContain(
    "runtime startup timed out",
  );
  expect(readiness.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "pass",
    summary: "Copilot SDK runtime stopped cleanly",
  });
  expect(client.stopCallCount).toBe(1);
});

test("checkReadiness normalizes client factory failures", async () => {
  const readiness = await checkCopilotReadiness({
    clientFactory: () => {
      throw new Error("client construction failed");
    },
  });

  expect(readiness).toMatchObject({
    provider: "copilot",
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary: "Copilot SDK client creation failed",
        detail: "client construction failed",
      },
    ],
  });
  expect(readiness.raw).toMatchObject({
    startupError: expect.any(Error),
  });
});

test("CopilotAdapter reports client factory failures through readiness", async () => {
  const adapter = new CopilotAdapter({
    clientFactory: () => {
      throw new Error("client construction failed");
    },
  });

  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    provider: "copilot",
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary: "Copilot SDK client creation failed",
        detail: "client construction failed",
      },
    ],
  });
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

test("checkReadiness times out status probe and stops owned clients", async () => {
  const client = new FakeCopilotClient({
    statusNeverResolves: true,
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
    readinessTimeoutMs: 0,
  });

  expect(readiness.status).toBe("error");
  expect(readiness.checks[0]).toMatchObject({
    kind: "runtime",
    status: "fail",
    summary: "Copilot SDK status probe failed",
  });
  expect(readiness.checks[0]?.detail).toContain(
    "runtime status probe timed out",
  );
  expect(readiness.checks.at(-1)).toMatchObject({
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

test("checkReadiness times out auth probe and stops owned clients", async () => {
  const client = new FakeCopilotClient({
    authStatusNeverResolves: true,
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
    readinessTimeoutMs: 0,
  });

  expect(readiness.status).toBe("error");
  expect(readiness.checks[1]).toMatchObject({
    kind: "auth",
    status: "fail",
    summary: "Copilot auth probe failed",
  });
  expect(readiness.checks[1]?.detail).toContain("auth probe timed out");
  expect(readiness.checks.at(-1)).toMatchObject({
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

test("checkReadiness force-stops owned clients when graceful cleanup times out", async () => {
  const client = new FakeCopilotClient({
    stopNeverResolves: true,
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
    readinessTimeoutMs: 0,
  });

  expect(readiness.status).toBe("degraded");
  expect(readiness.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "warn",
    summary: "Copilot SDK runtime cleanup timed out",
  });
  expect(readiness.checks.at(-1)?.detail).toContain("forceStop() completed");
  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(1);
  expect(readiness.raw).toMatchObject({
    cleanupErrors: [expect.any(Error)],
  });
});

test("checkReadiness reports force-stop timeouts as degraded diagnostics", async () => {
  const client = new FakeCopilotClient({
    forceStopNeverResolves: true,
    stopNeverResolves: true,
  });

  const readiness = await checkCopilotReadiness({
    clientFactory: () => client,
    readinessTimeoutMs: 0,
  });

  expect(readiness.status).toBe("degraded");
  expect(readiness.checks.at(-1)).toMatchObject({
    kind: "runtime",
    status: "warn",
    summary: "Copilot SDK runtime cleanup timed out and force stop failed",
  });
  expect(readiness.checks.at(-1)?.detail).toContain(
    "runtime force stop timed out",
  );
  expect(client.stopCallCount).toBe(1);
  expect(client.forceStopCallCount).toBe(1);
  expect(readiness.raw).toMatchObject({
    cleanupErrors: [expect.any(Error), expect.any(Error)],
  });
});

test("CopilotAdapter exposes readiness and creates or resumes fake-backed sessions", async () => {
  const adapter = new CopilotAdapter({
    clientFactory: () =>
      new FakeCopilotClient({
        createSessions: [new FakeCopilotSession("created-session")],
        resumeSessions: {
          "copilot-session": new FakeCopilotSession("copilot-session"),
        },
      }),
  });

  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    provider: "copilot",
    status: "ready",
  });

  const created = await adapter.createSession();

  expect(created.provider).toBe("copilot");
  expect(created.reference).toBeNull();

  const resumed = await adapter.resumeSession({
      provider: "copilot",
      sessionId: "copilot-session",
    });

  expect(resumed.reference).toEqual({
    provider: "copilot",
    sessionId: "copilot-session",
  });
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
