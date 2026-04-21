import { expect, readJsonFile, readTextFile } from "#test-support";
import { join } from "node:path";

import type { ProviderId } from "@jasonbelmonti/claudex";
import {
  createSessionIngestService,
  type IngestProviderRegistry,
} from "@jasonbelmonti/claudex/ingest";

import type {
  IngestWarning,
  ObservedAgentEvent,
  ObservedEventCompleteness,
  ObservedSessionIdentityState,
  ObservedSessionReason,
  ObservedSessionRecord,
} from "@jasonbelmonti/claudex/ingest";

import { INGEST_LIVE_FIXTURE_REQUIRED_FIELDS } from "./audit-matrix.js";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers.js";

export type LiveParityExpectedEventStream = {
  eventTypes: ObservedAgentEvent["event"]["type"][];
  completeness: ObservedEventCompleteness[];
  observedSession?: {
    sessionId: string;
    state: ObservedSessionIdentityState;
    workingDirectory?: string;
    metadata?: Record<string, unknown>;
  };
};

export type LiveParityExpectedSessionRecord = {
  reason: ObservedSessionReason;
  completeness: ObservedEventCompleteness;
  sessionId?: string;
  sessionIdStartsWith?: string;
  state: ObservedSessionIdentityState;
  workingDirectory?: string;
  metadata?: Record<string, unknown>;
};

export type LiveParityExpectedTerminalResult = {
  text: string;
  stopReason?: string | null;
  usage?: Record<string, unknown>;
};

export type LiveParityFixtureMetadata = {
  scenarioId: string;
  provider: string;
  sourceFamilies: string[];
  expected: {
    events: LiveParityExpectedEventStream;
    sessions: LiveParityExpectedSessionRecord[];
    warnings: {
      codes: IngestWarning["code"][];
    };
    terminalResult?: LiveParityExpectedTerminalResult;
    unsupportedObserved?: string[];
  };
  [key: string]: unknown;
};

export type LiveParityFixtureCase = {
  provider: ProviderId;
  fixtureName: string;
  metadataName: string;
  workspacePath: string;
  lane: string;
  registries: readonly IngestProviderRegistry[];
};

export type LiveParityReplayResult = {
  metadata: LiveParityFixtureMetadata;
  observedEvents: ObservedAgentEvent[];
  observedSessions: ObservedSessionRecord[];
  warnings: IngestWarning[];
};

export function assertRequiredLiveFixtureFields(
  metadata: Record<string, unknown>,
): void {
  for (const field of INGEST_LIVE_FIXTURE_REQUIRED_FIELDS) {
    expect(metadata[field]).toBeDefined();
  }
}

export function assertObservedEventParity(params: {
  observedEvents: ObservedAgentEvent[];
  expected: LiveParityExpectedEventStream;
}): void {
  expect(params.observedEvents.map((record) => record.event.type)).toEqual(
    params.expected.eventTypes,
  );
  expect(params.observedEvents.map((record) => record.completeness)).toEqual(
    params.expected.completeness,
  );

  if (!params.expected.observedSession) {
    return;
  }

  expect(
    params.observedEvents.map((record) => summarizeObservedSession(record)),
  ).toEqual(
    Array.from(
      { length: params.expected.eventTypes.length },
      () => params.expected.observedSession,
    ),
  );
}

export function assertObservedSessionParity(params: {
  observedSessions: ObservedSessionRecord[];
  expected: LiveParityExpectedSessionRecord[];
}): void {
  expect(params.observedSessions).toHaveLength(params.expected.length);

  for (const [index, expectedSession] of params.expected.entries()) {
    const observedSession = params.observedSessions[index];
    expect(observedSession).toBeDefined();

    if (!observedSession) {
      continue;
    }

    expect(observedSession.reason).toBe(expectedSession.reason);
    expect(observedSession.completeness).toBe(expectedSession.completeness);
    expect(observedSession.observedSession.state).toBe(expectedSession.state);
    expect(observedSession.observedSession.workingDirectory).toBe(
      expectedSession.workingDirectory,
    );
    expect(observedSession.observedSession.metadata).toEqual(
      expectedSession.metadata,
    );

    if (expectedSession.sessionId !== undefined) {
      expect(observedSession.observedSession.sessionId).toBe(
        expectedSession.sessionId,
      );
    }

    if (expectedSession.sessionIdStartsWith !== undefined) {
      expect(observedSession.observedSession.sessionId.startsWith(
        expectedSession.sessionIdStartsWith,
      )).toBeTruthy();
    }
  }
}

