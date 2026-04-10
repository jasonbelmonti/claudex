import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "@jasonbelmonti/claudex/ingest";
import { createSessionIngestService } from "@jasonbelmonti/claudex/ingest";
import { createCodexTranscriptIngestRegistry } from "../../src/ingest/codex";
import { INGEST_LIVE_FIXTURE_REQUIRED_FIELDS } from "./audit-matrix";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)),
  );
});

type LiveFixtureMetadata = {
  expected: {
    eventTypes: ObservedAgentEvent["event"]["type"][];
    resultText: string;
    sessionId: string;
    warningCodes: IngestWarning["code"][];
  };
  [key: string]: unknown;
};

async function readCodexFixture(name: string): Promise<string> {
  return Bun.file(new URL(`../fixtures/codex/${name}`, import.meta.url)).text();
}

async function readCodexFixtureMetadata(
  name: string,
): Promise<LiveFixtureMetadata> {
  return Bun.file(new URL(`../fixtures/codex/${name}`, import.meta.url)).json();
}

const liveCodexParityTest = Bun.env.CLAUDEX_AUDIT_LIVE === "1" ? test : test.skip;

liveCodexParityTest(
  "sanitized live Codex transcript excerpt replays against declared parity expectations",
  async () => {
    const fixture = await readCodexFixture("live-transcript-excerpt.jsonl");
    const metadata = await readCodexFixtureMetadata(
      "live-transcript-excerpt.fixture.json",
    );
    const workspace = await createFixtureWorkspace({
      "codex/live-transcript.jsonl": fixture,
    });
    workspaces.push(workspace);

    const root = {
      provider: "codex" as const,
      path: join(workspace, "codex"),
      metadata: {
        lane: "live-parity",
      },
    };

    const observedEvents: ObservedAgentEvent[] = [];
    const observedSessions: ObservedSessionRecord[] = [];
    const warnings: IngestWarning[] = [];
    const service = createSessionIngestService({
      roots: [root],
      registries: [createCodexTranscriptIngestRegistry()],
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

    for (const field of INGEST_LIVE_FIXTURE_REQUIRED_FIELDS) {
      expect(metadata[field]).toBeDefined();
    }

    expect(metadata.scenarioId).toBe("live-codex-replay-parity");
    expect(observedEvents.map((record) => record.event.type)).toEqual(
      metadata.expected.eventTypes,
    );
    expect(warnings.map((warning) => warning.code)).toEqual(
      metadata.expected.warningCodes,
    );
    expect(observedSessions.at(-1)).toMatchObject({
      observedSession: {
        sessionId: metadata.expected.sessionId,
        state: "canonical",
      },
    });

    const completedEvent = observedEvents.at(-1)?.event;
    expect(completedEvent?.type).toBe("turn.completed");
    if (completedEvent?.type !== "turn.completed") {
      throw new Error("Expected live Codex replay to end with turn.completed.");
    }

    expect(completedEvent.result.text).toBe(metadata.expected.resultText);
  },
);
