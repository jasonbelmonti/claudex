import { expect, test } from "#test-support";

import { AgentError } from "../../../src/core/errors.js";
import type { ProviderCapabilities } from "../../../src/core/capabilities.js";
import type { AgentEvent } from "../../../src/core/events.js";
import type { TurnInput, TurnOptions } from "../../../src/core/input.js";
import type {
  AgentProviderAdapter,
  ProviderId,
} from "../../../src/core/provider.js";
import type { ProviderReadiness } from "../../../src/core/readiness.js";
import type { TurnResult } from "../../../src/core/results.js";
import type {
  AgentSession,
  SessionReference,
} from "../../../src/core/session.js";
import { ClaudexAdapter } from "../../../src/providers/claudex/adapter.js";
import {
  ProviderIdentityConflictError,
  type ProviderIdentitySource,
} from "../../../src/providers/claudex/provider-identity.js";
import { ProviderResolutionError } from "../../../src/providers/claudex/provider-resolution-error.js";
import { resolveProviderBoundary } from "../../../src/providers/claudex/resolved-provider-resolution.js";

const providerPairs = [
  ["codex", "claude"],
  ["claude", "codex"],
] as const satisfies readonly (readonly [ProviderId, ProviderId])[];

test("resolve admits only declared readiness statuses and capabilities", async () => {
  const calls = {
    codex: { readiness: 0, session: 0 },
    claude: { readiness: 0, session: 0 },
  };
  const adapter = new ClaudexAdapter({
    providers: {
      codex: createAdapter({
        calls: calls.codex,
        provider: "codex",
        readiness: readiness("codex", "ready", false),
      }),
      claude: createAdapter({
        calls: calls.claude,
        provider: "claude",
        readiness: readiness("claude", "ready", true),
      }),
    },
  });

  const resolved = await adapter.resolve({
    allowedStatuses: ["ready"],
    requiredCapabilities: ["output:structured"],
  });
  const session = await resolved.createSession();

  expect(resolved.provider).toBe("claude");
  expect(resolved.readiness.provider).toBe("claude");
  expect(resolved.capabilities.provider).toBe("claude");
  expect(resolved.probes.map(({ provider, status }) => ({ provider, status }))).toEqual([
    { provider: "codex", status: "ready" },
    { provider: "claude", status: "ready" },
  ]);
  expect(session.provider).toBe("claude");
  expect(calls).toEqual({
    codex: { readiness: 1, session: 0 },
    claude: { readiness: 1, session: 1 },
  });
});

test("resolve is strict-ready by default but can explicitly admit degraded", async () => {
  const strictCalls = { readiness: 0, session: 0 };
  const strict = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        calls: strictCalls,
        provider: "codex",
        readiness: readiness("codex", "degraded", true),
      }),
    },
  });

  await expect(strict.resolve()).rejects.toMatchObject({
    code: "provider_failure",
    provider: "codex",
    details: {
      allowedStatuses: ["ready"],
      stage: "readiness",
    },
  });
  expect(strictCalls.session).toBe(0);

  const degradedCalls = { readiness: 0, session: 0 };
  const degraded = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        calls: degradedCalls,
        provider: "codex",
        readiness: readiness("codex", "degraded", true),
      }),
    },
  });

  const resolved = await degraded.resolve({
    allowedStatuses: ["degraded"],
    requiredCapabilities: ["output:structured"],
  });
  await resolved.createSession();

  expect(resolved.provider).toBe("codex");
  expect(degradedCalls.session).toBe(1);
});

