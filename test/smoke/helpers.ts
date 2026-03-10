import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider";
import type { ProviderReadinessStatus } from "../../src/core/readiness";
import type { SessionOptions } from "../../src/core/session";

const DEFAULT_SMOKE_PROVIDERS = new Set<ProviderId>(["claude", "codex"]);

export function shouldRunSmokeProvider(provider: ProviderId): boolean {
  if (process.env.CLAUDEX_SMOKE !== "1") {
    return false;
  }

  const configured = process.env.CLAUDEX_SMOKE_PROVIDERS?.trim();

  if (!configured) {
    return DEFAULT_SMOKE_PROVIDERS.has(provider);
  }

  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(provider);
}

export async function runSmokeScenario(params: {
  provider: ProviderId;
  createAdapter: () => AgentProviderAdapter;
  sessionOptions?: SessionOptions;
}): Promise<void> {
  const continuityToken = `claudex-smoke-${params.provider}-${crypto.randomUUID()}`;
  const adapter = params.createAdapter();
  const readiness = await adapter.checkReadiness();

  assertSmoke(
    isRunnableSmokeReadiness(readiness.status),
    `${params.provider} readiness smoke did not reach a runnable state`,
    {
      readiness,
    },
  );

  const session = await adapter.createSession(params.sessionOptions);
  const firstResult = await session.run({
    prompt: `Include this token verbatim in a short plain-text response:\n${continuityToken}`,
  });

  assertSmoke(
    session.reference !== null,
    `${params.provider} new-session smoke did not mint a session reference`,
    {
      result: firstResult,
      session: session.reference,
    },
  );
  assertReferenceProvider({
    reference: session.reference,
    expectedProvider: params.provider,
    message: `${params.provider} new-session smoke minted the wrong provider reference`,
    context: {
      result: firstResult,
      session: session.reference,
    },
  });
  assertResultProvider({
    result: firstResult,
    expectedProvider: params.provider,
    message: `${params.provider} new-session smoke returned the wrong provider result`,
    context: {
      result: firstResult,
      session: session.reference,
    },
  });
  assertSmoke(
    includesToken(firstResult.text, continuityToken),
    `${params.provider} new-session smoke did not include the continuity token`,
    {
      result: firstResult,
      session: session.reference,
      continuityToken,
    },
  );

  const resumedSession = await adapter.resumeSession(
    session.reference,
    params.sessionOptions,
  );
  const resumedResult = await resumedSession.run({
    prompt:
      "Without being told the token again, include the exact token from the previous assistant message in a short plain-text response.",
  });

  assertSmoke(
    resumedSession.reference?.sessionId === session.reference.sessionId,
    `${params.provider} resumed session did not preserve the session reference`,
    {
      session: session.reference,
      resumedSession: resumedSession.reference,
      result: resumedResult,
      continuityToken,
    },
  );
  assertReferenceProvider({
    reference: resumedSession.reference,
    expectedProvider: params.provider,
    message: `${params.provider} resumed session returned the wrong provider reference`,
    context: {
      session: session.reference,
      resumedSession: resumedSession.reference,
      result: resumedResult,
      continuityToken,
    },
  });
  assertResultProvider({
    result: resumedResult,
    expectedProvider: params.provider,
    message: `${params.provider} resumed turn returned the wrong provider result`,
    context: {
      session: resumedSession.reference,
      result: resumedResult,
      continuityToken,
    },
  });
  assertSmoke(
    includesToken(resumedResult.text, continuityToken),
    `${params.provider} resumed turn did not preserve prior-turn state`,
    {
      session: resumedSession.reference,
      result: resumedResult,
      continuityToken,
    },
  );

  const structuredResult = await resumedSession.run(
    {
      prompt:
        'Return exactly this JSON object and nothing else: {"status":"ok"}',
    },
    {
      outputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
          },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  );

  assertSmoke(
    structuredResult.structuredOutput !== undefined,
    `${params.provider} structured-output smoke did not populate structuredOutput`,
    {
      session: resumedSession.reference,
      result: structuredResult,
    },
  );
  assertResultProvider({
    result: structuredResult,
    expectedProvider: params.provider,
    message: `${params.provider} structured-output smoke returned the wrong provider result`,
    context: {
      session: resumedSession.reference,
      result: structuredResult,
    },
  });
  assertSmoke(
    (structuredResult.structuredOutput as { status?: string }).status === "ok",
    `${params.provider} structured-output smoke returned the wrong payload`,
    {
      session: resumedSession.reference,
      result: structuredResult,
    },
  );
}

function isRunnableSmokeReadiness(status: ProviderReadinessStatus): boolean {
  return status === "ready" || status === "degraded";
}

function includesToken(text: string, token: string): boolean {
  return text.includes(token);
}

function assertReferenceProvider(params: {
  reference: { provider: ProviderId } | null;
  expectedProvider: ProviderId;
  message: string;
  context: unknown;
}): void {
  assertSmoke(
    params.reference?.provider === params.expectedProvider,
    params.message,
    params.context,
  );
}

function assertResultProvider(params: {
  result: { provider: ProviderId; session: { provider: ProviderId } | null };
  expectedProvider: ProviderId;
  message: string;
  context: unknown;
}): void {
  assertSmoke(
    params.result.provider === params.expectedProvider,
    params.message,
    params.context,
  );

  if (params.result.session) {
    assertSmoke(
      params.result.session.provider === params.expectedProvider,
      `${params.message} (session provider mismatch)`,
      params.context,
    );
  }
}

function assertSmoke(
  condition: unknown,
  message: string,
  context: unknown,
): asserts condition {
  if (!condition) {
    throw new Error(`${message}\n${formatSmokeContext(context)}`);
  }
}

function formatSmokeContext(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, candidate) => {
      if (candidate instanceof Error) {
        return {
          name: candidate.name,
          message: candidate.message,
          stack: candidate.stack,
          cause: candidate.cause,
        };
      }

      return candidate;
    },
    2,
  );
}
