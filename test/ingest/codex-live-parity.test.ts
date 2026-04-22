import { expect, test } from "#test-support";

import {
  createCodexSessionIndexIngestRegistry,
  createCodexTranscriptIngestRegistry,
} from "../../src/ingest/codex/index.js";
import {
  assertLiveParityReplay,
  replayLiveParityFixture,
} from "./live-parity-helpers.js";

const liveCodexParityTest = process.env.CLAUDEX_AUDIT_LIVE === "1" ? test : test.skip;

const CODEX_LIVE_PARITY_CASES = [
  {
    title:
      "sanitized live Codex transcript excerpt replays against declared parity expectations",
    fixtureName: "live-transcript-excerpt.jsonl",
    metadataName: "live-transcript-excerpt.fixture.json",
    workspacePath: "codex/live-transcript.jsonl",
    registries: [createCodexTranscriptIngestRegistry()],
    lane: "live-transcript-parity",
  },
  {
    title:
      "sanitized live Codex session-index excerpt replays against declared parity expectations",
    fixtureName: "live-session-index-excerpt.jsonl",
    metadataName: "live-session-index-excerpt.fixture.json",
    workspacePath: "codex/session-index.jsonl",
    registries: [createCodexSessionIndexIngestRegistry()],
    lane: "live-session-index-parity",
  },
] as const;

for (const parityCase of CODEX_LIVE_PARITY_CASES) {
  liveCodexParityTest(parityCase.title, async () => {
    const result = await replayLiveParityFixture({
      provider: "codex",
      ...parityCase,
    });

    assertLiveParityReplay({
      result,
      scenarioId: "live-codex-replay-parity",
    });

    expect(
      result.observedEvents[0]?.source.metadata ??
        result.observedSessions[0]?.source.metadata,
    ).toEqual({
      lane: parityCase.lane,
    });

    if (parityCase.fixtureName === "live-transcript-excerpt.jsonl") {
      expect(result.observedSessions.at(-1)).toMatchObject({
        observedSession: {
          sessionId: "live-codex-bel-632",
          state: "canonical",
        },
      });
    }
  });
}
