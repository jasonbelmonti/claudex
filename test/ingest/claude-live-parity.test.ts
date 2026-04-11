import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestWarning,
  ObservedAgentEvent,
} from "@jasonbelmonti/claudex/ingest";
import { createSessionIngestService } from "@jasonbelmonti/claudex/ingest";
import { createClaudeTranscriptIngestRegistry } from "../../src/ingest/claude";
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
    completeness: Array<"complete" | "partial" | "best-effort">;
    eventTypes: ObservedAgentEvent["event"]["type"][];
    resultText: string;
    sessionId: string;
    stopReason: string;
    warningCodes: IngestWarning["code"][];
    workingDirectory: string;
  };
  [key: string]: unknown;
};

async function readClaudeFixture(name: string): Promise<string> {
  return Bun.file(new URL(`../fixtures/claude/${name}`, import.meta.url)).text();
}

async function readClaudeFixtureMetadata(
  name: string,
): Promise<LiveFixtureMetadata> {
  return Bun.file(new URL(`../fixtures/claude/${name}`, import.meta.url)).json();
}

function repeatValue<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value);
}

const liveClaudeParityTest = Bun.env.CLAUDEX_AUDIT_LIVE === "1"
  ? test
  : test.skip;

liveClaudeParityTest(
  "sanitized live Claude transcript excerpt replays against declared parity expectations",
  async () => {
    const fixture = await readClaudeFixture("live-transcript-excerpt.jsonl");
    const metadata = await readClaudeFixtureMetadata(
      "live-transcript-excerpt.fixture.json",
    );
    const workspace = await createFixtureWorkspace({
      "claude/live-transcript.jsonl": fixture,
    });
    workspaces.push(workspace);

    const observedEvents: ObservedAgentEvent[] = [];
    const warnings: IngestWarning[] = [];
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
      metadata: {
        lane: "live-parity",
      },
    };
    const service = createSessionIngestService({
      roots: [root],
      registries: [createClaudeTranscriptIngestRegistry()],
      onObservedEvent(record) {
        observedEvents.push(record);
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    });

    await service.scanNow();

    for (const field of INGEST_LIVE_FIXTURE_REQUIRED_FIELDS) {
      expect(metadata[field]).toBeDefined();
    }

    const { expected } = metadata;

    expect(metadata.scenarioId).toBe("live-claude-replay-parity");
    expect(observedEvents.map((record) => record.event.type)).toEqual(
      expected.eventTypes,
    );
    expect(observedEvents.map((record) => record.completeness)).toEqual(
      expected.completeness,
    );
    expect(warnings.map((warning) => warning.code)).toEqual(
      expected.warningCodes,
    );
    expect(
      observedEvents.map((record) => record.observedSession?.sessionId),
    ).toEqual(
      repeatValue(expected.sessionId, expected.eventTypes.length),
    );
    expect(
      observedEvents.map((record) => record.observedSession?.workingDirectory),
    ).toEqual(
      repeatValue(expected.workingDirectory, expected.eventTypes.length),
    );

    expect(observedEvents[0]).toMatchObject({
      source: {
        metadata: { lane: "live-parity" },
      },
      event: {
        type: "turn.started",
        input: {
          prompt: "<sanitized user request>",
        },
        extensions: {
          cwd: expected.workingDirectory,
        },
      },
    });

    const completedEvent = observedEvents.at(-1)?.event;
    expect(completedEvent?.type).toBe("turn.completed");
    if (completedEvent?.type !== "turn.completed") {
      throw new Error("Expected live Claude replay to end with turn.completed.");
    }

    expect(completedEvent.result).toMatchObject({
      text: expected.resultText,
      stopReason: expected.stopReason,
      usage: {
        tokens: {
          input: 12,
          output: 7,
        },
      },
    });
  },
);
