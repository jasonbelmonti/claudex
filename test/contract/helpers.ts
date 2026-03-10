import type { AgentEvent } from "../../src/core/events";
import type { AgentError } from "../../src/core/errors";
import type { ProviderId } from "../../src/core/provider";
import type { TurnResult } from "../../src/core/results";
import type { SessionReference } from "../../src/core/session";

export async function collectEvents(
  stream: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

export function assertWithContext(
  condition: unknown,
  message: string,
  context: unknown,
): asserts condition {
  if (!condition) {
    throw new Error(`${message}\n${formatDiagnostic(context)}`);
  }
}

export function countTerminalEvents(events: AgentEvent[]): number {
  return events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  ).length;
}

export function getTerminalEvent(events: AgentEvent[]): AgentEvent | undefined {
  return events.findLast(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );
}

export function assertEventProvidersMatch(params: {
  events: AgentEvent[];
  expectedProvider: ProviderId;
  label: string;
}): void {
  const { events, expectedProvider, label } = params;

  for (const event of events) {
    assertWithContext(
      event.provider === expectedProvider,
      "Streamed events must preserve the originating provider ID.",
      buildContractContext({
        label,
        events,
      }),
    );

    if (event.session) {
      assertWithContext(
        event.session.provider === expectedProvider,
        "Event session references must preserve the originating provider ID.",
        buildContractContext({
          label,
          events,
        }),
      );
    }

    if (event.type === "session.started") {
      assertWithContext(
        event.reference.provider === expectedProvider,
        "session.started must expose the originating provider ID.",
        buildContractContext({
          label,
          events,
        }),
      );
    }
  }
}

export function assertEventSessionsMatch(params: {
  events: AgentEvent[];
  expectedSession: SessionReference;
  label: string;
}): void {
  const { events, expectedSession, label } = params;

  assertEventProvidersMatch({
    events,
    expectedProvider: expectedSession.provider,
    label,
  });

  for (const event of events) {
    assertWithContext(
      event.session?.provider === expectedSession.provider &&
        event.session?.sessionId === expectedSession.sessionId,
      "Streamed events must carry the active session reference consistently.",
      buildContractContext({
        label,
        events,
      }),
    );

    if (event.type === "session.started") {
      assertWithContext(
        event.reference.provider === expectedSession.provider &&
          event.reference.sessionId === expectedSession.sessionId,
        "session.started must expose the minted session reference.",
        buildContractContext({
          label,
          events,
        }),
      );
    }
  }
}

export function assertTurnResultProvider(params: {
  result: TurnResult;
  expectedProvider: ProviderId;
  label: string;
}): void {
  const { result, expectedProvider, label } = params;

  assertWithContext(
    result.provider === expectedProvider,
    "TurnResult must preserve the originating provider ID.",
    buildContractContext({
      label,
      result,
    }),
  );

  if (result.session) {
    assertWithContext(
      result.session.provider === expectedProvider,
      "TurnResult session references must preserve the originating provider ID.",
      buildContractContext({
        label,
        result,
      }),
    );
  }
}

export function assertAgentErrorProvider(params: {
  error: AgentError;
  expectedProvider: ProviderId;
  label: string;
}): void {
  const { error, expectedProvider, label } = params;

  assertWithContext(
    error.provider === expectedProvider,
    "AgentError must preserve the originating provider ID.",
    buildContractContext({
      label,
      error,
    }),
  );
}

export function buildContractContext(params: {
  label: string;
  events?: AgentEvent[];
  result?: TurnResult;
  error?: unknown;
}): Record<string, unknown> {
  return {
    label: params.label,
    events: params.events?.map((event) => ({
      type: event.type,
      session: event.session,
      raw: event.raw,
      extensions: event.extensions,
      event,
    })),
    result: params.result,
    error: params.error,
  };
}

function formatDiagnostic(value: unknown): string {
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
