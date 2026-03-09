import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider";
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
    readiness.status === "ready",
    `${params.provider} readiness smoke failed`,
    {
      readiness,
    },
  );

  const session = await adapter.createSession(params.sessionOptions);
  const firstResult = await session.run({
    prompt: `Reply with exactly this token and nothing else:\n${continuityToken}\nDo not use quotes or code fences.`,
  });

  assertSmoke(
    session.reference !== null,
    `${params.provider} new-session smoke did not mint a session reference`,
    {
      result: firstResult,
      session: session.reference,
    },
  );
  assertSmoke(
    firstResult.text.trim() === continuityToken,
    `${params.provider} new-session smoke did not echo the continuity token`,
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
      "Without being told the token again, reply with exactly the same token from the previous assistant message. Do not use quotes or code fences.",
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
  assertSmoke(
    resumedResult.text.trim() === continuityToken,
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
  assertSmoke(
    (structuredResult.structuredOutput as { status?: string }).status === "ok",
    `${params.provider} structured-output smoke returned the wrong payload`,
    {
      session: resumedSession.reference,
      result: structuredResult,
    },
  );
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
