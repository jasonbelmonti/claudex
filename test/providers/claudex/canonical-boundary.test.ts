import { expect, test } from "#test-support";

import type { ProviderCapabilities } from "../../../src/core/capabilities.js";
import { AgentError } from "../../../src/core/errors.js";
import type { AgentEvent } from "../../../src/core/events.js";
import type { AgentProviderAdapter } from "../../../src/core/provider.js";
import type { ProviderReadiness } from "../../../src/core/readiness.js";
import type { TurnResult } from "../../../src/core/results.js";
import type { AgentSession } from "../../../src/core/session.js";
import { ClaudexAdapter } from "../../../src/providers/claudex/adapter.js";
import { ProviderIdentityConflictError } from "../../../src/providers/claudex/provider-identity.js";

test("resolved metadata remains canonical after provider-owned values mutate", async () => {
  const adapterCapabilities = structuredCapabilities();
  const readinessCapabilities = structuredCapabilities();
  const readiness: ProviderReadiness = {
    provider: "codex",
    status: "ready",
    checks: [],
    capabilities: readinessCapabilities,
  };
  const adapter = createAdapter({
    adapterCapabilities,
    readiness,
    session: stableSession(adapterCapabilities),
  });
  const composite = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: { codex: adapter },
  });

  const resolved = await composite.resolve({
    requiredCapabilities: ["output:structured"],
  });

  readiness.provider = "claude";
  readinessCapabilities.provider = "claude";
  const structuredOutput =
    readinessCapabilities.features["output:structured"];
  if (structuredOutput) {
    structuredOutput.available = false;
  }

  expect(resolved.provider).toBe("codex");
  expect(resolved.readiness.provider).toBe("codex");
  expect(resolved.capabilities.provider).toBe("codex");
  expect(
    resolved.capabilities.features["output:structured"]?.available,
  ).toBe(true);
  expect(Object.isFrozen(resolved.readiness)).toBe(true);
  expect(Object.isFrozen(resolved.capabilities)).toBe(true);
  expect(
    Object.isFrozen(
      resolved.capabilities.features["output:structured"],
    ),
  ).toBe(true);
  await expect(resolved.createSession()).resolves.toMatchObject({
    provider: "codex",
  });
});

test("guarded sessions canonicalize changing result and event identities", async () => {
  const capabilities = structuredCapabilities();
  let resultProviderReads = 0;
  let eventProviderReads = 0;
  const result = {
    get provider() {
      resultProviderReads += 1;
      return resultProviderReads === 1 ? "codex" : "claude";
    },
    session: null,
    text: "complete",
    usage: null,
  } as TurnResult;
  const event = {
    type: "status",
    get provider() {
      eventProviderReads += 1;
      return eventProviderReads === 1 ? "codex" : "claude";
    },
    session: null,
    status: "working",
  } as AgentEvent;
  const session: AgentSession = {
    provider: "codex",
    capabilities,
    reference: null,
    async run() {
      return result;
    },
    async *runStreamed() {
      yield event;
    },
  };
  const composite = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        adapterCapabilities: capabilities,
        readiness: {
          provider: "codex",
          status: "ready",
          checks: [],
          capabilities,
        },
        session,
      }),
    },
  });
  const resolved = await composite.resolve({
    requiredCapabilities: ["output:structured"],
  });
  const guarded = await resolved.createSession();

  const returnedResult = await guarded.run({ prompt: "fixture" });
  const returnedEvents: AgentEvent[] = [];
  for await (const returnedEvent of guarded.runStreamed({
    prompt: "fixture",
  })) {
    returnedEvents.push(returnedEvent);
  }

  expect(returnedResult.provider).toBe("codex");
  expect(returnedEvents).toHaveLength(1);
  expect(returnedEvents[0]?.provider).toBe("codex");
  expect(Object.isFrozen(returnedResult)).toBe(true);
  expect(Object.isFrozen(returnedEvents[0])).toBe(true);
});