test("resolve rejects missing required capabilities before session creation", async () => {
  const calls = { readiness: 0, session: 0 };
  const adapter = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        calls,
        provider: "codex",
        readiness: readiness("codex", "ready", false),
      }),
    },
  });

  const error = await captureRejection(
    adapter.resolve({
      requiredCapabilities: ["output:structured"],
    }),
  );

  expect(error).toBeInstanceOf(ProviderResolutionError);
  expect(error).toMatchObject({
    code: "unsupported_feature",
    provider: "codex",
    details: {
      missingCapabilities: ["output:structured"],
      requiredCapabilities: ["output:structured"],
      stage: "readiness",
    },
  });
  if (error instanceof ProviderResolutionError) {
    expect(error.probes).toEqual([
      {
        provider: "codex",
        status: "ready",
        checks: [],
      },
    ]);
    expect(error.missingCapabilities).toEqual([
      "output:structured",
    ]);
  }
  expect(calls.session).toBe(0);
});

test("legacy createSession still admits degraded providers", async () => {
  const calls = { readiness: 0, session: 0 };
  const adapter = new ClaudexAdapter({
    preferredProviders: ["codex"],
    providers: {
      codex: createAdapter({
        calls,
        provider: "codex",
        readiness: readiness("codex", "degraded", true),
      }),
    },
  });

  await expect(adapter.createSession()).resolves.toMatchObject({
    provider: "codex",
  });
  expect(calls.session).toBe(1);
});

test("resolution exceptions remain bounded probes and do not abort fallback", async () => {
  const secret = `npm_${"a".repeat(32)}`;
  const codex = createAdapter({
    calls: { readiness: 0, session: 0 },
    provider: "codex",
    readiness: readiness("codex", "ready", true),
  });

  const resolved = await resolveProviderBoundary({
    getAdapter: async (provider) => {
      if (provider === "copilot") {
        throw new Error(
          `adapter prompt=SECRET_PROMPT response=SECRET_RESPONSE token=${secret}`,
        );
      }
      if (provider === "claude") {
        return {
          ...createAdapter({
            calls: { readiness: 0, session: 0 },
            provider: "claude",
            readiness: readiness("claude", "error", true),
          }),
          async checkReadiness() {
            throw new AgentError({
              code: "provider_failure",
              provider: "claude",
              message: `readiness credential=${secret}`,
              raw: {
                prompt: "SECRET_PROMPT",
                response: "SECRET_RESPONSE",
              },
            });
          },
        };
      }
      return codex;
    },
    options: {
      allowedStatuses: ["ready"],
      requiredCapabilities: ["output:structured"],
    },
    preferredProviders: ["copilot", "claude", "codex"],
  });

  expect(resolved.readiness.provider).toBe("codex");
  expect(resolved.probes).toHaveLength(3);
  expect(resolved.probes[0]).toEqual({
    provider: "copilot",
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary: "copilot adapter construction failed",
      },
    ],
  });
  expect(resolved.probes[1]).toEqual({
    provider: "claude",
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary: "claude readiness check failed",
      },
    ],
  });

  const serialized = JSON.stringify(resolved.probes);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain("SECRET_PROMPT");
  expect(serialized).not.toContain("SECRET_RESPONSE");
  expect(serialized).not.toContain("raw");
  expect(serialized).not.toContain("detail");
});

test.each(providerPairs)(
  "resolved sessions preserve matching %s identity",
  async (provider) => {
    const calls = { readiness: 0, session: 0 };
    const adapter = new ClaudexAdapter({
      preferredProviders: [provider],
      providers: {
        [provider]: createAdapter({
          calls,
          provider,
          readiness: readiness(provider, "ready", true),
        }),
      },
    });

    const resolved = await adapter.resolve({
      requiredCapabilities: ["output:structured"],
    });
    const session = await resolved.createSession();
    const result = await session.run({ prompt: "fixture" });
    const events: AgentEvent[] = [];
    for await (const event of session.runStreamed({ prompt: "fixture" })) {
      events.push(event);
    }

    expect(result.provider).toBe(provider);
    expect(result.session?.provider).toBe(provider);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider,
      result: { provider },
      type: "turn.completed",
    });
  },
);