export function assertObservedWarnings(params: {
  warnings: IngestWarning[];
  expectedCodes: IngestWarning["code"][];
}): void {
  expect(params.warnings.map((warning) => warning.code)).toEqual(
    params.expectedCodes,
  );
}

export async function replayLiveParityFixture(
  parityCase: LiveParityFixtureCase,
): Promise<LiveParityReplayResult> {
  const fixture = await readLiveFixtureText(
    parityCase.provider,
    parityCase.fixtureName,
  );
  const metadata = await readLiveFixtureMetadata(
    parityCase.provider,
    parityCase.metadataName,
  );
  const workspace = await createFixtureWorkspace({
    [parityCase.workspacePath]: fixture,
  });

  try {
    const observedEvents: ObservedAgentEvent[] = [];
    const observedSessions: ObservedSessionRecord[] = [];
    const warnings: IngestWarning[] = [];
    const service = createSessionIngestService({
      roots: [
        {
          provider: parityCase.provider,
          path: join(workspace, parityCase.provider),
          metadata: {
            lane: parityCase.lane,
          },
        },
      ],
      registries: [...parityCase.registries],
      onObservedEvent(record) {
        observedEvents.push(record);
      },
      onObservedSession(record) {
        observedSessions.push(record);
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    });

    await service.scanNow();

    return {
      metadata,
      observedEvents,
      observedSessions,
      warnings,
    };
  } finally {
    await removeFixtureWorkspace(workspace);
  }
}

export function assertLiveParityReplay(params: {
  result: LiveParityReplayResult;
  scenarioId: string;
}): void {
  assertRequiredLiveFixtureFields(params.result.metadata);
  expect(params.result.metadata.scenarioId).toBe(params.scenarioId);
  assertObservedEventParity({
    observedEvents: params.result.observedEvents,
    expected: params.result.metadata.expected.events,
  });
  assertObservedSessionParity({
    observedSessions: params.result.observedSessions,
    expected: params.result.metadata.expected.sessions,
  });
  assertObservedWarnings({
    warnings: params.result.warnings,
    expectedCodes: params.result.metadata.expected.warnings.codes,
  });
  assertObservedTerminalResult({
    observedEvents: params.result.observedEvents,
    expected: params.result.metadata.expected.terminalResult,
  });
}

export function assertObservedTerminalResult(params: {
  observedEvents: ObservedAgentEvent[];
  expected?: LiveParityExpectedTerminalResult;
}): void {
  const completedEvent = params.observedEvents.at(-1)?.event;

  if (params.expected === undefined) {
    if (completedEvent?.type === "turn.completed") {
      throw new Error(
        "Expected live parity fixture without terminal result to avoid turn.completed.",
      );
    }

    return;
  }

  expect(completedEvent?.type).toBe("turn.completed");

  if (completedEvent?.type !== "turn.completed") {
    throw new Error("Expected live parity fixture to end with turn.completed.");
  }

  expect(completedEvent.result.text).toBe(params.expected.text);
  expect(completedEvent.result.stopReason).toBe(params.expected.stopReason);

  if (params.expected.usage) {
    expect(completedEvent.result.usage).toMatchObject(params.expected.usage);
  }
}

function summarizeObservedSession(
  record: ObservedAgentEvent,
): LiveParityExpectedEventStream["observedSession"] | null {
  if (record.observedSession === null) {
    return null;
  }

  return {
    sessionId: record.observedSession.sessionId,
    state: record.observedSession.state,
    workingDirectory: record.observedSession.workingDirectory,
    metadata: record.observedSession.metadata,
  };
}

async function readLiveFixtureText(
  provider: ProviderId,
  name: string,
): Promise<string> {
  return readTextFile(resolveLiveFixtureUrl(provider, name));
}

async function readLiveFixtureMetadata(
  provider: ProviderId,
  name: string,
): Promise<LiveParityFixtureMetadata> {
  return readJsonFile(resolveLiveFixtureUrl(provider, name));
}

function resolveLiveFixtureUrl(provider: ProviderId, name: string): URL {
  return new URL(`../fixtures/${provider}/${name}`, import.meta.url);
}