test.each([
  {
    expectedSource: "terminal_result",
    terminalType: "turn.completed",
  },
  {
    expectedSource: "terminal_error",
    terminalType: "turn.failed",
  },
] as const)(
  "guarded sessions use one $terminalType discriminant snapshot",
  async ({ expectedSource, terminalType }) => {
    const capabilities = structuredCapabilities();
    let typeReads = 0;
    const event = {
      get type() {
        typeReads += 1;
        return typeReads === 1 ? terminalType : "status";
      },
      provider: "codex",
      session: null,
      status: "working",
      result: {
        provider: "claude",
        session: null,
        text: "wrong provider",
        usage: null,
      },
      error: new AgentError({
        code: "provider_failure",
        provider: "claude",
        message: "wrong provider",
      }),
    } as unknown as AgentEvent;
    const session: AgentSession = {
      provider: "codex",
      capabilities,
      reference: null,
      async run() {
        return {
          provider: "codex",
          session: null,
          text: "complete",
          usage: null,
        };
      },
      async *runStreamed() {
        yield event;
      },
    };
    const composite = new ClaudexAdapter({
      preferredProviders: ["codex"],
      providers: {
        codex: createAdapter({
          adapterCapabilities: capabilities,
          readiness: {
            provider: "codex",
            status: "ready",
            checks: [],
            capabilities,
          },
          session,
        }),
      },
    });
    const resolved = await composite.resolve({
      requiredCapabilities: ["output:structured"],
    });
    const guarded = await resolved.createSession();

    const error = await captureStreamFailure(guarded);

    expect(error).toBeInstanceOf(ProviderIdentityConflictError);
    expect(error).toMatchObject({
      conflict: {
        observedProvider: "claude",
        observedSource: expectedSource,
        resolvedProvider: "codex",
      },
    });
    expect(typeReads).toBe(1);
  },
);

test("matching typed errors preserve reference identity with a pinned provider", async () => {
  const capabilities = structuredCapabilities();
  const providerError = new AgentError({
    code: "provider_failure",
    provider: "codex",
    message: "fixture failure",
  });
  const session: AgentSession = {
    provider: "codex",
    capabilities,
    reference: null,
    async run() {
      throw providerError;
    },
    async *runStreamed() {},
  };
  const composite = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        adapterCapabilities: capabilities,
        readiness: {
          provider: "codex",
          status: "ready",
          checks: [],
          capabilities,
        },
        session,
      }),
    },
  });
  const resolved = await composite.resolve({
    requiredCapabilities: ["output:structured"],
  });
  const guarded = await resolved.createSession();

  await expect(guarded.run({ prompt: "fixture" })).rejects.toBe(
    providerError,
  );
  expect(Object.getOwnPropertyDescriptor(providerError, "provider")).toMatchObject(
    {
      configurable: false,
      value: "codex",
      writable: false,
    },
  );
});

async function captureStreamFailure(
  session: AgentSession,
): Promise<unknown> {
  try {
    for await (const _event of session.runStreamed({
      prompt: "fixture",
    })) {
      // A contradictory terminal payload must fail before it is yielded.
    }
  } catch (error) {
    return error;
  }

  throw new Error("Expected the streamed turn to fail.");
}

function createAdapter(params: {
  adapterCapabilities: ProviderCapabilities;
  readiness: ProviderReadiness;
  session: AgentSession;
}): AgentProviderAdapter {
  return {
    provider: "codex",
    capabilities: params.adapterCapabilities,
    async checkReadiness() {
      return params.readiness;
    },
    async createSession() {
      return params.session;
    },
    async resumeSession() {
      return params.session;
    },
  };
}

function stableSession(
  capabilities: ProviderCapabilities,
): AgentSession {
  return {
    provider: "codex",
    capabilities,
    reference: null,
    async run() {
      return {
        provider: "codex",
        session: null,
        text: "complete",
        usage: null,
      };
    },
    async *runStreamed() {},
  };
}

function structuredCapabilities(): ProviderCapabilities {
  return {
    provider: "codex",
    features: {
      "output:structured": { available: true },
    },
  };
}
