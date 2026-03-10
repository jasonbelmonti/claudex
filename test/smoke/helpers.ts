import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider";
import type { ProviderReadinessStatus } from "../../src/core/readiness";
import type { AgentSession, SessionOptions } from "../../src/core/session";
import type { AgentEvent } from "../../src/core/events";
import type { TurnInput } from "../../src/core/input";
import type { TurnResult } from "../../src/core/results";
import { isDeepStrictEqual } from "node:util";

const SMOKE_TOKEN_PATTERN = /\bsmoke-[0-9a-f]{8}\b/i;

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
  const firstTurn = await runSmokeStreamedTurn({
    session,
    provider: params.provider,
    input: {
      prompt:
        "Invent a unique lowercase token in the format smoke-[8 hex chars] and reply with only that token.",
    },
    expectSessionStarted: true,
    label: `${params.provider} new-session streamed turn`,
  });
  const firstResult = firstTurn.result;
  const continuityToken = extractSmokeToken(firstResult.text);

  assertSmoke(
    session.reference !== null,
    `${params.provider} new-session smoke did not mint a session reference`,
    {
      result: firstResult,
      session: session.reference,
    },
  );
  assertSmoke(
    continuityToken !== null,
    `${params.provider} new-session smoke did not return a valid continuity token`,
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
    continuityToken !== null && includesToken(firstResult.text, continuityToken),
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
  const resumedTurn = await runSmokeStreamedTurn({
    session: resumedSession,
    provider: params.provider,
    input: {
      prompt:
        "Without inventing a new token, repeat exactly the token from your previous assistant message.",
    },
    expectSessionStarted: false,
    label: `${params.provider} resumed streamed turn`,
  });
  const resumedResult = resumedTurn.result;
  const resumedToken = extractSmokeToken(resumedResult.text);

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
    continuityToken !== null && resumedToken === continuityToken,
    `${params.provider} resumed turn did not preserve prior-turn state`,
    {
      session: resumedSession.reference,
      result: resumedResult,
      continuityToken,
      resumedToken,
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

function extractSmokeToken(text: string): string | null {
  const match = text.match(SMOKE_TOKEN_PATTERN);
  return match?.[0].toLowerCase() ?? null;
}

async function runSmokeStreamedTurn(params: {
  session: AgentSession;
  provider: ProviderId;
  input: TurnInput;
  expectSessionStarted: boolean;
  label: string;
}): Promise<{ events: AgentEvent[]; result: TurnResult }> {
  const events: AgentEvent[] = [];

  for await (const event of params.session.runStreamed(params.input)) {
    events.push(event);
  }

  assertSmoke(
    countTerminalEvents(events) === 1,
    `${params.provider} smoke stream emitted the wrong number of terminal events`,
    {
      label: params.label,
      events,
    },
  );

  const terminalEvent = getTerminalEvent(events);

  assertSmoke(
    terminalEvent?.type === "turn.completed",
    `${params.provider} smoke stream did not complete successfully`,
    {
      label: params.label,
      events,
    },
  );

  assertSmokeEventProviders({
    events,
    expectedProvider: params.provider,
    label: params.label,
  });
  assertSmokeTurnStarted({
    events,
    expectedInput: params.input,
    label: params.label,
  });

  if (params.expectSessionStarted) {
    assertSmokeSessionStarted({
      events,
      label: params.label,
    });
  }

  assertResultProvider({
    result: terminalEvent.result,
    expectedProvider: params.provider,
    message: `${params.provider} smoke stream returned the wrong provider result`,
    context: {
      label: params.label,
      events,
      result: terminalEvent.result,
    },
  });

  return {
    events,
    result: terminalEvent.result,
  };
}

function countTerminalEvents(events: AgentEvent[]): number {
  return events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  ).length;
}

function getTerminalEvent(events: AgentEvent[]): AgentEvent | undefined {
  return events.findLast(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );
}

function assertSmokeEventProviders(params: {
  events: AgentEvent[];
  expectedProvider: ProviderId;
  label: string;
}): void {
  for (const event of params.events) {
    assertSmoke(
      event.provider === params.expectedProvider,
      `${params.expectedProvider} smoke stream emitted the wrong provider on an event`,
      {
        label: params.label,
        events: params.events,
      },
    );

    if (event.session) {
      assertSmoke(
        event.session.provider === params.expectedProvider,
        `${params.expectedProvider} smoke stream emitted the wrong provider on an event session`,
        {
          label: params.label,
          events: params.events,
        },
      );
    }

    if (event.type === "session.started") {
      assertSmoke(
        event.reference.provider === params.expectedProvider,
        `${params.expectedProvider} smoke stream emitted the wrong provider on session.started`,
        {
          label: params.label,
          events: params.events,
        },
      );
    }
  }
}

function assertSmokeTurnStarted(params: {
  events: AgentEvent[];
  expectedInput: TurnInput;
  label: string;
}): void {
  const turnStartedEvents = params.events.filter(
    (event): event is Extract<AgentEvent, { type: "turn.started" }> =>
      event.type === "turn.started",
  );
  const terminalIndex = params.events.findIndex(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );
  const turnStartedIndex = params.events.findIndex((event) => event.type === "turn.started");

  assertSmoke(
    turnStartedEvents.length === 1,
    `${params.label} emitted the wrong number of turn.started events`,
    {
      label: params.label,
      events: params.events,
    },
  );
  assertSmoke(
    turnStartedIndex >= 0 && turnStartedIndex < terminalIndex,
    `${params.label} emitted turn.started out of order`,
    {
      label: params.label,
      events: params.events,
    },
  );
  assertSmoke(
    isDeepStrictEqual(turnStartedEvents[0]?.input, params.expectedInput),
    `${params.label} did not preserve input on turn.started`,
    {
      label: params.label,
      events: params.events,
      expectedInput: params.expectedInput,
    },
  );
}

function assertSmokeSessionStarted(params: {
  events: AgentEvent[];
  label: string;
}): void {
  const sessionStartedEvents = params.events.filter(
    (event): event is Extract<AgentEvent, { type: "session.started" }> =>
      event.type === "session.started",
  );
  const sessionStartedIndex = params.events.findIndex(
    (event) => event.type === "session.started",
  );
  const turnStartedIndex = params.events.findIndex((event) => event.type === "turn.started");

  assertSmoke(
    sessionStartedEvents.length === 1,
    `${params.label} emitted the wrong number of session.started events`,
    {
      label: params.label,
      events: params.events,
    },
  );
  assertSmoke(
    sessionStartedIndex >= 0 && sessionStartedIndex < turnStartedIndex,
    `${params.label} emitted session.started out of order`,
    {
      label: params.label,
      events: params.events,
    },
  );
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
