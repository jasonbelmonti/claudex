import { isDeepStrictEqual } from "node:util";

import type { AgentEvent } from "../../src/core/events";
import type { AgentError } from "../../src/core/errors";
import type { TurnInput } from "../../src/core/input";
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

export function assertTurnStartedEvent(params: {
  events: AgentEvent[];
  expectedInput: TurnInput;
  label: string;
}): void {
  const { events, expectedInput, label } = params;
  const turnStartedIndices = events.flatMap((event, index) =>
    event.type === "turn.started" ? [index] : [],
  );
  const terminalIndex = events.findIndex(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );
  const turnStartedIndex = turnStartedIndices[0];
  const turnStartedEvent = events.find(
    (
      event,
    ): event is Extract<AgentEvent, { type: "turn.started" }> =>
      event.type === "turn.started",
  );

  assertWithContext(
    turnStartedIndices.length === 1,
    "Each streamed turn must emit exactly one turn.started event.",
    buildContractContext({
      label,
      events,
    }),
  );
  assertWithContext(
    turnStartedIndex !== undefined &&
      terminalIndex >= 0 &&
      turnStartedIndex < terminalIndex,
    "turn.started must occur before the terminal event.",
    buildContractContext({
      label,
      events,
    }),
  );

  assertWithContext(
    turnStartedEvent !== undefined &&
      isDeepStrictEqual(turnStartedEvent.input, expectedInput),
    "turn.started must preserve the normalized input payload.",
    buildContractContext({
      label,
      events,
    }),
  );
}

export function assertSessionStartLifecycle(params: {
  events: AgentEvent[];
  label: string;
}): void {
  const { events, label } = params;
  const sessionStartedIndices = events
    .map((event, index) => (event.type === "session.started" ? index : -1))
    .filter((index) => index >= 0);
  const turnStartedIndex = events.findIndex((event) => event.type === "turn.started");
  const sessionStartedIndex = sessionStartedIndices[0];

  assertWithContext(
    sessionStartedIndices.length === 1,
    "New streamed sessions must emit exactly one session.started event.",
    buildContractContext({
      label,
      events,
    }),
  );
  assertWithContext(
    sessionStartedIndex !== undefined &&
      turnStartedIndex >= 0 &&
      sessionStartedIndex < turnStartedIndex,
    "session.started must occur before turn.started on a new streamed turn.",
    buildContractContext({
      label,
      events,
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