const identitySources = [
  "adapter",
  "adapter_capabilities",
  "readiness",
  "readiness_capabilities",
  "session",
  "session_capabilities",
  "session_reference",
  "result",
  "result_session",
  "error",
  "event",
  "event_session",
  "event_reference",
  "terminal_result",
  "terminal_result_session",
  "terminal_error",
] as const satisfies readonly ProviderIdentitySource[];

test.each(
  providerPairs.flatMap(([resolvedProvider, observedProvider]) =>
    identitySources.map((source) => ({
      observedProvider,
      resolvedProvider,
      source,
    })),
  ),
)(
  "identity conflict rejects $source drift from $resolvedProvider to $observedProvider",
  async ({ observedProvider, resolvedProvider, source }) => {
    const cause = new AgentError({
      code: "provider_failure",
      provider: observedProvider,
      message: "typed fixture failure",
    });
    const adapter = new ClaudexAdapter({
      preferredProviders: [resolvedProvider],
      providers: {
        [resolvedProvider]: identityAdapter({
          cause,
          observedProvider,
          resolvedProvider,
          source,
        }),
      },
    });

    const error = await captureIdentityConflict(async () => {
      const resolved = await adapter.resolve({
        requiredCapabilities: ["output:structured"],
      });
      const session = await resolved.createSession();

      if (isStreamSource(source)) {
        for await (const _event of session.runStreamed({ prompt: "fixture" })) {
          // The guard must reject before a conflicting event reaches the caller.
        }
        return;
      }

      await session.run({ prompt: "fixture" });
    });

    expect(error).toBeInstanceOf(ProviderIdentityConflictError);
    expect(error.conflict).toEqual({
      observedProvider,
      observedSource: source,
      resolvedProvider,
    });
    if (source === "error" || source === "terminal_error") {
      expect(error.cause).toBe(cause);
    }
    expect("provider" in error).toBe(false);
  },
);

function createAdapter(params: {
  calls: { readiness: number; session: number };
  provider: ProviderId;
  readiness: ProviderReadiness;
}): AgentProviderAdapter {
  const provider = params.provider;
  const capabilities = params.readiness.capabilities;

  return {
    provider,
    capabilities,
    async checkReadiness() {
      params.calls.readiness += 1;
      return params.readiness;
    },
    async createSession() {
      params.calls.session += 1;
      return matchingSession(provider, capabilities);
    },
    async resumeSession(reference) {
      return matchingSession(provider, capabilities, reference);
    },
  };
}

function matchingSession(
  provider: ProviderId,
  capabilities = providerCapabilities(provider, true),
  initialReference: SessionReference | null = {
    provider,
    sessionId: `${provider}-session`,
  },
): AgentSession {
  return {
    provider,
    capabilities,
    reference: initialReference,
    async run() {
      return result(provider, initialReference);
    },
    async *runStreamed() {
      yield {
        type: "turn.completed",
        provider,
        session: initialReference,
        result: result(provider, initialReference),
      };
    },
  };
}

function identityAdapter(params: {
  cause: AgentError;
  observedProvider: ProviderId;
  resolvedProvider: ProviderId;
  source: ProviderIdentitySource;
}): AgentProviderAdapter {
  const adapterProvider =
    params.source === "adapter"
      ? params.observedProvider
      : params.resolvedProvider;
  const adapterCapabilities = providerCapabilities(
    params.source === "adapter_capabilities"
      ? params.observedProvider
      : params.resolvedProvider,
    true,
  );

  return {
    provider: adapterProvider,
    capabilities: adapterCapabilities,
    async checkReadiness() {
      return {
        provider:
          params.source === "readiness"
            ? params.observedProvider
            : params.resolvedProvider,
        status: "ready",
        checks: [],
        capabilities: providerCapabilities(
          params.source === "readiness_capabilities"
            ? params.observedProvider
            : params.resolvedProvider,
          true,
        ),
      };
    },
    async createSession() {
      return identitySession(params);
    },
    async resumeSession() {
      return identitySession(params);
    },
  };
}

function identitySession(params: {
  cause: AgentError;
  observedProvider: ProviderId;
  resolvedProvider: ProviderId;
  source: ProviderIdentitySource;
}): AgentSession {
  const matchingReference = {
    provider: params.resolvedProvider,
    sessionId: `${params.resolvedProvider}-session`,
  };
  let currentReference: SessionReference | null = matchingReference;
  const session = {
    provider:
      params.source === "session"
        ? params.observedProvider
        : params.resolvedProvider,
    capabilities: providerCapabilities(
      params.source === "session_capabilities"
        ? params.observedProvider
        : params.resolvedProvider,
      true,
    ),
    get reference() {
      return currentReference;
    },
    async run(_input: TurnInput, _options?: TurnOptions) {
      if (params.source === "error") {
        throw params.cause;
      }
      const turnResult = result(
        params.source === "result"
          ? params.observedProvider
          : params.resolvedProvider,
        params.source === "result_session"
          ? {
              provider: params.observedProvider,
              sessionId: `${params.observedProvider}-session`,
            }
          : matchingReference,
      );
      if (params.source === "session_reference") {
        currentReference = {
          provider: params.observedProvider,
          sessionId: `${params.observedProvider}-dynamic`,
        };
      }
      return turnResult;
    },
    async *runStreamed(
      _input: TurnInput,
      _options?: TurnOptions,
    ): AsyncGenerator<AgentEvent> {
      yield streamEvent(params, matchingReference);
    },
  };
  return session;
}

function streamEvent(
  params: {
    cause: AgentError;
    observedProvider: ProviderId;
    resolvedProvider: ProviderId;
    source: ProviderIdentitySource;
  },
  matchingReference: SessionReference,
): AgentEvent {
  if (params.source === "event_reference") {
    return {
      type: "session.started",
      provider: params.resolvedProvider,
      session: matchingReference,
      reference: {
        provider: params.observedProvider,
        sessionId: `${params.observedProvider}-event`,
      },
    };
  }
  if (params.source === "terminal_error") {
    return {
      type: "turn.failed",
      provider: params.resolvedProvider,
      session: matchingReference,
      error: params.cause,
    };
  }

  return {
    type: "turn.completed",
    provider:
      params.source === "event"
        ? params.observedProvider
        : params.resolvedProvider,
    session:
      params.source === "event_session"
        ? {
            provider: params.observedProvider,
            sessionId: `${params.observedProvider}-event`,
          }
        : matchingReference,
    result: result(
      params.source === "terminal_result"
        ? params.observedProvider
        : params.resolvedProvider,
      params.source === "terminal_result_session"
        ? {
            provider: params.observedProvider,
            sessionId: `${params.observedProvider}-terminal`,
          }
        : matchingReference,
    ),
  };
}

function readiness(
  provider: ProviderId,
  status: ProviderReadiness["status"],
  structuredOutput: boolean,
): ProviderReadiness {
  return {
    provider,
    status,
    checks: [],
    capabilities: providerCapabilities(provider, structuredOutput),
  };
}

function providerCapabilities(
  provider: ProviderId,
  structuredOutput: boolean,
): ProviderCapabilities {
  return {
    provider,
    features: {
      "output:structured": { available: structuredOutput },
    },
  };
}

function result(
  provider: ProviderId,
  session: SessionReference | null,
): TurnResult {
  return {
    provider,
    session,
    text: "ok",
    structuredOutput: {},
    usage: null,
  };
}

function isStreamSource(source: ProviderIdentitySource): boolean {
  return (
    source === "event" ||
    source === "event_session" ||
    source === "event_reference" ||
    source === "terminal_result" ||
    source === "terminal_result_session" ||
    source === "terminal_error"
  );
}

async function captureIdentityConflict(
  operation: () => Promise<void>,
): Promise<ProviderIdentityConflictError> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ProviderIdentityConflictError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected provider identity conflict.");
}

async function captureRejection(
  promise: Promise<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected rejection.");
}
